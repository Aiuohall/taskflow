import { useCallback, useEffect, useRef, useState } from "react";
import { X, Send, Paperclip, Download, File as FileIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import Avatar from "./Avatar";
import api from "../api";

// Any file type may be attached. The server enforces the real cap (never below
// 1 GB); this only lets the UI refuse early. Raise it with VITE_MAX_UPLOAD_MB.
const MAX_UPLOAD_MB = Math.max(1024, Number(import.meta.env.VITE_MAX_UPLOAD_MB) || 1024);
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const COMPRESSIBLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_DIMENSION = 2048;
const IMAGE_QUALITY = 0.85;

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

function outputImageName(name, mime) {
  if (mime === "image/jpeg" && /\.jpe?g$/i.test(name)) return name;
  const extension = mime === "image/jpeg" ? "jpg" : "webp";
  const dot = name.lastIndexOf(".");
  return `${dot > 0 ? name.slice(0, dot) : name}.${extension}`;
}

// Photos are resized and re-encoded in the browser, before any bytes leave
// the device. Documents, videos, GIFs, SVGs, and every other file type bypass
// this function and are uploaded exactly as selected.
async function optimizePhoto(file) {
  if (!COMPRESSIBLE_IMAGE_TYPES.has(file.type)) return file;

  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Photo could not be read"));
      element.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(image, 0, 0, width, height);

    // JPEG photos stay JPEG; PNG and WebP photos become WebP so transparency
    // is preserved while still producing a substantially smaller image.
    const outputType = file.type === "image/jpeg" ? "image/jpeg" : "image/webp";
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, outputType, IMAGE_QUALITY));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], outputImageName(file.name, outputType), {
      type: outputType,
      lastModified: file.lastModified,
    });
  } catch {
    // Keep the original if a browser cannot decode or encode this photo.
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
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
  // Files from one picker selection are uploaded sequentially. This preserves
  // the API's streaming, multi-GB-safe upload path while still letting users
  // send a batch in one action.
  const [upload, setUpload] = useState(null); // { name, size, pct, current, total }
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
    if (!body || sending || upload) return;
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
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // lets the same file be picked again later
    if (!files.length || upload || abortRef.current) return;

    const empty = files.find((file) => file.size === 0);
    if (empty) return setError(`"${empty.name}" is empty.`);

    const controller = new AbortController();
    abortRef.current = controller;
    setError("");
    const caption = text.trim().slice(0, 2000);
    let completed = 0;
    try {
      for (const [index, sourceFile] of files.entries()) {
        setUpload({
          name: sourceFile.name,
          size: sourceFile.size,
          pct: 0,
          current: index + 1,
          total: files.length,
          preparing: true,
        });
        const file = await optimizePhoto(sourceFile);
        if (controller.signal.aborted) {
          const cancelled = new Error("Upload cancelled");
          cancelled.code = "ERR_CANCELED";
          throw cancelled;
        }
        if (file.size > MAX_UPLOAD_BYTES) {
          const tooLarge = new Error("File too large");
          tooLarge.userMessage = `"${file.name}" is ${formatSize(file.size)}. The limit is ${formatSize(MAX_UPLOAD_BYTES)}.`;
          throw tooLarge;
        }
        setUpload({
          name: file.name,
          size: file.size,
          originalSize: sourceFile.size,
          compressed: file !== sourceFile,
          pct: 0,
          current: index + 1,
          total: files.length,
          preparing: false,
        });
        // Raw bytes are streamed to storage; metadata rides in headers. Only
        // the first attachment gets the draft text, so the caption isn't
        // repeated on every file message.
        const res = await api.post(`/chat/${projectId}/upload`, file, {
          headers: {
            "Content-Type": "application/octet-stream",
            "X-Filename": encodeURIComponent(file.name),
            "X-Filetype": file.type || "application/octet-stream",
            "X-Caption": encodeURIComponent(index === 0 ? caption : ""),
          },
          timeout: 0, // a large file legitimately takes minutes
          signal: controller.signal,
          onUploadProgress: (p) =>
            setUpload((u) =>
              u && !u.preparing && u.current === index + 1
                ? { ...u, pct: p.total ? Math.round((p.loaded / p.total) * 100) : 0 }
                : u
            ),
        });
        completed += 1;
        lastRef.current = res.data.createdAt;
        setMessages((cur) => (cur.some((m) => m._id === res.data._id) ? cur : [...cur, res.data]));
        if (index === 0) setText("");
      }
    } catch (err) {
      if (err.code !== "ERR_CANCELED" && !controller.signal.aborted) {
        const reason = err.response?.data?.message || err.userMessage || "Upload failed";
        setError(completed ? `${completed} of ${files.length} files uploaded. ${reason}` : reason);
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
              {upload.preparing ? "Preparing photo" : "Uploading"} {upload.total > 1 ? `${upload.current} of ${upload.total}: ` : ""}
              {upload.name} ({formatSize(upload.size)})
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
            <div
              className={`h-full bg-indigo-500 transition-all ${upload.preparing ? "animate-pulse" : ""}`}
              style={{ width: `${upload.preparing ? 25 : upload.pct}%` }}
            />
          </div>
          {upload.compressed && !upload.preparing && (
            <p className="mt-1 text-[11px] text-slate-400">Photo optimized from {formatSize(upload.originalSize)}</p>
          )}
        </div>
      )}

      <form onSubmit={send} className="flex gap-2 border-t border-slate-800 p-3">
        <input ref={fileInputRef} type="file" multiple onChange={attach} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={!!upload}
          aria-label="Attach files"
          title={`Attach files (up to ${formatSize(MAX_UPLOAD_BYTES)} each)`}
          className="rounded-lg border border-slate-700 px-3 text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
        >
          <Paperclip size={16} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          placeholder="Message the group…"
          disabled={!!upload}
          className="flex-1 rounded-lg border border-slate-700 bg-slate-800/60 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
        />
        <button
          type="submit"
          disabled={sending || !!upload || !text.trim()}
          aria-label="Send"
          className="rounded-lg bg-indigo-500 px-3 text-white transition-colors hover:bg-indigo-400 disabled:opacity-50"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
