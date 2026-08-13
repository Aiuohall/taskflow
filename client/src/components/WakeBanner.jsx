import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { onApiWaking } from "../api";

/**
 * Shown while api.js is retrying a request that timed out.
 *
 * The API runs on a free tier that suspends after ~15 minutes idle and needs
 * up to a minute to boot. Without this, the first visit after a quiet period
 * looks like the app is broken — telling the user what's happening costs
 * nothing and makes the wait legible.
 */
export default function WakeBanner() {
  const [waking, setWaking] = useState(false);

  useEffect(() => onApiWaking(setWaking), []);

  if (!waking) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 bg-indigo-500/90 px-4 py-2 text-center text-sm font-medium text-white shadow-lg backdrop-blur"
    >
      <Loader2 size={15} className="animate-spin" />
      Waking the server up — this can take up to a minute on the free tier.
    </div>
  );
}
