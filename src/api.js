const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8000/api";

export async function fetchForecast() {
  const response = await fetch(`${API_BASE_URL}/forecast/`);
  if (!response.ok) {
    throw new Error("Could not load forecast data.");
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
