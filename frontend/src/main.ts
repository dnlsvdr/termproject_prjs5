import "./style.css";
import {
  ApiError,
  createDraft,
  getAiUsage,
  getCurrentUser,
  login,
  logout,
  register,
  requestAiAssist,
} from "./api";
import type { AiSuggestion, User } from "./api";

const authView = document.querySelector<HTMLElement>("#auth-view")!;
const workspaceView = document.querySelector<HTMLElement>("#workspace-view")!;
const form = document.querySelector<HTMLFormElement>("#auth-form")!;
const title = document.querySelector<HTMLElement>("#form-title")!;
const emailInput = document.querySelector<HTMLInputElement>("#email")!;
const passwordInput = document.querySelector<HTMLInputElement>("#password")!;
const passwordHint = document.querySelector<HTMLElement>("#password-hint")!;
const submitButton = document.querySelector<HTMLButtonElement>("#submit-button")!;
const switchButton = document.querySelector<HTMLButtonElement>("#switch-mode")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button")!;
const userEmail = document.querySelector<HTMLElement>("#user-email")!;
const status = document.querySelector<HTMLElement>("#status")!;

const usageBadge = document.querySelector<HTMLElement>("#usage-badge")!;
const aiForm = document.querySelector<HTMLFormElement>("#ai-form")!;
const aiPromptInput = document.querySelector<HTMLTextAreaElement>("#ai-prompt")!;
const aiSubmitButton = document.querySelector<HTMLButtonElement>("#ai-submit")!;
const aiResult = document.querySelector<HTMLElement>("#ai-result")!;
const aiSuggestedTitle = document.querySelector<HTMLElement>("#ai-suggested-title")!;
const aiRefinedBody = document.querySelector<HTMLElement>("#ai-refined-body")!;
const aiGuidance = document.querySelector<HTMLElement>("#ai-guidance")!;
const saveDraftButton = document.querySelector<HTMLButtonElement>("#save-draft-button")!;

let latestSuggestion: AiSuggestion | null = null;

const formIntro = document.querySelector<HTMLElement>("#form-intro")!;
const switchLabel = document.querySelector<HTMLElement>("#switch-label")!;
const userInitial = document.querySelector<HTMLElement>("#user-initial")!;
const workspaceIntro = document.querySelector<HTMLElement>("#workspace-intro")!;
const adminNavButton = document.querySelector<HTMLButtonElement>("#admin-nav-button")!;
const navTabs = document.querySelectorAll<HTMLButtonElement>(".nav-tab");
const tabPanels: Record<string, HTMLElement> = {
  assistant: document.querySelector<HTMLElement>("#tab-assistant")!,
  drafts: document.querySelector<HTMLElement>("#tab-drafts")!,
  admin: document.querySelector<HTMLElement>("#tab-admin")!,
};

let mode: "login" | "register" = "login";
let currentUser: User | null = null;

function setActiveTab(tabName: "assistant" | "drafts" | "admin") {
  if (tabName === "admin" && currentUser?.role !== "admin") {
    return;
  }

  for (const button of navTabs) {
    const isSelected = button.dataset.tab === tabName;
    if (isSelected) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  }

  for (const [name, panel] of Object.entries(tabPanels)) {
    panel.hidden = name !== tabName;
  }
}

function showForm(nextMode: "login" | "register", message = "") {
  mode = nextMode;
  currentUser = null;
  const registering = mode === "register";

  workspaceView.hidden = true;
  authView.hidden = false;
  userEmail.textContent = "";
  adminNavButton.hidden = true;

  title.textContent = registering ? "Create your account" : "Welcome back";
  formIntro.textContent = registering
    ? "It takes less than a minute."
    : "Log in to your account.";

  submitButton.textContent = registering ? "Create account" : "Log in";
  switchLabel.textContent = registering ? "Already have an account?" : "New here?";
  switchButton.textContent = registering ? "Log in" : "Create an account";

  passwordInput.value = "";
  passwordInput.minLength = registering ? 12 : 1;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  passwordHint.hidden = !registering;

  if (registering) {
    passwordInput.removeAttribute("placeholder");
    passwordInput.setAttribute("aria-describedby", "password-hint");
  } else {
    passwordInput.placeholder = "Your password";
    passwordInput.removeAttribute("aria-describedby");
  }

  formIntro.after(status);
  status.textContent = message;
}

