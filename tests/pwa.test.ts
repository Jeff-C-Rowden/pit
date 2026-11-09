import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import manifest from "@/app/manifest";
import { isPublicAsset } from "@/middleware";

describe("PWA manifest", () => {
  const m = manifest();
  it("is installable standalone with honest sandbox naming", () => {
    expect(m.display).toBe("standalone");
    expect(m.short_name).toBe("Pit");
    expect(m.name).toMatch(/sandbox/i);
    expect(m.description).toMatch(/no real money/i);
    expect(m.start_url).toBe("/floor");
  });
  it("ships 192, 512 and maskable icons that exist on disk", () => {
    const icons = m.icons ?? [];
    expect(icons.some((i) => i.sizes === "192x192")).toBe(true);
    expect(icons.some((i) => i.sizes === "512x512" && i.purpose === "any")).toBe(true);
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of icons) {
      expect(fs.existsSync(path.join(__dirname, "..", "public", i.src))).toBe(true);
    }
  });
});

describe("middleware public install assets", () => {
  it("lets manifest and icons through without the age cookie", () => {
    expect(isPublicAsset("/manifest.webmanifest")).toBe(true);
    expect(isPublicAsset("/icons/pit-192.png")).toBe(true);
    expect(isPublicAsset("/icon.svg")).toBe(true);
  });
  it("still gates game pages", () => {
    expect(isPublicAsset("/floor")).toBe(false);
    expect(isPublicAsset("/slot")).toBe(false);
    expect(isPublicAsset("/api/wallet")).toBe(false);
  });
});
