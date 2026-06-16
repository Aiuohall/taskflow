import { createContext, useContext, useEffect, useState } from "react";
import api from "../api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("taskflow_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch((err) => {
        // Only drop the session if the token is actually rejected —
        // a network blip (e.g. API restarting) shouldn't log the user out.
        if (err.response?.status === 401) localStorage.removeItem("taskflow_token");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAuth = (data) => {
    localStorage.setItem("taskflow_token", data.token);
    setUser(data.user);
  };

  const login = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    handleAuth(res.data);
  };

  // Step 1 of registration — sends a verification code, no token yet.
  const registerStart = (name, email, password) =>
    api.post("/auth/register", { name, email, password });

  // Step 2 — verify the code and finish creating the account.
  const verifyRegistration = async (email, code) => {
    const res = await api.post("/auth/register/verify", { email, code });
    handleAuth(res.data);
  };

  const resendCode = (email) => api.post("/auth/register/resend", { email });

  const forgotPassword = (email) => api.post("/auth/forgot-password", { email });

  const resetPassword = async (email, code, password) => {
    const res = await api.post("/auth/reset-password", { email, code, password });
    handleAuth(res.data);
  };

  const demoLogin = async () => {
    const res = await api.post("/auth/demo");
    handleAuth(res.data);
  };

  const logout = () => {
    localStorage.removeItem("taskflow_token");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        registerStart,
        verifyRegistration,
        resendCode,
        forgotPassword,
        resetPassword,
        demoLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
