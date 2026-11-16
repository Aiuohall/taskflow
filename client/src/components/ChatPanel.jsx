import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Paperclip, Download, File as FileIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import api from "../api";

// Any file type may be attached. The server enforces the real cap (never below
// 1 GB); this only lets the UI refuse early. Raise it with VITE_MAX_UPLOAD_MB.
const MAX_UPLOAD_MB = Math.max(1024, Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 1024);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}

/**
 * Group chat for one project. Only owner/members can load or post (enforced
 * server-side). Polls while open — consistent with the rest of the app, which
 * avoids websockets because the API host may sleep.
 */
const POLL_MS = 4000;

export default function ChatPanel({ projectId, members = [], onClose }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [upload, setUpload] = useState(null); // { name, size, pct } while a file is uploading
  const endRef = useRef(null);
  const lastRef = useRef(null);
  const fileInputRef = useRef(null);
  const abortRef = useRef(null);

  const markRead = useCallback(() => {
    api.post(`/chat/${projectId}/read`).catch(() => {});
  }, [projectId]);

  const load = useCallback(async () => {
    try {
      const params = lastRef.current ? { after: lastRef.current } : {};
      const res = await api.get(`/chat/${projectId}/messages`, { params });
      if (res.data.length) {
        lastRef.current = res.data[res.data.length - 1].createdAt;
        setMessages((cur) => {
          const seen = new Set(cur.map((m) => m._id));
          return [...cur, ...res.data.filter((m) => !seen.has(m._id))];
        });
        markRead();
      }
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Can't load messages right now");
    }
  }, [projectId, markRead]);

  useEffect(() => {
    load();
    markRead();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load, markRead]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await api.post(`/chat/${projectId}/messages`, { text: body });
      lastRef.current = res.data.createdAt;
      setMessages((cur) => (cur.some((m) => m._id === res.data._id) ? cur : [...cur, res.data]));
      setText("");
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || err.userMessage || "Message not sent");
    } finally {
      setSending(false);
    }
  };

  const attach = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets the same file be picked again later
    if (!file || upload) return;
    if (file.size === 0) return setError("That file is empty");
    if (file.size > MAX_UPLOAD_BYTES) {
      return setError(`"${file.name}" is ${formatSize(file.size)}. The limit is ${formatSize(MAX_UPLOAD_BYTES)}.`);
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    setUpload({ name: file.name, size: file.size, pct: 0 });
    try {
      // Raw bytes as the body (the server streams them to storage); metadata rides in headers.
      const res = await api.post(`/chat/${projectId}/upload`, file, {
        headers: {
          "Content-Type": "application/octet-stream",
          "X-Filename": encodeURIComponent(file.name),
          "X-Filetype": file.type || "application/octet-stream",
          "X-Caption": encodeURIComponent(text.trim().slice(0, 2000)),
        },
        timeout: 0, // a large file legitimately takes minutes
        signal: controller.signal,
        onUploadProgress: (p) =>
          setUpload((u) => u && { ...u, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 }),
      });
      lastRef.current = res.data.createdAt;
      setMessages((cur) => (cur.some((m) => m._id === res.data._id) ? cur : [...cur, res.data]));
      setText("");
    } catch (err) {
      if (err.code !== "ERR_CANCELED") {
        setError(err.response?.data?.message || err.userMessage || "Upload failed");
      }
    } finally {
      abortRef.current = null;
      setUpload(null);
    }
  };

  const download = async (m) => {
    try {
      // A short-lived signed link lets the browser stream the file straight to
      // disk, which a multi-GB file needs (an in-memory blob would not fit).
      const { data } = await api.post(`/chat/${projectId}/files/${m.attachment.fileId}/link`);
      const a = document.createElement("a");
      a.href = `${api.defaults.baseURL}${data.path}`;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setError(err.response?.data?.message || err.userMessage || "Could not start the download");
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-800 bg-slate-900 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Group chat</h2>
          <p className="text-xs text-slate-500">Visible to project members only</p>
        </div>
        <button onClick={onClose} aria-label="Close chat" className="text-slate-500 hover:text-slate-300">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 && !error && (
          <p className="py-10 text-center text-sm text-slate-500">No messages yet. Say hi!</p>
        )}
        {messages.map((m) => {
          const mine = m.sender?._id === user?.id;
          // Messages carry only the sender's name; the photo comes from the member list.
          const sender = members.find((x) => x._id === m.sender?._id) || m.sender;
          return (
            <div key={m._id} className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              <Avatar user={mine ? user : sender} size={28} />
              <div className={`flex min-w-0 max-w-[85%] flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && <span className="mb-0.5 text-xs text-slate-500">{m.sender?.name || "Former member"}</span>}
              <div
                className={`space-y-2 break-words rounded-2xl px-3 py-2 text-sm ${
                  mine ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-100"
                }`}
              >
                {m.attachment?.fileId && (
                  <button
                    type="button"
                    onClick={() => download(m)}
                    title="Download"
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left ${
                      mine ? "bg-indigo-600/60 hover:bg-indigo-600" : "bg-slate-700/60 hover:bg-slate-700"
                    }`}
                  >
                    <FileIcon size={18} className="shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.attachment.name}</span>
                      <span className="block text-[11px] opacity-70">{formatSize(m.attachment.size)}</span>
                    </span>
                    <Download size={16} className="shrink-0" />
                  </button>
                )}
                {m.text && <p className="whitespace-pre-wrap">{m.text}</p>}
              </div>
              <span className="mt-0.5 text-[10px] text-slate-600">
                {new Date(m.createdAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" })}
              </span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {error && <p className="mx-4 mb-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

      {upload && (
        <div className="mx-3 mt-3 rounded-lg bg-slate-800 px-3 py-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              Uploading {upload.name} ({formatSize(upload.size)})
            </span>
            <button
              type="button"
              onClick={() => abortRef.current?.abort()}
              className="shrink-0 text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-700">
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${upload.pct}%` }} />
          </div>
        </div>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
        <input ref={fileInputRef} type="file" onChange={attach} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!upload}
          aria-label="Attach a file"
          title={`Attach a file (up to ${formatSize(MAX_UPLOAD_BYTES)})`}
          className="rounded-lg border border-slate-700 px-3 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <Paperclip size={16} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Message the group…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Send"
          className="rounded-lg bg-indigo-500 px-3 text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
