import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Trash2, Users, X } from "lucide-react";
import api from "../api";
import { useAuth } from "../context/AuthContext";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899"];

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", color: COLORS[0] });
  const [error, setError] = useState("");

  const load = () => {
    api
      .get("/projects")
      .then((res) => setProjects(res.data))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/projects", form);
      setShowModal(false);
      setForm({ name: "", description: "", color: COLORS[0] });
      load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create project");
    }
  };

  const handleDelete = async (e, id) => {
    e.preventDefault();
    if (!confirm("Delete this project and all its tasks?")) return;
    await api.delete(`/projects/${id}`);
    load();
  };

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="mt-1 text-sm text-slate-400">All projects you own or belong to</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <Plus size={16} />
          New project
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : projects.length === 0 ? (
        <div className="mt-16 text-center">
          <p className="text-slate-400">No projects yet.</p>
          <p className="mt-1 text-sm text-slate-500">Create your first project to get started.</p>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            const isOwner = p.owner._id === user.id;
            return (
              <Link
                key={p._id}
                to={`/projects/${p._id}`}
                className="group rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition-colors hover:border-slate-700"
              >
                <div className="flex items-start justify-between">
                  <div className="h-10 w-10 rounded-xl" style={{ background: p.color + "33" }}>
                    <div className="m-3 h-4 w-4 rounded-md" style={{ background: p.color }} />
                  </div>
                  {isOwner && (
                    <button
                      onClick={(e) => handleDelete(e, p._id)}
                      className="rounded-lg p-2 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-400 group-hover:opacity-100"
                      title="Delete project"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <h3 className="mt-3 font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 min-h-10 text-sm text-slate-400">
                  {p.description || "No description"}
                </p>
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>
                      {p.doneCount}/{p.taskCount} tasks
                    </span>
                    <span>{pct}%</span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: p.color }}
                    />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                  <Users size={14} />
                  {1 + p.members.length} member{p.members.length ? "s" : ""}
                  {!isOwner && <span className="ml-auto rounded-full bg-slate-800 px-2 py-0.5">member</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">New project</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-500 hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Name</label>
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="e.g. Website redesign"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                  placeholder="What is this project about?"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Color</label>
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setForm({ ...form, color: c })}
                      className={`h-8 w-8 rounded-lg transition-transform ${form.color === c ? "scale-110 ring-2 ring-white/70" : ""}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
              >
                Create project
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
