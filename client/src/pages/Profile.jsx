import { useRef, useState } from "react";
import { Camera, Trash2, Check, Loader2 } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "../components/Avatar";

const inputCls =
  "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none transition-colors focus:border-indigo-500";
const SIZE = 256;
const MAX_CHARS = 60000; // the server accepts up to 70000

// Centre-crop to a square and shrink, so a 12 MB phone photo becomes ~30 KB.
async function toAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error("That file isn't an image we can read"));
      i.src = url;
    });
    const side = Math.min(img.width, img.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; // JPEG has no alpha; keep transparent PNGs from going black
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const out = canvas.toDataURL("image/jpeg", quality);
      if (out.length <= MAX_CHARS) return out;
    }
    throw new Error("That image is too detailed to shrink. Try another one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const errText = (err, fallback) => err.response?.data?.message || err.userMessage || err.message || fallback;

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name: user?.name || "",
    username: user?.username || "",
    jobTitle: user?.jobTitle || "",
    bio: user?.bio || "",
  });
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const set = (key) => (e) => {
    setForm({ ...form, [key]: e.target.value });
    setSaved(false);
  };

  const changePhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError("");
    setPhotoBusy(true);
    try {
      await updateProfile({ avatar: await toAvatar(file) });
    } catch (err) {
      setError(errText(err, "Could not update your photo"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = async () => {
    setError("");
    setPhotoBusy(true);
    try {
      await updateProfile({ avatar: null });
    } catch (err) {
      setError(errText(err, "Could not remove your photo"));
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    setSaving(true);
    try {
      const next = await updateProfile(form);
      setForm({ name: next.name, username: next.username || "", jobTitle: next.jobTitle, bio: next.bio });
      setSaved(true);
    } catch (err) {
      setError(errText(err, "Could not save your profile"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <h1 className="text-2xl font-bold">Your profile</h1>
      <p className="mt-1 text-sm text-slate-400">How you appear to the people you work with.</p>

      <div className="mt-6 flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <Avatar user={user} size={80} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{user?.name}</p>
          <p className="truncate text-sm text-slate-500">{user?.username ? `@${user.username}` : user?.email}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={changePhoto} className="hidden" />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={photoBusy}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {photoBusy ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              {user?.avatar ? "Change photo" : "Add photo"}
            </button>
            {user?.avatar && (
              <button
                type="button"
                onClick={removePhoto}
                disabled={photoBusy}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-50"
              >
                <Trash2 size={14} /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Name</label>
          <input className={inputCls} value={form.name} onChange={set("name")} maxLength={60} required />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
          <input
            className={inputCls}
            value={form.username}
            onChange={set("username")}
            placeholder="optional, e.g. jane_doe"
            autoCapitalize="none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Job title</label>
          <input className={inputCls} value={form.jobTitle} onChange={set("jobTitle")} maxLength={60} />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-300">Bio</label>
          <textarea className={inputCls} rows={3} value={form.bio} onChange={set("bio")} maxLength={160} />
          <p className="mt-1 text-right text-xs text-slate-500">{form.bio.length}/160</p>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />} Save changes
          </button>
          {saved && (
            <span className="flex items-center gap-1 text-sm text-emerald-400">
              <Check size={14} /> Saved
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
