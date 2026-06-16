import nodemailer from "nodemailer";

// Build a Gmail SMTP transport from env vars. If they're missing (e.g. local
// dev), we fall back to "console mode": the email body is logged to the server
// console instead of being sent, so every flow is still testable without creds.
const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const enabled = Boolean(GMAIL_USER && GMAIL_APP_PASSWORD);

const transport = enabled
  ? nodemailer.createTransport({
      service: "gmail",
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    })
  : null;

if (!enabled) {
  console.warn(
    "[mailer] GMAIL_USER / GMAIL_APP_PASSWORD not set — emails will be logged to the console instead of sent."
  );
}

export async function sendMail({ to, subject, html, text }) {
  if (!enabled) {
    console.log("\n========= [DEV EMAIL] =========");
    console.log(`To:      ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(text || html);
    console.log("===============================\n");
    return;
  }
  await transport.sendMail({
    from: `"TaskFlow" <${GMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  });
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
