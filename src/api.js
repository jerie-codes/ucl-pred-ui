// Default to production backend; override with VITE_API_BASE_URL in Vercel/env
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://ucl-pred-backend.onrender.com/api";

export async function fetchForecast() {
  const response = await fetch(`${API_BASE_URL}/forecast/`);
  if (!response.ok) {
    throw new Error("Could not load forecast data.");
  }
  return response.json();
}

export async function fetchMatchDetail(matchId) {
  const response = await fetch(`${API_BASE_URL}/matches/${matchId}/`);
  if (!response.ok) {
    throw new Error("Could not load live match details.");
  }
  return response.json();
}

export async function fetchMatchVotes() {
  const response = await fetch(`${API_BASE_URL}/match-votes/`);
  if (!response.ok) {
    throw new Error("Could not load match votes.");
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
    throw new Error("Could not load predictions.");
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
