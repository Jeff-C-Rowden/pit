"use client";
import { useEffect, useState } from "react";
import { TABLE_TIPS } from "@/lib/feel";

/** Turn the one-time table tips back on. Purely local; nothing is sent anywhere. */
export default function ShowTipsSwitch() {
  const [on, setOn] = useState(false);
  const keys = Object.keys(TABLE_TIPS).map((g) => `pit_tip_v1:${g}`);
  useEffect(() => { try { setOn(keys.every((k) => !localStorage.getItem(k))); } catch {} }, []); // eslint-disable-line
  function toggle() {
    try { keys.forEach((k) => (on ? localStorage.setItem(k, "1") : localStorage.removeItem(k))); } catch {}
    setOn(!on);
  }
  return (
    <label className="tips-switch">
      <span><b>Show table tips again</b><small>{on ? "Each table shows its 10-second tip next visit." : "Tips are hidden after you tap Got it."}</small></span>
      <button type="button" role="switch" aria-checked={on} className={`switch${on ? " on" : ""}`} onClick={toggle}><span /></button>
    </label>
  );
}
