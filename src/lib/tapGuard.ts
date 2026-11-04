/** Whether a click following a touch long-press should be swallowed.
 * Only the click that immediately follows the long-press (within windowMs) is eaten;
 * any later tap must always place a bet. */
export function shouldSwallowClick(suppressed: boolean, lastLongPressAt: number, now: number, windowMs = 1200): boolean {
  return suppressed && now - lastLongPressAt < windowMs;
}
