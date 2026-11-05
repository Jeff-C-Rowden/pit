export const PERIOD_LABEL: Record<string, string> = { day: "Daily", week: "Weekly", month: "Monthly", all: "All-time" };
/** "Fri, Nov 6, 12:00 AM CST": always shown in the zone the limits are counted in. */
export function chicagoTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}
