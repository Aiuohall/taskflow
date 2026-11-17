import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Check,
  CheckSquare,
  ChevronRight,
  Kanban,
  MessageSquare,
  Sparkles,
  Users,
} from "lucide-react";
import Seo from "../components/Seo";

const FEATURES = [
  { icon: Kanban, title: "Drag-and-drop kanban boards", text: "Move tasks across To Do, In Progress and Done columns and see the state of every project at a glance." },
  { icon: Users, title: "Team projects", text: "Invite teammates to a project, assign tasks and keep everyone working from the same board." },
  { icon: MessageSquare, title: "Project chat", text: "A members-only chat in every project with file attachments, so decisions stay next to the work." },
  { icon: CalendarClock, title: "Deadlines and priorities", text: "Set due dates and priorities so the most important work is always on top." },
  { icon: BarChart3, title: "Dashboard and progress charts", text: "Track completed tasks and workload across all your projects in one dashboard." },
];

const STEPS = [
  ["01", "Create a project", "Give the work a home and invite the people who need to see it."],
  ["02", "Break it into tasks", "Add owners, priorities and due dates so the next step is always clear."],
  ["03", "Keep work moving", "Drag tasks forward, discuss decisions in context and see progress at a glance."],
];

const FAQS = [
  ["What is TaskFlow?", "TaskFlow is a free project management app for organising team work with projects, kanban boards, tasks, due dates and project chat."],
  ["Is TaskFlow free to use?", "Yes. You can create an account and begin organising projects without entering a credit card."],
  ["Can I use TaskFlow with a team?", "Yes. Create a project, invite teammates, assign tasks and keep the project's conversation alongside its board."],
];

function ProductPreview() {
  return (
    <div className="relative mx-auto mt-12 max-w-5xl" aria-label="Illustration of a TaskFlow kanban project board">
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-indigo-500/20 blur-3xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 p-3 shadow-2xl shadow-indigo-950/60 sm:p-5">
        <div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-indigo-500 text-sm font-bold text-white">T</span>
            <div className="text-left">
              <p className="text-sm font-semibold text-white">Website refresh</p>
              <p className="text-xs text-slate-400">12 tasks · 4 teammates</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">On track</span>
        </div>

        <div className="grid gap-3 text-left sm:grid-cols-3">
          <PreviewColumn title="To do" count="3">
            <PreviewCard title="Draft landing page copy" tag="High" color="bg-amber-400" />
            <PreviewCard title="Map the user journey" tag="Design" color="bg-sky-400" />
          </PreviewColumn>
          <PreviewColumn title="In progress" count="2">
            <PreviewCard title="Build the new board view" tag="Today" color="bg-indigo-400" active />
            <PreviewCard title="Review mobile layout" tag="Design" color="bg-sky-400" />
          </PreviewColumn>
          <PreviewColumn title="Done" count="7">
            <PreviewCard title="Set project goals" tag="Complete" color="bg-emerald-400" done />
            <PreviewCard title="Invite the team" tag="Complete" color="bg-emerald-400" done />
          </PreviewColumn>
        </div>
      </div>
    </div>
  );
}

