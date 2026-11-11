// Spin refusals (not enough chips, limits, a busy ledger) must show next to the Spin controls.
// Before this, slot pages printed them above the cabinet, out of view on phones and desktops,
// so a refused spin looked like a dead Spin button ("nothing is working").

/** Offer a Cage link when the message is about chips or funds. */
export function spinNoticeWantsCage(msg: string | null | undefined): boolean {
  if (!msg) return false;
  return /\bcage\b|sandbox chips|add chips|insufficient|not enough/i.test(msg);
}
