"use client";
import { useEffect, useState } from "react";
import { chicagoTime } from "@/lib/limitText";

const KEY = "pit.exclRemind";
/** Opt-in, in-app only: remember the end time on this device. Nothing is emailed or texted. */
export function RemindToggle({ until }: { until: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => { try { setOn(localStorage.getItem(KEY) === until); } catch {} }, [until]);
  const flip = () => { const v = !on; setOn(v); try { v ? localStorage.setItem(KEY, until) : localStorage.removeItem(KEY); } catch {} };
  return (
    <label className="remind-toggle">
      <input type="checkbox" checked={on} onChange={flip} />
      <span>Remind me here when it ends. <small>A note on the Floor on this device after {chicagoTime(until)}. No email or texts.</small></span>
    </label>
  );
}

/** Shows once, after the remembered end time has passed. */
export function ExclusionEndedNote() {
  const [until, setUntil] = useState<string | null>(null);
  useEffect(() => { try { const u = localStorage.getItem(KEY); if (u && Date.now() >= Date.parse(u)) setUntil(u); } catch {} }, []);
  if (!until) return null;
  const done = () => { try { localStorage.removeItem(KEY); } catch {} setUntil(null); };
  return (
    <aside className="excl-note" role="note">
      <p><b>Your time away ended</b> at {chicagoTime(until)}, as you asked us to remind you. Tables are open again. Your limits are in the <a href="/wallet#time">Cage</a> if you'd like to set them first.</p>
      <p className="excl-links"><button type="button" className="btn" onClick={done}>Got it</button></p>
    </aside>
  );
}
