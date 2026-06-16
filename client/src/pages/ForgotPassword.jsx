import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500";

export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("request"); // "request" | "reset"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submitRequest = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await forgotPassword(email);
      setStep("reset");
      setInfo(`If an account exists for ${email}, a 6-digit code is on its way.`);
    } catch (err) {
      setError(err.response?.data?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await resetPassword(email, code, password);
      navigate("/"); // resetPassword logs the user in on success
    } catch (err) {
      setError(err.response?.data?.message || "Could not reset password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500">
            <KeyRound size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-slate-400">
            {step === "request"
              ? "Enter your email and we'll send you a reset code"
              : "Enter the code and choose a new password"}
          </p>
        </div>

        {step === "request" ? (
          <form onSubmit={submitRequest} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" autoFocus />
            </div>
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50">
              {busy ? "Sending..." : "Send reset code"}
            </button>
            <p className="text-center text-sm text-slate-400">
              <Link to="/login" className="inline-flex items-center gap-1 font-medium text-indigo-400 hover:text-indigo-300">
                <ArrowLeft size={14} /> Back to sign in
              </Link>
            </p>
          </form>
        ) : (
          <form onSubmit={submitReset} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {info && <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-sm text-indigo-300">{info}</p>}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Reset code</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${inputCls} text-center text-2xl font-bold tracking-[0.5em]`}
                placeholder="000000"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">New password</label>
              <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 6 characters" />
            </div>
            <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50">
              {busy ? "Resetting..." : "Reset password"}
            </button>
            <button type="button" onClick={() => { setStep("request"); setError(""); setInfo(""); }} className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
              <ArrowLeft size={14} /> Use a different email
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
