import { useEffect, useRef, useState } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, FolderKanban, LogOut, CheckSquare, Menu, X, Pencil, Share2, Copy, Check } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import InvitationBell from "./InvitationBell";
import Avatar from "./Avatar";
import Seo from "./Seo";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/projects", label: "Projects", icon: FolderKanban },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const profileMenuRef = useRef(null);
  const profileLink =
    user?.profileId && typeof window !== "undefined"
      ? `${window.location.origin}/profile/${user.profileId}`
      : "";

  // Close the drawer whenever the route changes (e.g. tapping a nav item).
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!profileMenuOpen) return undefined;
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) setProfileMenuOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setProfileMenuOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [profileMenuOpen]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const copyProfileLink = async () => {
    if (!profileLink) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(profileLink);
      } else {
        const field = document.createElement("textarea");
        field.value = profileLink;
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        document.execCommand("copy");
        field.remove();
      }
      setCopied(true);
    } catch {
      // The link remains selected in the readonly field, so it can still be
      // copied manually when a browser blocks clipboard access.
      setCopied(false);
    }
  };

  return (
    <div className="flex h-screen">
      <Seo title="TaskFlow — Project Management" path="/" noindex />
      {/* Backdrop — only on mobile when the drawer is open */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 md:hidden"
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-800 bg-slate-900 transition-transform duration-200 md:static md:w-60 md:translate-x-0 md:bg-slate-900/60 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500">
              <CheckSquare size={18} className="text-white" />
            </div>
            <span className="text-lg font-bold tracking-tight">TaskFlow</span>
          </div>
          {/* Close button — only on mobile */}
          <button
            onClick={() => setOpen(false)}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 md:hidden"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-indigo-500/15 text-indigo-300"
                    : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div ref={profileMenuRef} className="relative mb-3">
            {profileMenuOpen && (
              <div
                role="menu"
                className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border border-slate-700 bg-slate-800 py-1 shadow-xl shadow-black/30"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    navigate("/profile");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700"
                >
                  <Pencil size={15} /> Edit profile
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileMenuOpen(false);
                    setCopied(false);
                    setShareOpen(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-200 transition-colors hover:bg-slate-700"
                >
                  <Share2 size={15} /> Share profile
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={() => setProfileMenuOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={profileMenuOpen}
              title="Profile options"
              className="flex w-full items-center gap-3 rounded-lg p-1 text-left transition-colors hover:bg-slate-800"
            >
              <Avatar user={user} size={36} />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user?.name}</p>
                <p className="truncate text-xs text-slate-500">{user?.email}</p>
              </div>
            </button>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </aside>

      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4"
          onMouseDown={() => setShareOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-profile-title"
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="share-profile-title" className="text-lg font-bold">Share profile</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Send this unique link to someone who wants to invite you to a project.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="rounded-lg p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                aria-label="Close share profile"
              >
                <X size={20} />
              </button>
            </div>
            <div className="mt-5 flex gap-2">
              <input
                readOnly
                value={profileLink}
                onFocus={(event) => event.target.select()}
                aria-label="Your unique profile link"
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm text-slate-200 outline-none"
              />
              <button
                type="button"
                onClick={copyProfileLink}
                disabled={!profileLink}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              They can paste it into the project members box to send you an invitation.
            </p>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar. On desktop it exists only to host the notification bell,
            so it stays slim and borderless-looking against the page. */}
        <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900/60 px-4 py-3">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-1.5 text-slate-300 hover:bg-slate-800 md:hidden"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2 md:hidden">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500">
              <CheckSquare size={15} className="text-white" />
            </div>
            <span className="font-bold tracking-tight">TaskFlow</span>
          </div>

          <div className="ml-auto">
            {/* Accepting an invite adds a project, so bounce the user to the
                projects list where the new one is now visible. */}
            <InvitationBell onAccepted={() => navigate("/projects")} />
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
