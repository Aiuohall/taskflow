import axios from "axios";

// In dev, "/api" is proxied to localhost:5000 by Vite. In production,
// set VITE_API_URL to the deployed API, e.g. https://taskflow-api.onrender.com/api
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  // Without a timeout a stalled request hangs forever and the UI just spins.
  // 25s is comfortably above a warm response and below a cold start.
  timeout: 25000,
});

/*
 * Cold-start handling.
 *
 * Free API hosts (Render, Fly, Railway) suspend an idle instance and take
 * 30-60s to boot it again. The first request after an idle period therefore
 * times out, and the app looked simply broken. We now retry those requests
 * with a longer timeout, and publish a "waking" flag so the UI can explain the
 * wait instead of showing a spinner that appears stuck.
 */
const wakeListeners = new Set();
let waking = false;

export function onApiWaking(fn) {
  wakeListeners.add(fn);
  return () => wakeListeners.delete(fn);
}

function setWaking(value) {
  if (waking === value) return;
  waking = value;
  wakeListeners.forEach((fn) => fn(value));
}

const MAX_RETRIES = 1;

// Only a real timeout looks like a suspended instance booting. A network error
// (DNS failure, connection refused, blocked CORS preflight) means the API is
// misconfigured or down — retrying that just turns an instant, diagnosable
// failure into a two-minute spinner, which is the worst possible outcome.
const isColdStart = (err) => err.code === "ECONNABORTED";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("taskflow_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/*
 * Catch the single most confusing deployment mistake: VITE_API_URL not set on
 * the host. baseURL then falls back to "/api", those requests hit the Netlify
 * site itself, and the SPA redirect (/* -> /index.html 200) answers them with
 * the HTML page and a 200 status. Axios reports success, the app believes a
 * code was sent, and nothing ever arrives. Turn it into a loud error instead.
 */
function assertJson(res) {
  const looksLikeHtml =
    typeof res.data === "string" && /^\s*<(!doctype|html)/i.test(res.data);
  if (looksLikeHtml) {
    const err = new Error(
      "The API returned the web page instead of data — VITE_API_URL is not pointing at the backend. " +
        "Set it on the host to your API URL including /api, then redeploy."
    );
    err.isMisconfigured = true;
    console.error("[api]", err.message, "baseURL =", api.defaults.baseURL);
    throw err;
  }
}

api.interceptors.response.use(
  (res) => {
    setWaking(false);
    assertJson(res);
    return res;
  },
  async (err) => {
    const config = err.config;

    // Retry timeouts / network drops — these are the cold-start signature.
    // Anything with an HTTP status came from a live server and must not retry.
    if (config && isColdStart(err) && (config.__retryCount || 0) < MAX_RETRIES) {
      config.__retryCount = (config.__retryCount || 0) + 1;
      setWaking(true);
      config.timeout = 45000; // the boot itself can take most of a minute
      await new Promise((r) => setTimeout(r, 1500 * config.__retryCount));
      return api(config);
    }

    setWaking(false);

    // Give the UI something actionable. Axios's own "Network Error" tells a
    // user nothing, and it's the message they'd see most often when the API
    // host is down, asleep, or blocked by CORS.
    if (!err.response) {
      err.userMessage =
        err.code === "ECONNABORTED"
          ? "The server took too long to respond. It may be starting up — please try again in a minute."
          : "Can't reach the server. It may be down, or the API address / CORS settings may be wrong.";
    }

    // On 401, clear the session and bounce to login.
    if (err.response?.status === 401 && !config?.url?.includes("/auth/")) {
      localStorage.removeItem("taskflow_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
