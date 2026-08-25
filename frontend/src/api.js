export const TOKEN_KEY = "ssk_token";
export const USER_KEY = "ssk_user";
export const PREFS_KEY = "ssk_prefs";
export const DARK_KEY = "ssk_dark";

export function authHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export async function apiGet(path) {
  const response = await fetch(path, { headers: authHeaders() });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export async function apiSend(path, method, body) {
  const response = await fetch(path, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export async function apiUpload(path, formData, method = "POST") {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Request failed");
  }
  return data;
}