function showWorkspace(user: User) {
  currentUser = user;
  latestSuggestion = null;
  aiResult.hidden = true;
  aiPromptInput.value = "";

  authView.hidden = true;
  workspaceView.hidden = false;

  userEmail.textContent = user.email;
  userInitial.textContent = user.email.charAt(0).toUpperCase();
  workspaceIntro.textContent = `Signed in as ${user.email} (${user.role}).`;
  adminNavButton.hidden = user.role !== "admin";
  passwordInput.value = "";

  setActiveTab("assistant");
  workspaceIntro.after(status);
  status.textContent = "";

  void getAiUsage()
    .then(({ usageCount }) => {
      usageBadge.textContent = `API calls: ${usageCount}`;
    })
    .catch(() => {
      usageBadge.textContent = "API calls: —";
    });
}

function showError(error: unknown) {
  status.textContent =
    error instanceof Error ? error.message : "Something went wrong.";
}

for (const button of navTabs) {
  button.addEventListener("click", () => {
    const tab = button.dataset.tab;
    if (tab === "assistant" || tab === "drafts" || tab === "admin") {
      setActiveTab(tab);
    }
  });
}

switchButton.addEventListener("click", () => {
  showForm(mode === "login" ? "register" : "login");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  submitButton.disabled = true;
  switchButton.disabled = true;
  status.textContent = mode === "register" ? "Creating account…" : "Logging in…";

  try {
    if (mode === "register") {
      await register(email, password);
      showForm("login", "Account created. Enter your password to log in.");
      passwordInput.focus();
    } else {
      await login(email, password);
      const { user } = await getCurrentUser();
      showWorkspace(user);
    }
  } catch (error) {
    showError(error);
  } finally {
    submitButton.disabled = false;
    switchButton.disabled = false;
  }
});

aiForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const prompt = aiPromptInput.value.trim();
  if (!prompt) return;

  aiSubmitButton.disabled = true;
  status.textContent = "Generating AI response…";

  try {
    const { suggestion, usageCount } = await requestAiAssist(prompt);
    latestSuggestion = suggestion;

    aiSuggestedTitle.textContent = suggestion.suggestedTitle;
    aiRefinedBody.textContent = suggestion.refinedBody;
    aiGuidance.textContent = suggestion.guidance;
    usageBadge.textContent = `API calls: ${usageCount}`;

    aiResult.hidden = false;
    saveDraftButton.disabled = false;
    saveDraftButton.textContent = "Save Refined Question to Drafts";
    status.textContent = "";
  } catch (error) {
    showError(error);
  } finally {
    aiSubmitButton.disabled = false;
  }
});

saveDraftButton.addEventListener("click", async () => {
  if (!latestSuggestion) return;

  saveDraftButton.disabled = true;

  try {
    await createDraft(
      latestSuggestion.suggestedTitle,
      latestSuggestion.refinedBody,
    );
    saveDraftButton.textContent = "Saved to Drafts";
    status.textContent = "Refined question saved to your drafts.";
  } catch (error) {
    saveDraftButton.disabled = false;
    showError(error);
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;

  try {
    await logout();
    showForm("login", "You’re logged out.");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      showForm("login", "Your session has ended. Log in again.");
    } else {
      showError(error);
    }
  } finally {
    logoutButton.disabled = false;
  }
});

async function restoreSession() {
  try {
    const { user } = await getCurrentUser();
    showWorkspace(user);
  } catch (error) {
    showForm("login");

    // A first-time visitor has no session yet.
    if (!(error instanceof ApiError && error.status === 401)) {
      showError(error);
    }
  }
}

void restoreSession();