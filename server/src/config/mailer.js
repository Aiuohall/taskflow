import nodemailer from "nodemailer";

/**
 * SMTP transport for OTP + password-reset mail.
 *
 * Two ways to configure it, checked in this order:
 *
 *  1. Generic SMTP (recommended for production) — works with any provider
 *     (Resend, Brevo, Mailgun, SendGrid, Postmark, Amazon SES…):
 *       SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, [MAIL_FROM]
 *
 *  2. Gmail + App Password (fine for a demo, fragile long-term — see below):
 *       GMAIL_USER, GMAIL_APP_PASSWORD
 *
 * If neither is set we fall back to "console mode": the body is logged to the
 * server console instead of sent, so every flow stays testable without creds.
 *
 * Why this file is defensive: Google silently revokes App Passwords (on a
 * password change, a 2-Step-Verification change, or after a long idle period)
 * and caps sending at ~500 messages/day. When that happens every send fails
 * forever with no visible signal. So we (a) verify the connection at startup,
 * (b) retry transient failures, (c) keep a live status object that
 * GET /api/health reports, and (d) log loudly with a fix hint.
 */

const FROM_NAME = process.env.MAIL_FROM_NAME || "TaskFlow";

// Timeouts matter: without them a hung SMTP socket keeps the HTTP request open
// until the platform's own (much longer) timeout kills it, which is what makes
// "sign up" appear to freeze rather than fail.
// Kept tight on purpose. Many hosts block outbound SMTP, and a blocked port
// fails by hanging rather than refusing — so generous timeouts turn "signup"
// into a spinner that never resolves. Better to fail in seconds and say so.
const TIMEOUTS = {
  connectionTimeout: 7000, // TCP connect
  greetingTimeout: 7000, // wait for the server banner
  socketTimeout: 15000, // inactivity on an established socket
};

// Hard ceiling on how long a user waits for the whole send, retries included.
const SEND_DEADLINE_MS = 20000;

// Pooling reuses a single authenticated connection instead of doing a fresh
// TLS + AUTH handshake (~1-2s against Gmail) on every single code we send.
const POOL = { pool: true, maxConnections: 3, maxMessages: 50 };

function buildTransport() {
  if (process.env.SMTP_HOST) {
    const port = Number(process.env.SMTP_PORT || 587);
    return {
      kind: `smtp:${process.env.SMTP_HOST}:${port}`,
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      transport: nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
          : undefined,
        ...POOL,
        ...TIMEOUTS,
      }),
    };
  }

  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || "").replace(/\s+/g, ""); // Google shows it as "abcd efgh ijkl mnop"
  if (user && pass) {
    return {
      kind: "gmail",
      from: process.env.MAIL_FROM || user,
      transport: nodemailer.createTransport({
        // Explicit host/port instead of `service: "gmail"`. Port 465 (implicit
        // TLS) connects more reliably from cloud hosts than 587/STARTTLS, which
        // several providers throttle or block outright.
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: { user, pass },
        ...POOL,
        ...TIMEOUTS,
      }),
    };
  }

  return null;
}

const built = buildTransport();
const transport = built?.transport ?? null;

/** Live mailer state, surfaced by GET /api/health so failures are visible. */
export const mailerStatus = {
  mode: built ? built.kind : "console",
  ready: null, // null = not verified yet, true/false after verify()
  lastError: null,
  lastErrorAt: null,
  lastSentAt: null,
  sent: 0,
  failed: 0,
};

if (!built) {
  console.warn(
    "[mailer] No SMTP config found (set SMTP_HOST/SMTP_USER/SMTP_PASS or GMAIL_USER/GMAIL_APP_PASSWORD) — verification codes will be printed to this console instead of emailed."
  );
}

