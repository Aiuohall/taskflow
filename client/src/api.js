import axios from "axios";

// In dev, "/api" is proxied to localhost:5000 by Vite. In production,
// set VITE_API_URL to the deployed API, e.g. https://taskflow-api.onrender.com/api
const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("taskflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// On 401, clear the session and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && !err.config.url.includes("/auth/")) {
      localStorage.removeItem("taskflow_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
