import { Link } from "react-router-dom";
import { CheckSquare, Kanban, Users, MessageSquare, CalendarClock, BarChart3 } from "lucide-react";
import Seo from "../components/Seo";

const FEATURES = [
  { icon: Kanban, title: "Drag-and-drop kanban boards", text: "Move tasks across To Do, In Progress and Done columns and see the state of every project at a glance." },
  { icon: Users, title: "Team projects", text: "Invite teammates to a project, assign tasks and keep everyone working from the same board." },
  { icon: MessageSquare, title: "Project chat", text: "A members-only chat in every project with file attachments, so decisions stay next to the work." },
  { icon: CalendarClock, title: "Deadlines and priorities", text: "Set due dates and priorities so the most important work is always on top." },
  { icon: BarChart3, title: "Dashboard and progress charts", text: "Track completed tasks and workload across all your projects in one dashboard." },
];

export default function Landing() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <Seo
        title="TaskFlow — Free Kanban Project Management & Task Tracking"
        description="TaskFlow is a free project management app: kanban boards, team projects, task tracking, project chat and deadlines in one place. Sign up in seconds."
        path="/"
      />
      <header className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-lg font-bold">
          <CheckSquare className="h-6 w-6 text-indigo-500" aria-hidden="true" /> TaskFlow
        </span>
        <nav aria-label="Account" className="flex gap-3 text-sm">
          <Link to="/login" className="rounded-lg px-4 py-2 hover:bg-white/10">Log in</Link>
          <Link to="/register" className="rounded-lg bg-indigo-500 px-4 py-2 font-medium text-white hover:bg-indigo-400">Sign up free</Link>
        </nav>
      </header>

      <section className="py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Free kanban project management for teams
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
          Plan projects, track tasks and talk with your team in one simple workspace. No setup, no credit card.
        </p>
        <Link to="/register" className="mt-8 inline-block rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white hover:bg-indigo-400">
          Create your free account
        </Link>
      </section>

      <section aria-labelledby="features">
        <h2 id="features" className="mb-6 text-center text-2xl font-semibold">Everything you need to ship projects</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-xl border border-white/10 bg-white/5 p-5">
              <Icon className="mb-3 h-6 w-6 text-indigo-400" aria-hidden="true" />
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-300">{text}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-16 text-center text-sm text-slate-400">© {new Date().getFullYear()} TaskFlow</footer>
    </main>
  );
}
