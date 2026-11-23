import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { z } from "zod";
import type { Config } from "./config.js";
import { recordApiUsage } from "./api-usage.js";

interface UsageCountRow extends RowDataPacket {
  total: number;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
}

const assistRequestSchema = z.object({
  prompt: z.string().trim().min(5).max(2000),
}).strict();

const aiSuggestionSchema = z.object({
  suggestedTitle: z.string().min(1).max(200),
  refinedBody: z.string().min(1).max(2000),
  guidance: z.string().min(1).max(4000),
});

async function getUserUsageCount(pool: Pool, userId: string): Promise<number> {
  const [rows] = await pool.execute<UsageCountRow[]>(
    "SELECT COUNT(*) AS total FROM api_usage WHERE user_id = ?",
    [userId],
  );
  return Number(rows[0]?.total ?? 0);
}

export function createAiRouter(pool: Pool, config: Config) {
  const router = Router();

  const aiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      error: "Too many AI requests. Please wait a few minutes and try again.",
    },
  });

  // GET /api/ai/usage
  router.get("/usage", async (_req, res) => {
    const userId: string = res.locals.user.id;
    const usageCount = await getUserUsageCount(pool, userId);
    res.json({ usageCount });
  });

  // POST /api/ai/assist
  router.post("/assist", aiLimiter, async (req, res) => {
    const parsed = assistRequestSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Enter a question or topic between 5 and 2000 characters.",
      });
      return;
    }

    const userId: string = res.locals.user.id;
    const endpointUrl = `${config.AI_API_BASE_URL.replace(/\/+$/, "")}/chat/completions`;

    let upstreamResponse: Response;

    try {
      upstreamResponse = await fetch(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.AI_API_KEY}`,
        },
        body: JSON.stringify({
          model: config.AI_MODEL,
          temperature: 0.4,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a helpful Q&A forum assistant. Given a user's rough question or problem, respond ONLY with a valid JSON object containing exactly three string keys: " +
                '"suggestedTitle" (concise, searchable question title under 150 chars), ' +
                '"refinedBody" (clear, well-structured Q&A post body under 1500 chars), and ' +
                '"guidance" (a helpful, accurate preliminary answer or troubleshooting steps).',
            },
            {
              role: "user",
              content: parsed.data.prompt,
            },
          ],
        }),
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      res.status(502).json({
        error: "Could not reach the AI service. Please try again.",
      });
      return;
    }

    if (!upstreamResponse.ok) {
      res.status(502).json({
        error: `AI provider returned an error (${upstreamResponse.status}).`,
      });
      return;
    }

    const completion = (await upstreamResponse.json()) as ChatCompletionResponse;
    const rawContent = completion.choices?.[0]?.message?.content;

    if (!rawContent) {
      res.status(502).json({
        error: "AI provider returned an empty response.",
      });
      return;
    }

    let suggestion: z.infer<typeof aiSuggestionSchema>;

    try {
      const cleaned = rawContent
        .replace(/^```json\s*/i, "")
        .replace(/```\s*$/, "")
        .trim();
      suggestion = aiSuggestionSchema.parse(JSON.parse(cleaned));
    } catch {
      res.status(502).json({
        error: "AI provider returned an unexpected response format.",
      });
      return;
    }

await recordApiUsage(pool, userId, "/api/ai/assist", 200);

    const usageCount = await getUserUsageCount(pool, userId);

    res.json({
      suggestion,
      usageCount,
    });
  });

  return router;
}