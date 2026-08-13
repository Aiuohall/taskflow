/**
 * Standalone mail diagnostic — proves whether your SMTP credentials actually
 * work, without involving the database, the API or the frontend.
 *
 *   cd server
 *   node scripts/check-mail.js you@example.com
 *
 * Reads the same variables as the server (server/.env). Run it locally first;
 * if it passes locally but the deployed site still can't send, the problem is
 * the host (missing env vars, or outbound SMTP blocked) rather than the creds.
 */
import "dotenv/config";
import { verifyMailer, sendMail, mailerStatus, codeEmail } from "../src/config/mailer.js";

const to = process.argv[2];

console.log("Mail mode:", mailerStatus.mode);
if (mailerStatus.mode === "console") {
  console.error(
    "\n✗ No SMTP credentials found.\n" +
      "  Set SMTP_HOST/SMTP_USER/SMTP_PASS, or GMAIL_USER/GMAIL_APP_PASSWORD, in server/.env\n" +
      "  and in your API host's environment settings."
  );
  process.exit(1);
}

console.log("Verifying connection and credentials…");
const ok = await verifyMailer();

if (!ok) {
  console.error(`\n✗ FAILED: ${mailerStatus.lastError}`);
  process.exit(1);
}
console.log("✓ SMTP connection and login succeeded.");

if (!to) {
  console.log("\nPass an address to also send a real test message:");
  console.log("  node scripts/check-mail.js you@example.com");
  process.exit(0);
}

console.log(`Sending a test code to ${to}…`);
try {
  const { text, html } = codeEmail({
    title: "TaskFlow test email",
    intro: "If you're reading this, sending works. This code is not valid for anything.",
    code: "123456",
  });
  await sendMail({ to, subject: "TaskFlow test email", text, html });
  console.log("✓ Sent. Check the inbox (and the spam folder).");
} catch (err) {
  console.error(`\n✗ Send failed: ${err.message}`);
  process.exit(1);
}
process.exit(0);