function PreviewColumn({ title, count, children }) {
  return (
    <section className="rounded-xl bg-slate-950/75 p-3" aria-label={`${title}, ${count} tasks`}>
      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-slate-200">{title}</h3>
        <span className="text-xs text-slate-500">{count}</span>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function PreviewCard({ title, tag, color, active = false, done = false }) {
  return (
    <article className={`rounded-lg border p-3 ${active ? "border-indigo-400/50 bg-indigo-500/10" : "border-white/10 bg-slate-900"}`}>
      <p className={`text-xs font-medium ${done ? "text-slate-400 line-through" : "text-slate-200"}`}>{title}</p>
      <div className="mt-3 flex items-center justify-between">
        <span className="flex -space-x-1" aria-label="Assigned teammates">
          <span className="h-4 w-4 rounded-full border border-slate-900 bg-violet-400" />
          <span className="h-4 w-4 rounded-full border border-slate-900 bg-rose-400" />
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className={`h-1.5 w-1.5 rounded-full ${color}`} />{tag}</span>
      </div>
    </article>
  );
}

export default function Landing() {
  return (
    <main className="overflow-hidden">
      <Seo
        title="TaskFlow | Free Kanban Project Management for Teams"
        description="Plan projects, track tasks and keep team conversations in one free kanban project management workspace. Start organising work with TaskFlow."
        path="/"
      />
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold" aria-label="TaskFlow home">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"><CheckSquare className="h-5 w-5" aria-hidden="true" /></span>
            TaskFlow
          </Link>
          <nav aria-label="Main navigation" className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
            <a href="#features" className="transition hover:text-white">Features</a>
            <a href="#how-it-works" className="transition hover:text-white">How it works</a>
            <a href="#faq" className="transition hover:text-white">FAQ</a>
          </nav>
          <nav aria-label="Account" className="flex items-center gap-2 text-sm">
            <Link to="/login" className="rounded-lg px-3 py-2 font-medium text-slate-200 transition hover:bg-white/10">Log in</Link>
            <Link to="/register" className="rounded-lg bg-indigo-500 px-3 py-2 font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-400">Start free</Link>
          </nav>
        </header>

        <section className="pb-12 pt-20 text-center sm:pb-16 sm:pt-28" aria-labelledby="hero-heading">
          <p className="mx-auto flex w-fit items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-sm font-medium text-indigo-200">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> A calmer way to run projects
          </p>
          <h1 id="hero-heading" className="mx-auto mt-6 max-w-4xl text-4xl font-bold tracking-tight text-white sm:text-6xl">
            Turn busywork into clear, shared progress.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
            TaskFlow gives your team a simple kanban workspace for projects, tasks, deadlines and the conversations that move work forward.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/register" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 font-semibold text-white shadow-xl shadow-indigo-500/25 transition hover:bg-indigo-400">
              Create a free workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <a href="#how-it-works" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-5 py-3 font-semibold text-slate-200 transition hover:border-white/30 hover:bg-white/5">
              See how it works <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-400">No credit card required.</p>
          <ProductPreview />
        </section>

        <section id="features" className="scroll-mt-8 border-t border-white/10 py-16 sm:py-24" aria-labelledby="features-heading">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Built for the work itself</p>
            <h2 id="features-heading" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">A project view your whole team can understand</h2>
            <p className="mt-4 text-lg leading-8 text-slate-300">Plan what matters, make ownership visible and keep the context close to each task—without adding another complicated tool to your day.</p>
          </div>
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:-translate-y-0.5 hover:border-indigo-400/30 hover:bg-white/[0.05]">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-400/10 text-indigo-300"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <h3 className="mt-5 font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section id="how-it-works" className="scroll-mt-8 rounded-3xl border border-indigo-400/15 bg-indigo-500/[0.07] px-6 py-14 sm:px-10 sm:py-20" aria-labelledby="how-heading">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-indigo-300">Simple by design</p>
            <h2 id="how-heading" className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">From idea to done in three clear steps</h2>
          </div>
          <ol className="mt-12 grid gap-8 md:grid-cols-3">
            {STEPS.map(([number, title, text]) => (
              <li key={number} className="relative border-t border-white/15 pt-5">
                <span className="text-sm font-bold text-indigo-300">{number}</span>
                <h3 className="mt-3 text-lg font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-300">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="scroll-mt-8 py-16 sm:py-24" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-3xl">
            <h2 id="faq-heading" className="text-center text-3xl font-bold tracking-tight text-white sm:text-4xl">Frequently asked questions</h2>
            <div className="mt-10 divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.03] px-6">
              {FAQS.map(([question, answer]) => (
                <details key={question} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 font-semibold text-white">
                    {question}<ChevronRight className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-90" aria-hidden="true" />
                  </summary>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-3xl bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-12 text-center shadow-2xl shadow-indigo-950/50 sm:px-10 sm:py-16">
          <Check className="mx-auto h-7 w-7 text-indigo-100" aria-hidden="true" />
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-white">Give every project a clear next step.</h2>
          <p className="mx-auto mt-3 max-w-xl text-indigo-100">Start a TaskFlow workspace and bring your tasks, team and progress together.</p>
          <Link to="/register" className="mt-7 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 font-semibold text-indigo-700 transition hover:bg-indigo-50">Start using TaskFlow <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </section>

        <footer className="flex flex-col gap-3 border-t border-white/10 py-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} TaskFlow. Project management made clear.</p>
          <div className="flex gap-4"><Link to="/login" className="hover:text-white">Log in</Link><Link to="/register" className="hover:text-white">Create account</Link></div>
        </footer>
      </div>
    </main>
  );
}
