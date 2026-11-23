import "./style.css";
import { ApiError, getCurrentUser, login, logout, register } from "./api";
import type { User } from "./api";

const authView = document.querySelector<HTMLElement>("#auth-view")!;
const workspaceView = document.querySelector<HTMLElement>("#workspace-view")!;
const form = document.querySelector<HTMLFormElement>("#auth-form")!;
const title = document.querySelector<HTMLElement>("#form-title")!;
const emailInput = document.querySelector<HTMLInputElement>("#email")!;
const passwordInput = document.querySelector<HTMLInputElement>("#password")!;
const submitButton = document.querySelector<HTMLButtonElement>("#submit-button")!;
const switchButton = document.querySelector<HTMLButtonElement>("#switch-mode")!;
const logoutButton = document.querySelector<HTMLButtonElement>("#logout-button")!;
const userEmail = document.querySelector<HTMLElement>("#user-email")!;
const status = document.querySelector<HTMLElement>("#status")!;

const formIntro = document.querySelector<HTMLElement>("#form-intro")!;
const switchLabel = document.querySelector<HTMLElement>("#switch-label")!;
const userInitial = document.querySelector<HTMLElement>("#user-initial")!;
const workspaceIntro = document.querySelector<HTMLElement>("#workspace-intro")!;


let mode: "login" | "register" = "login";

function showForm(nextMode: "login" | "register", message = "") {
  mode = nextMode;
  const registering = mode === "register";

  workspaceView.hidden = true;
  authView.hidden = false;
  userEmail.textContent = "";

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
  authView.hidden = true;
  workspaceView.hidden = false;

  userEmail.textContent = user.email;
  userInitial.textContent = user.email.charAt(0).toUpperCase();
  passwordInput.value = "";

  workspaceIntro.after(status);
  status.textContent = "";
}

function showError(error: unknown) {
  status.textContent =
    error instanceof Error ? error.message : "Something went wrong.";
}

switchButton.addEventListener("click", () => {
  if (mode === "login") {
    showForm("register");
  } else {
    showForm("login");
  }
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