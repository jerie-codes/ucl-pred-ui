// Prefer an explicit env override, then use the local Django API during local dev.
function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://127.0.0.1:8000/api";
    }
  }

  return "https://ucl-pred-backend.onrender.com/api";
}

const API_BASE_URL = getApiBaseUrl();

async function readError(response, fallbackMessage) {
  try {
    const data = await response.json();
    return data.error || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function fetchForecast() {
  const response = await fetch(`${API_BASE_URL}/forecast/`);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load forecast data."));
  }
  return response.json();
}

export async function fetchMatchDetail(matchId) {
  const response = await fetch(`${API_BASE_URL}/matches/${matchId}/`);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load live match details."));
  }
  return response.json();
}

export async function fetchMatchVotes() {
  const response = await fetch(`${API_BASE_URL}/match-votes/`);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load match votes."));
  }
  return response.json();
}

export async function submitPrediction(payload) {
  const response = await fetch(`${API_BASE_URL}/predictions/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not save prediction.");
  }
  return data;
}

export async function fetchPredictions() {
  const response = await fetch(`${API_BASE_URL}/predictions/`);
  if (!response.ok) {
    throw new Error(await readError(response, "Could not load predictions."));
  }
  return response.json();
}

export async function submitMatchVote(payload) {
  const response = await fetch(`${API_BASE_URL}/match-votes/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Could not save match vote.");
  }
  return data;
}
