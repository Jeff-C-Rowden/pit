"use client";
import Link from "next/link";
import { spinNoticeWantsCage } from "@/lib/spinNotice";

/**
 * A refused or failed spin, shown where the player is looking: inside the bet dock
 * (fixed to the bottom on phones, under the cabinet on desktop) or right under the cabinet.
 */
export default function SpinNotice({ msg, onClose, where = "dock" }: { msg: string | null; onClose?: () => void; where?: "dock" | "stage" }) {
  if (!msg) return null;
  return (
    <div className={`spin-notice spin-notice-${where}`} role="alert" data-spin-notice>
      <span className="spin-notice-msg">{msg}</span>
      {spinNoticeWantsCage(msg) && <Link href="/wallet" className="spin-notice-cage">Open the Cage</Link>}
      {onClose && <button type="button" className="spin-notice-x" aria-label="Dismiss message" onClick={onClose}>×</button>}
    </div>
  );
}
