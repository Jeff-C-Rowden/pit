import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spinNoticeWantsCage } from "@/lib/spinNotice";

const src = (p: string) => readFileSync(p, "utf8");

// Regression: "Nothing is working in Kettle of Clover". A refused spin (for example Max bet
// costing more than the balance) set an error that rendered above the cabinet, out of view,
// so Spin looked dead. Refusals must render inside the bet dock / right under the cabinet.
describe("spin refusals are shown next to the Spin controls", () => {
  it.each([
    ["Kettle of Clover", "src/app/clover/page.tsx"],
    ["Canary Creek Mine", "src/app/mine/page.tsx"],
    ["Thunderhoof Prairie", "src/app/prairie/page.tsx"],
    ["Sundown Trail", "src/app/slot/page.tsx"],
  ])("%s renders the error inside its ActionDock, not above the cabinet", (_n, file) => {
    const s = src(file);
    expect(s).not.toContain('{err && <p className="err">{err}</p>}');
    const dock = s.slice(s.indexOf("<ActionDock"), s.indexOf("</ActionDock>"));
    expect(dock).toContain("<SpinNotice msg={err}");
  });

  it("Buckshot Bars / Bounty Bars render the error right under the cabinet", () => {
    const s = src("src/components/BuckshotGame.tsx");
    expect(s).not.toContain('{err && <p className="err">{err}</p>}');
    const machineClose = s.indexOf("/>\n          </div>", s.indexOf("<BuckshotMachine"));
    const notice = s.indexOf('<SpinNotice msg={err}');
    expect(machineClose).toBeGreaterThan(0);
    expect(notice).toBeGreaterThan(machineClose);
    expect(notice - machineClose).toBeLessThan(40);
  });

  it("the notice is an alert and offers the Cage for chip shortfalls", () => {
    const c = src("src/components/SpinNotice.tsx");
    expect(c).toContain('role="alert"');
    expect(spinNoticeWantsCage("This spin costs $500.00 (coin × 10). Add sandbox chips in the Cage.")).toBe(true);
    expect(spinNoticeWantsCage("The sandbox ledger is briefly unavailable. Please try again.")).toBe(false);
    expect(spinNoticeWantsCage(null)).toBe(false);
  });
});
