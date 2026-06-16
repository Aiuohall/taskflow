import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckSquare, MailCheck, ArrowLeft } from "lucide-react";
import { useAuth } from "../context/AuthContext";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500";

export default function Register() {
  const { registerStart, verifyRegistration, resendCode } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("details"); // "details" | "verify"
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const submitDetails = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await registerStart(form.name, form.email, form.password);
      setStep("verify");
      setInfo(`We sent a 6-digit code to ${form.email}`);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await verifyRegistration(form.email, code);
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.message || "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setInfo("");
    try {
      await resendCode(form.email);
      setInfo("A new code has been sent.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend code");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500">
            {step === "verify" ? (
              <MailCheck size={26} className="text-white" />
            ) : (
              <CheckSquare size={26} className="text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold">
            {step === "verify" ? "Check your email" : "Create your account"}
          </h1>
          <p className="text-sm text-slate-400">
            {step === "verify"
              ? "Enter the verification code to finish signing up"
              : "Start managing projects with TaskFlow"}
          </p>
        </div>

        {step === "details" ? (
          <form onSubmit={submitDetails} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Full name</label>
              <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="Your name" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
              <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} placeholder="you@example.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Password</label>
              <input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={inputCls} placeholder="At least 6 characters" />
            </div>
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50">
              {busy ? "Sending code..." : "Continue"}
            </button>
            <p className="text-center text-sm text-slate-400">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-indigo-400 hover:text-indigo-300">Sign in</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={submitCode} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {info && <p className="rounded-lg bg-indigo-500/10 px-3 py-2 text-sm text-indigo-300">{info}</p>}
            {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Verification code</label>
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
            <button type="submit" disabled={busy || code.length !== 6} className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50">
              {busy ? "Verifying..." : "Verify & create account"}
            </button>
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => { setStep("details"); setError(""); setInfo(""); }} className="flex items-center gap-1 text-slate-400 hover:text-slate-200">
                <ArrowLeft size={14} /> Back
              </button>
              <button type="button" onClick={handleResend} className="font-medium text-indigo-400 hover:text-indigo-300">
                Resend code
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
