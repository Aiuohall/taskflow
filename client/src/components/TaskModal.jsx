import { useState } from "react";
import { X, Trash2, Send } from "lucide-react";
import api from "../api";

const STATUSES = [
  { id: "todo", label: "To Do" },
  { id: "in-progress", label: "In Progress" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done" },
];

export default function TaskModal({ projectId, task, defaultStatus, members, onClose, onSaved }) {
  const isEdit = Boolean(task);
  const [form, setForm] = useState({
    title: task?.title || "",
    description: task?.description || "",
    status: task?.status || defaultStatus || "todo",
    priority: task?.priority || "medium",
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : "",
    assignee: task?.assignee?._id || "",
    labels: task?.labels?.join(", ") || "",
  });
  const [comments, setComments] = useState(task?.comments || []);
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      ...form,
      assignee: form.assignee || null,
      dueDate: form.dueDate || null,
      labels: form.labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    };
    try {
      if (isEdit) {
        await api.put(`/tasks/${task._id}`, payload);
      } else {
        await api.post("/tasks", { ...payload, project: projectId });
      }
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save task");
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Delete this task?")) return;
    await api.delete(`/tasks/${task._id}`);
    onSaved();
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    const res = await api.post(`/tasks/${task._id}/comments`, { text: newComment });
    setComments(res.data.comments);
    setNewComment("");
  };

  const inputCls =
    "w-full rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-8">
      <div className="flex max-h-full w-full max-w-lg flex-col rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-bold">{isEdit ? "Edit task" : "New task"}</h2>
          <div className="flex items-center gap-1">
            {isEdit && (
              <button
                onClick={handleDelete}
                className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                title="Delete task"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:text-slate-300">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto px-6 py-4">
          <form id="task-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</p>
            )}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Title</label>
              <input autoFocus={!isEdit} required value={form.title} onChange={set("title")} className={inputCls} placeholder="What needs to be done?" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">Description</label>
              <textarea rows={3} value={form.description} onChange={set("description")} className={`${inputCls} resize-none`} placeholder="Add more detail..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Status</label>
                <select value={form.status} onChange={set("status")} className={inputCls}>
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Priority</label>
                <select value={form.priority} onChange={set("priority")} className={inputCls}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Due date</label>
                <input type="date" value={form.dueDate} onChange={set("dueDate")} className={inputCls} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Assignee</label>
                <select value={form.assignee} onChange={set("assignee")} className={inputCls}>
                  <option value="">Unassigned</option>
                  {members.map((m) => (
                    <option key={m._id} value={m._id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-300">
                Labels <span className="font-normal text-slate-500">(comma separated)</span>
              </label>
              <input value={form.labels} onChange={set("labels")} className={inputCls} placeholder="design, frontend, urgent" />
            </div>
          </form>

          {isEdit && (
            <div className="mt-6 border-t border-slate-800 pt-4">
              <h3 className="text-sm font-semibold text-slate-300">
                Comments ({comments.length})
              </h3>
              <div className="mt-3 space-y-3">
                {comments.map((c) => (
                  <div key={c._id} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                      {c.user?.name?.[0]?.toUpperCase() || "?"}
                    </span>
                    <div className="min-w-0 flex-1 rounded-lg bg-slate-800/50 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs font-semibold">{c.user?.name || "Unknown"}</p>
                        <p className="shrink-0 text-[11px] text-slate-500">
                          {new Date(c.createdAt).toLocaleString("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      <p className="mt-0.5 text-sm text-slate-300">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleComment} className="mt-3 flex gap-2">
                <input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className={inputCls}
                />
                <button
                  type="submit"
                  className="shrink-0 rounded-lg bg-slate-800 px-3.5 text-slate-300 transition-colors hover:bg-slate-700"
                  title="Send comment"
                >
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-6 py-4">
          <button
            type="submit"
            form="task-form"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
          >
            {busy ? "Saving..." : isEdit ? "Save changes" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
