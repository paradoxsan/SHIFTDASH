"use client";

import { useState } from "react";

/**
 * Copy-to-clipboard for a client report link.
 *
 * The link is the deliverable here — you open the internal report to read it,
 * but the client version exists to be forwarded, and forwarding starts with a
 * copy. Shows the URL too, because a link you paste into WhatsApp is something
 * you want to eyeball first.
 */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard is blocked outside a secure context / without permission —
      // fall back to selecting it so the user can copy by hand.
      window.prompt("העתק את הקישור:", url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      onClick={copy}
      className="chip"
      style={copied ? { borderColor: "var(--color-ok)", color: "var(--color-ok)" } : undefined}
      title={url}
    >
      {copied ? "הועתק ✓" : `העתק קישור · ${label}`}
    </button>
  );
}
