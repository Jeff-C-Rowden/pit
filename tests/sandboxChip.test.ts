import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { SANDBOX_CHIP_LABEL } from "@/lib/sandboxLabel";
import { HIT_HISTORY_SANDBOX } from "@/lib/hitHistory";
import { POT_SHEET_SANDBOX } from "@/lib/potSheet";

const src = (p: string) => readFileSync(p, "utf8");

describe("Jackpot Desk J5: one sandbox chip on every jackpot surface", () => {
  it("uses one plain label that says no cash value", () => {
    expect(SANDBOX_CHIP_LABEL).toBe("Sandbox chips · no cash value");
    expect(HIT_HISTORY_SANDBOX).toBe(SANDBOX_CHIP_LABEL);
    expect(POT_SHEET_SANDBOX).toBe(SANDBOX_CHIP_LABEL);
  });

  it.each([
    ["lobby Jackpot Desk meters", "src/app/floor/page.tsx"],
    ["Antler Ridge meter strip + win card", "src/app/vault/page.tsx"],
    ["hit history", "src/components/HitHistory.tsx"],
    ["pot sheet", "src/components/PotSheet.tsx"],
  ])("%s renders the shared SandboxChip", (_n, file) => {
    expect(src(file)).toContain("<SandboxChip");
  });

  it("the jackpot win card no longer says 'Demo jackpot' and every history row carries the label for screen readers", () => {
    const vault = src("src/app/vault/page.tsx");
    expect(vault).not.toContain("Demo jackpot");
    const card = vault.slice(vault.indexOf('className="vault-jp-card"'), vault.indexOf('className="vault-jp-headline"'));
    expect(card).toContain("<SandboxChip");
    const hh = src("src/components/HitHistory.tsx");
    const row = hh.slice(hh.indexOf('className="hh-row"'), hh.indexOf("</li>"));
    expect(row).toContain("HIT_HISTORY_SANDBOX");
  });

  it("the meter strip in the cabinet topper carries the chip", () => {
    const vault = src("src/app/vault/page.tsx");
    const topper = vault.slice(vault.indexOf("<CabinetTopper"), vault.indexOf("</CabinetTopper>"));
    expect(topper).toContain("<ProgressiveMeterStrip");
    expect(topper).toContain("<SandboxChip");
  });
});