function describeError(err) {
  // Gmail's auth rejection is the failure mode that silently kills OTP after
  // weeks of working, so name it explicitly instead of dumping a raw trace.
  if (err.code === "EAUTH" || err.responseCode === 535) {
    return (
      "SMTP authentication rejected. If you're on Gmail, the App Password is no longer valid — " +
      "Google revokes them after a password/2FA change or long inactivity. " +
      "Generate a new one at https://myaccount.google.com/apppasswords and update GMAIL_APP_PASSWORD."
    );
  }
  if (err.responseCode === 550 || err.responseCode === 552) {
    return "Message rejected by the SMTP server (recipient refused or sending quota exceeded).";
  }
  if (["ETIMEDOUT", "ESOCKET", "ECONNECTION", "ECONNREFUSED", "EDNS", "EAI_AGAIN"].includes(err.code)) {
    return (
      `Could not reach the SMTP server (${err.code}). This usually means the API host blocks ` +
      "outbound SMTP, which is common on serverless platforms (Netlify/Vercel Functions). " +
      "Use an HTTP email API instead of SMTP, or host the API somewhere that permits SMTP."
    );
  }
  return err.message;
}

/**
 * Verify credentials at boot so a dead App Password shows up in the deploy log
 * immediately, instead of the first time a real user tries to sign up.
 * Deliberately not awaited by the caller — it must never block startup.
 */
export async function verifyMailer() {
  if (!transport) return false;
  try {
    await transport.verify();
    mailerStatus.ready = true;
    mailerStatus.lastError = null;
    console.log(`[mailer] SMTP ready (${mailerStatus.mode})`);
    return true;
  } catch (err) {
    mailerStatus.ready = false;
    mailerStatus.lastError = describeError(err);
    mailerStatus.lastErrorAt = new Date().toISOString();
    console.error(`[mailer] SMTP verification FAILED (${mailerStatus.mode}): ${mailerStatus.lastError}`);
    return false;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Auth and "recipient refused" failures will fail identically on a retry, so
// only back off and retry the transient network/throttle cases.
const isRetryable = (err) =>
  !(err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 550);

/**
 * Send an email. Throws on permanent failure so the caller can tell the user
 * the truth ("we couldn't send the code") rather than a misleading success.
 */
export async function sendMail({ to, subject, html, text }) {
  if (!transport) {
    console.log("\n========= [DEV EMAIL] =========");
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html);
    console.log("===============================\n");
    mailerStatus.lastSentAt = new Date().toISOString();
    mailerStatus.sent++;
    return;
  }

  const maxAttempts = 2;
  const deadline = Date.now() + SEND_DEADLINE_MS;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (Date.now() >= deadline) {
      lastErr = lastErr || new Error("Timed out while sending the email.");
      break;
    }
    try {
      await transport.sendMail({
        from: `"${FROM_NAME}" <${built.from}>`,
        to,
        subject,
        text,
        html,
      });
      mailerStatus.ready = true;
      mailerStatus.lastSentAt = new Date().toISOString();
      mailerStatus.lastError = null;
      mailerStatus.sent++;
      return;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts) break;
      if (Date.now() + 1000 >= deadline) break; // no time left for another try
      await sleep(1000);
    }
  }

  mailerStatus.ready = false;
  mailerStatus.failed++;
  mailerStatus.lastError = describeError(lastErr);
  mailerStatus.lastErrorAt = new Date().toISOString();
  console.error(`[mailer] send to ${to} failed: ${mailerStatus.lastError}`);

  const wrapped = new Error(mailerStatus.lastError);
  wrapped.isMailError = true;
  throw wrapped;
}

// Reusable branded template for a 6-digit verification code.
export function codeEmail({ title, intro, code }) {
  const text = `${title}\n\n${intro}\n\nYour code: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, you can ignore this email.`;
  const html = `
  <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #0f172a;">
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:20px;">
      <div style="width:32px;height:32px;border-radius:8px;background:#6366f1;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;">✓</div>
      <span style="font-size:18px;font-weight:700;">TaskFlow</span>
    </div>
    <h1 style="font-size:20px;margin:0 0 8px;">${title}</h1>
    <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 20px;">${intro}</p>
    <div style="background:#f1f5f9;border-radius:12px;padding:20px;text-align:center;margin-bottom:20px;">
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#4f46e5;">${code}</div>
    </div>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
  </div>`;
  return { text, html };
}
