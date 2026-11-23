import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { z } from "zod";

interface DraftRow extends RowDataPacket {
  id: string;
  title: string;
  body: string;
}

const draftSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
}).strict();

const updateSchema = draftSchema.partial().refine(
  (draft) => draft.title !== undefined || draft.body !== undefined,
);

export function createQuestionsRouter(pool: Pool) {
  const router = Router();

  // GET /api/questions
  router.get("/", async (_req, res) => {
    const userId: string = res.locals.user.id;

    const [questions] = await pool.execute<DraftRow[]>(
      `SELECT id, title, body
       FROM questions
       WHERE user_id = ?
       ORDER BY created_at DESC, id DESC`,
      [userId],
    );

    res.json({ questions });
  });

  // POST /api/questions
  router.post("/", async (req, res) => {
    const parsed = draftSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Enter a title of 1–200 characters and a question of 1–2000 characters.",
      });
      return;
    }

    const userId: string = res.locals.user.id;
    const id = randomUUID();
    const { title, body } = parsed.data;

    await pool.execute(
      `INSERT INTO questions (id, user_id, title, body)
       VALUES (?, ?, ?, ?)`,
      [id, userId, title, body],
    );

    res.status(201).json({ question: { id, title, body } });
  });

  // PATCH /api/questions/:id
  router.patch("/:id", async (req, res) => {
    const parsed = updateSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        error: "Provide a valid title or question to update.",
      });
      return;
    }

    const userId: string = res.locals.user.id;
    const id = req.params.id;
    const { title, body } = parsed.data;

    await pool.execute(
      `UPDATE questions
       SET title = COALESCE(?, title),
           body = COALESCE(?, body)
       WHERE id = ? AND user_id = ?`,
      [title ?? null, body ?? null, id, userId],
    );

    // Reading the row also handles saving an edit with unchanged text.
    const [rows] = await pool.execute<DraftRow[]>(
      `SELECT id, title, body
       FROM questions
       WHERE id = ? AND user_id = ?`,
      [id, userId],
    );

    if (!rows[0]) {
      res.status(404).json({ error: "Draft not found." });
      return;
    }

    res.json({ question: rows[0] });
  });

  // DELETE /api/questions/:id
  router.delete("/:id", async (req, res) => {
    const userId: string = res.locals.user.id;

    const [result] = await pool.execute<ResultSetHeader>(
      "DELETE FROM questions WHERE id = ? AND user_id = ?",
      [req.params.id, userId],
    );

    if (result.affectedRows === 0) {
      res.status(404).json({ error: "Draft not found." });
      return;
    }

    res.json({ message: "Draft deleted." });
  });

  return router;
}