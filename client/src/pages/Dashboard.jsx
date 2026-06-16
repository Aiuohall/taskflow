import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ListTodo,
  FolderKanban,
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import api from "../api";

const STATUS_COLORS = {
  todo: "#64748b",
  "in-progress": "#6366f1",
  review: "#f59e0b",
  done: "#22c55e",
};
const STATUS_LABELS = {
  todo: "To Do",
  "in-progress": "In Progress",
  review: "Review",
  done: "Done",
};
const PRIORITY_STYLES = {
  high: "bg-red-500/15 text-red-400",
  medium: "bg-amber-500/15 text-amber-400",
  low: "bg-emerald-500/15 text-emerald-400",
};

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">{label}</p>
        <Icon size={18} className={tone} />
      </div>
      <p className="mt-2 text-3xl font-bold">{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard/stats")
      .then((res) => setStats(res.data))
      .catch(() => setError("Could not load dashboard stats"));
  }, []);

  if (error) return <p className="p-8 text-red-400">{error}</p>;
  if (!stats) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    );
  }

  const pieData = Object.entries(stats.byStatus)
    .map(([status, value]) => ({ name: STATUS_LABELS[status], value, status }))
    .filter((d) => d.value > 0);

  const trendData = stats.trend.map((d) => ({
    ...d,
    day: new Date(d.date + "T00:00:00").toLocaleDateString("en", { weekday: "short" }),
  }));

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <p className="mt-1 text-sm text-slate-400">Overview of everything across your projects</p>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon={FolderKanban} label="Projects" value={stats.totals.projects} tone="text-indigo-400" />
        <StatCard icon={ListTodo} label="Total tasks" value={stats.totals.tasks} tone="text-slate-400" />
        <StatCard icon={Clock} label="In progress" value={stats.totals.inProgress} tone="text-blue-400" />
        <StatCard icon={CheckCircle2} label="Completed" value={stats.totals.completed} tone="text-emerald-400" />
        <StatCard icon={AlertTriangle} label="Overdue" value={stats.totals.overdue} tone="text-red-400" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-semibold">Tasks by status</h2>
          {pieData.length === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">No tasks yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={4}>
                  {pieData.map((d) => (
                    <Cell key={d.status} fill={STATUS_COLORS[d.status]} stroke="none" />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                  itemStyle={{ color: "#e2e8f0" }}
                />
                <Legend formatter={(v) => <span style={{ color: "#94a3b8", fontSize: 13 }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-semibold">Completed — last 7 days</h2>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trendData} margin={{ top: 20 }}>
              <XAxis dataKey="day" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: "rgba(99,102,241,0.08)" }}
                contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                itemStyle={{ color: "#e2e8f0" }}
              />
              <Bar dataKey="completed" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-semibold">Upcoming deadlines</h2>
          <div className="mt-3 space-y-2">
            {stats.upcoming.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">Nothing due soon 🎉</p>
            )}
            {stats.upcoming.map((t) => (
              <Link
                key={t._id}
                to={`/projects/${t.project._id}`}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3 transition-colors hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.project.name}</p>
                </div>
                <span className="shrink-0 text-xs text-amber-400">
                  {new Date(t.dueDate).toLocaleDateString("en", { month: "short", day: "numeric" })}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="font-semibold">Recent activity</h2>
          <div className="mt-3 space-y-2">
            {stats.recent.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-500">No activity yet</p>
            )}
            {stats.recent.map((t) => (
              <Link
                key={t._id}
                to={`/projects/${t.project._id}`}
                className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3 transition-colors hover:bg-slate-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.title}</p>
                  <p className="text-xs text-slate-500">
                    {STATUS_LABELS[t.status]} · {t.project.name}
                  </p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[t.priority]}`}>
                  {t.priority}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
