import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Check, X, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../api";

/**
 * Notification bell for pending project invitations.
 *
 * Nobody can be added to a project silently any more — an invite lands here
 * and the recipient chooses. Polls rather than using websockets, because the
 * API sleeps on a free tier and a dropped socket would be worse than a
 * 60-second delay on a notification.
 */
const POLL_MS = 20000;

export default function InvitationBell({ onAccepted }) {
  const [invitations, setInvitations] = useState([]);
  const [unread, setUnread] = useState([]); // unread group-chat counts per project
  const navigate = useNavigate();
  const lastTotal = useRef(0);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [toast, setToast] = useState("");
  const panelRef = useRef(null);

  const load = useCallback(() => {
    api
      .get("/invitations")
      .then((res) => setInvitations(res.data))
      // Silent: a failed poll shouldn't throw an error banner over the app.
      .catch(() => {});
  }, []);

  const loadUnread = useCallback(() => {
    api
      .get("/chat/unread")
      .then((res) => {
        setUnread(res.data);
        const total = res.data.reduce((n, u) => n + u.count, 0);
        // Browser notification only when the count grows and the tab is hidden.
        if (
          total > lastTotal.current &&
          document.hidden &&
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification("TaskFlow", { body: `${total} unread chat message${total === 1 ? "" : "s"}` });
        }
        lastTotal.current = total;
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    loadUnread();
    const id = setInterval(() => {
      load();
      loadUnread();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [load, loadUnread]);

  // Close when clicking outside or pressing Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const respond = async (invitation, action) => {
    setBusyId(invitation._id);
    try {
      const res = await api.post(`/invitations/${invitation._id}/${action}`);
      setInvitations((list) => list.filter((i) => i._id !== invitation._id));
      setToast(res.data.message);
      setTimeout(() => setToast(""), 4000);
      if (action === "accept") onAccepted?.();
    } catch (err) {
      setToast(err.response?.data?.message || "Could not respond to the invitation");
      setTimeout(() => setToast(""), 4000);
      load(); // resync — it may have been withdrawn or already answered
    } finally {
      setBusyId(null);
    }
  };

  const chatCount = unread.reduce((n, u) => n + u.count, 0);
  const count = invitations.length + chatCount;

  const toggle = () => {
    setOpen((o) => !o);
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  };

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          onClick={toggle}
          aria-label={count ? `${count} pending invitation${count === 1 ? "" : "s"}` : "Notifications"}
          className="relative rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
        >
          <Bell size={19} />
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-indigo-500 px-1 text-[10px] font-bold text-white">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="border-b border-slate-800 px-4 py-3">
              <p className="text-sm font-semibold">Notifications</p>
            </div>

            {unread.length > 0 && (
              <ul className="divide-y divide-slate-800 border-b border-slate-800">
                {unread.map((u) => (
                  <li key={u.project._id}>
                    <button
                      onClick={() => {
                        setOpen(false);
                        navigate(`/projects/${u.project._id}`);
                      }}
                      className="flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-slate-800/60"
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: u.project.color || "#6366f1" }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {u.count} new message{u.count === 1 ? "" : "s"} in{" "}
                        <span className="font-medium">{u.project.name}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {invitations.length === 0 && unread.length > 0 ? null : count === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                You're all caught up
              </p>
            ) : (
              <ul className="max-h-96 divide-y divide-slate-800 overflow-y-auto">
                {invitations.map((inv) => (
                  <li key={inv._id} className="px-4 py-3">
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: inv.project.color || "#6366f1" }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">
                          <span className="font-medium">{inv.invitedBy?.name || "Someone"}</span>
                          {" wants to add you to "}
                          <span className="font-medium">{inv.project.name}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {inv.invitedBy?.email}
                        </p>

                        <div className="mt-2.5 flex gap-2">
                          <button
                            onClick={() => respond(inv, "accept")}
                            disabled={busyId === inv._id}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
                          >
                            {busyId === inv._id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Check size={13} />
                            )}
                            Accept
                          </button>
                          <button
                            onClick={() => respond(inv, "reject")}
                            disabled={busyId === inv._id}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                          >
                            <X size={13} />
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-slate-800 px-4 py-2.5 text-sm text-slate-100 shadow-xl ring-1 ring-slate-700"
        >
          {toast}
        </div>
      )}
    </>
  );
}
