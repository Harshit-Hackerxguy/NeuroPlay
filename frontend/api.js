import { getToken } from "./auth.js";

const API_BASE_URL = "https://neuroplay-backend.onrender.com";

async function apiRequest(path, options = {}) {
  const token = getToken();
  const headers = {
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(err || "API request failed");
  }

  return response.json();
}

export async function saveSessionMetrics(metrics) {
  return apiRequest("/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(metrics)
  });
}

export async function fetchPatientSessions({ userId = "", gameName = "", limit = "" } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set("userId", userId);
  if (gameName) params.set("gameName", gameName);
  if (limit) params.set("limit", String(limit));

  return apiRequest(`/sessions?${params.toString()}`);
}

export async function fetchMySessions({ gameName = "" } = {}) {
  const params = new URLSearchParams();
  if (gameName) params.set("gameName", gameName);
  return apiRequest(`/my-sessions?${params.toString()}`);
}

export async function checkApiHealth() {
  return apiRequest("/health");
}
