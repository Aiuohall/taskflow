import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Password field with a show/hide toggle.
 *
 * Typing a password blind is the main cause of failed sign-ins, and it's worse
 * on phones where autocorrect and shifted keyboards hide mistakes. The toggle
 * is a plain button rather than a checkbox so it stays reachable by keyboard
 * and announces its state to screen readers.
 */
export default function PasswordInput({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        // pr-11 keeps the text from running underneath the toggle button.
        className={`${className} pr-11`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Skipped in tab order: it's a convenience, and stopping between the
        // password field and the submit button on every sign-in is worse.
        tabIndex={-1}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition-colors hover:text-slate-300"
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
