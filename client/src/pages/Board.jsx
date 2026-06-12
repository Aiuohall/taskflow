import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
} from "@dnd-kit/core";
import { ArrowLeft, Plus, UserPlus, X, Calendar, MessageSquare } from "lucide-react";
import api from "../api";
import TaskModal from "../components/TaskModal";

const COLUMNS = [
  { id: "todo", label: "To Do", dot: "bg-slate-400" },
  { id: "in-progress", label: "In Progress", dot: "bg-indigo-400" },
  { id: "review", label: "Review", dot: "bg-amber-400" },
  { id: "done", label: "Done", dot: "bg-emerald-400" },
];

const PRIORITY_STYLES = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

function TaskCard({ task, onClick, overlay = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task._id,
    disabled: overlay,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  const overdue = task.dueDate && task.status !== "done" && new Date(task.dueDate) < new Date();

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onClick={() => onClick?.(task)}
      className={`cursor-grab rounded-xl border border-slate-800 bg-slate-900 p-3.5 transition-colors hover:border-slate-700 active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      } ${overlay ? "rotate-2 shadow-2xl shadow-black/50" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{task.title}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${PRIORITY_STYLES[task.priority]}`}>
          {task.priority}
        </span>
      </div>
      {task.labels?.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <span key={l} className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[11px] text-indigo-300">
              {l}
            </span>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-3 text-xs text-slate-500">
        {task.dueDate && (
          <span className={`flex items-center gap-1 ${overdue ? "text-red-400" : ""}`}>
            <Calendar size={12} />
            {new Date(task.dueDate).toLocaleDateString("en", { month: "short", day: "numeric" })}
          </span>
        )}
        {task.comments?.length > 0 && (
          <span className="flex items-center gap-1">
            <MessageSquare size={12} />
            {task.comments.length}
          </span>
        )}
        {task.assignee && (
          <span
            className="ml-auto flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500/20 text-[11px] font-semibold text-indigo-300"
            title={task.assignee.name}
          >
            {task.assignee.name[0].toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function Column({ column, tasks, onAdd, onTaskClick }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex w-72 shrink-0 flex-col">
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className={`h-2 w-2 rounded-full ${column.dot}`} />
        <h3 className="text-sm font-semibold">{column.label}</h3>
        <span className="text-xs text-slate-500">{tasks.length}</span>
        <button
          onClick={() => onAdd(column.id)}
          className="ml-auto rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
          title={`Add task to ${column.label}`}
        >
          <Plus size={16} />
        </button>
      </div>
      <div
        ref={setNodeRef}
        className={`flex flex-1 flex-col gap-2.5 rounded-xl p-2 transition-colors ${
          isOver ? "bg-indigo-500/10 ring-1 ring-indigo-500/40" : "bg-slate-900/40"
        }`}
      >
        {tasks.map((t) => (
          <TaskCard key={t._id} task={t} onClick={onTaskClick} />
        ))}
        {tasks.length === 0 && (
          <p className="py-8 text-center text-xs text-slate-600">Drop tasks here</p>
        )}
      </div>
    </div>
  );
}

export default function Board() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activeTask, setActiveTask] = useState(null);
  const [modal, setModal] = useState(null); // { task } or { status } for new
  const [showMembers, setShowMembers] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberError, setMemberError] = useState("");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const load = async () => {
    const [p, t] = await Promise.all([
      api.get(`/projects/${id}`),
      api.get(`/tasks?project=${id}`),
    ]);
    setProject(p.data);
    setTasks(t.data);
  };

  useEffect(() => {
    load();
  }, [id]);

  const allMembers = useMemo(() => {
    if (!project) return [];
    return [project.owner, ...project.members];
  }, [project]);

  const handleDragStart = (e) => {
    setActiveTask(tasks.find((t) => t._id === e.active.id) || null);
  };

  const handleDragEnd = async (e) => {
    setActiveTask(null);
    const { active, over } = e;
    if (!over) return;
    const task = tasks.find((t) => t._id === active.id);
    if (!task || task.status === over.id) return;

    // Optimistic update, then persist
    const prev = tasks;
    setTasks(tasks.map((t) => (t._id === task._id ? { ...t, status: over.id } : t)));
    try {
      const res = await api.patch(`/tasks/${task._id}/move`, { status: over.id });
      setTasks((cur) => cur.map((t) => (t._id === task._id ? res.data : t)));
    } catch {
      setTasks(prev);
    }
  };

  const handleAddMember = async (e) => {
    e.preventDefault();
    setMemberError("");
    try {
      const res = await api.post(`/projects/${id}/members`, { email: memberEmail });
      setProject(res.data);
      setMemberEmail("");
    } catch (err) {
      setMemberError(err.response?.data?.message || "Could not add member");
    }
  };

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col p-8">
      <div className="flex items-center gap-4">
        <Link to="/projects" className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800">
          <ArrowLeft size={18} />
        </Link>
        <div className="h-9 w-9 rounded-lg" style={{ background: project.color + "33" }}>
          <div className="m-2.5 h-4 w-4 rounded" style={{ background: project.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{project.name}</h1>
          {project.description && (
            <p className="truncate text-sm text-slate-400">{project.description}</p>
          )}
        </div>
        <div className="flex items-center -space-x-2">
          {allMembers.slice(0, 5).map((m) => (
            <span
              key={m._id}
              title={`${m.name} (${m.email})`}
              className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-slate-950 bg-indigo-500/30 text-xs font-semibold text-indigo-200"
            >
              {m.name[0].toUpperCase()}
            </span>
          ))}
        </div>
        <button
          onClick={() => setShowMembers(true)}
          className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
        >
          <UserPlus size={15} />
          Members
        </button>
        <button
          onClick={() => setModal({ status: "todo" })}
          className="flex items-center gap-2 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
        >
          <Plus size={16} />
          New task
        </button>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="mt-6 flex flex-1 gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((col) => (
            <Column
              key={col.id}
              column={col}
              tasks={tasks.filter((t) => t.status === col.id)}
              onAdd={(status) => setModal({ status })}
              onTaskClick={(task) => setModal({ task })}
            />
          ))}
        </div>
        <DragOverlay>{activeTask && <TaskCard task={activeTask} overlay />}</DragOverlay>
      </DndContext>

      {modal && (
        <TaskModal
          projectId={id}
          task={modal.task}
          defaultStatus={modal.status}
          members={allMembers}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            load();
          }}
        />
      )}

      {showMembers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Project members</h2>
              <button onClick={() => setShowMembers(false)} className="text-slate-500 hover:text-slate-300">
                <X size={20} />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {allMembers.map((m, i) => (
                <div key={m._id} className="flex items-center gap-3 rounded-lg bg-slate-800/50 px-4 py-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-semibold text-indigo-300">
                    {m.name[0].toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.name}</p>
                    <p className="truncate text-xs text-slate-500">{m.email}</p>
                  </div>
                  {i === 0 && (
                    <span className="ml-auto rounded-full bg-indigo-500/15 px-2 py-0.5 text-xs text-indigo-300">
                      owner
                    </span>
                  )}
                </div>
              ))}
            </div>
            <form onSubmit={handleAddMember} className="mt-4">
              {memberError && (
                <p className="mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-400">{memberError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  placeholder="teammate@example.com"
                  className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-indigo-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-indigo-400"
                >
                  Add
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                The person must already have a TaskFlow account.
              </p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
