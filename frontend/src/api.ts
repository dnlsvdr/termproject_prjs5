const API_BASE = import.meta.env.VITE_API_BASE_URL;

export interface User {
  id: string;
  email: string;
  role: "user" | "admin";
}

export interface RegisteredUser {
  email: string;
  role: User["role"];
  registeredOn: string;
}

async function request<T>(
  path: string,
  body?: Record<string, string>,
  method: "GET" | "POST" | "PATCH" | "DELETE" =
    body === undefined ? "GET" : "POST",
): Promise<T> {
  const options: RequestInit = {
    method,
    credentials: "include",
  };

  if (body !== undefined) {
    options.headers = {
      "Content-Type": "application/json",
      "X-Requested-With": "Q2AClient",
    };
    options.body = JSON.stringify(body);
  }

  let response: Response;

  try {
    response = await fetch(`${API_BASE}${path}`, options);
  } catch {
    throw new Error("Could not reach the API. Check that the backend is running.");
  }

  const data = await response.json();

  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "Request failed.");
  }

  return data as T;
}
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function register(email: string, password: string) {
  return request<{ user: User }>("/api/auth/register", { email, password });
}

export function login(email: string, password: string) {
  return request<{ user: User }>("/api/auth/login", { email, password });
}

export function getCurrentUser() {
  return request<{ user: User }>("/api/auth/me");
}

export function logout() {
  return request<{ message: string }>("/api/auth/logout", {});
}

export function getAdminUsers() {
  return request<{ users: RegisteredUser[] }>("/api/admin/users");
}

export function getAdminUsage() {
  return request<{ totalRequests: number }>("/api/admin/usage");
}

export interface Draft {
  id: string;
  title: string;
  body: string;
}

export function getDrafts() {
  return request<{ questions: Draft[] }>("/api/questions");
}

export function createDraft(title: string, body: string) {
  return request<{ question: Draft }>("/api/questions", { title, body });
}

export function updateDraft(id: string, title: string, body: string) {
  return request<{ question: Draft }>(
    `/api/questions/${encodeURIComponent(id)}`,
    { title, body },
    "PATCH",
  );
}

export function deleteDraft(id: string) {
  return request<{ message: string }>(
    `/api/questions/${encodeURIComponent(id)}`,
    {},
    "DELETE",
  );
}
