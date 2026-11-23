import { getAdminUsage, getAdminUsers } from "./api";
import type { RegisteredUser } from "./api";

const search = document.querySelector<HTMLInputElement>("#admin-email-search")!;
const role = document.querySelector<HTMLSelectElement>("#admin-role-filter")!;
const refresh = document.querySelector<HTMLButtonElement>("#admin-refresh")!;
const results = document.querySelector<HTMLElement>("#admin-users-results")!;
const rows = document.querySelector<HTMLTableSectionElement>("#admin-users")!;
const usersStatus = document.querySelector<HTMLElement>("#admin-users-status")!;
const usageTotal = document.querySelector<HTMLElement>("#admin-usage-total")!;

let users: RegisteredUser[] | null = null;
let loadNumber = 0;

function renderUsers() {
  if (users === null) return;

  const query = search.value.trim().toLowerCase();
  const matches = users.filter((user) =>
    user.email.toLowerCase().includes(query) && (!role.value || user.role === role.value),
  );

  rows.replaceChildren();
  for (const user of matches) {
    const row = rows.insertRow();
    row.insertCell().textContent = user.email;
    const roleBadge = document.createElement("span");
    roleBadge.className = `admin-role admin-role--${user.role}`;
    roleBadge.textContent = user.role === "admin" ? "Administrator" : "User";
    row.insertCell().append(roleBadge);
    row.insertCell().textContent = user.registeredOn;
  }

  results.hidden = matches.length === 0;
  usersStatus.textContent = matches.length === 0
    ? "No matching users."
    : `Showing ${matches.length} of ${users.length} registered users.`;
}

export async function loadAdminDashboard() {
  const currentLoad = ++loadNumber;
  refresh.disabled = true;
  users = null;
  rows.replaceChildren();
  results.hidden = true;
  usersStatus.textContent = "Loading registered users…";
  usageTotal.textContent = "Loading API usage…";

  const [userList, usage] = await Promise.allSettled([getAdminUsers(), getAdminUsage()]);
  if (currentLoad !== loadNumber) return;

  if (userList.status === "fulfilled") {
    users = userList.value.users;
    renderUsers();
  } else {
    usersStatus.textContent = "Could not load registered users. Try refreshing.";
  }

  usageTotal.textContent = usage.status === "fulfilled"
    ? `${usage.value.totalRequests.toLocaleString()} recorded requests`
    : "Could not load API usage. Try refreshing.";
  refresh.disabled = false;
}

export function resetAdminDashboard() {
  // Ignore any response that arrives after the account has signed out.
  loadNumber++;
  users = null;
  search.value = "";
  role.value = "";
  rows.replaceChildren();
  results.hidden = true;
  usersStatus.textContent = "";
  usageTotal.textContent = "";
}

search.addEventListener("input", renderUsers);
role.addEventListener("change", renderUsers);
refresh.addEventListener("click", () => void loadAdminDashboard());
