// SS3 haptics + sound kit: separate remembered Music / Effects / Haptics switches, off by default;
// per-win-tier haptic, bonus double pulse, reel-stop tick is sound only, no haptic on losses.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";
import {
  anyFeelOn, BONUS_DOUBLE_PULSE, FEEL_KEYS, feelSummary, hapticPattern, hapticsAllowed, LEGACY_SOUND_KEY,
  MUSIC_GAIN, readFeel, WIN_TIER_HAPTIC, writeFeel,
} from "../src/lib/feelSettings";
import { winTier, type WinTier } from "../src/lib/winCelebration";

function mem(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => (m.has(k) ? m.get(k)! : null), setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe("SS3 feel settings", () => {
  it("all three switches are off by default", () => {
    expect(readFeel(mem())).toEqual({ music: false, effects: false, haptics: false });
    expect(readFeel(null)).toEqual({ music: false, effects: false, haptics: false });
    expect(feelSummary(readFeel(mem()))).toBe("OFF");
  });
  it("each switch is remembered separately", () => {
    const s = mem();
    writeFeel(s, "haptics", true);
    expect(readFeel(s)).toEqual({ music: false, effects: false, haptics: true });
    writeFeel(s, "music", true);
    writeFeel(s, "haptics", false);
    expect(readFeel(s)).toEqual({ music: true, effects: false, haptics: false });
    expect(s.getItem(FEEL_KEYS.music)).toBe("on");
    expect(s.getItem(FEEL_KEYS.haptics)).toBe("off");
    expect(feelSummary(readFeel(s))).toBe("MUSIC");
  });
  it("migrates the old single Sound & feel switch to Effects + Haptics, never Music", () => {
    expect(readFeel(mem({ [LEGACY_SOUND_KEY]: "on" }))).toEqual({ music: false, effects: true, haptics: true });
    expect(readFeel(mem({ [LEGACY_SOUND_KEY]: "off" }))).toEqual({ music: false, effects: false, haptics: false });
    // explicit new values win over the legacy key
    expect(readFeel(mem({ [LEGACY_SOUND_KEY]: "on", [FEEL_KEYS.haptics]: "off" })).haptics).toBe(false);
  });
  it("legacy key mirrors 'anything on' for older tabs", () => {
    const s = mem();
    writeFeel(s, "effects", true);
    expect(s.getItem(LEGACY_SOUND_KEY)).toBe("on");
    writeFeel(s, "effects", false);
    expect(s.getItem(LEGACY_SOUND_KEY)).toBe("off");
    expect(anyFeelOn(readFeel(s))).toBe(false);
  });
  it("a throwing storage reads as all off", () => {
    const bad = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(readFeel(bad)).toEqual({ music: false, effects: false, haptics: false });
  });
});

describe("SS3 haptic patterns", () => {
  it("never buzzes on a loss, a reel stop, or a pay that does not beat the bet", () => {
    expect(hapticPattern({ kind: "loss" })).toEqual([]);
    expect(hapticPattern({ kind: "reelStop" })).toEqual([]);
    for (const [bet, win] of [[100, 0], [100, 50], [100, 100]]) {
      expect(winTier(bet, win)).toBe("none");
      expect(hapticPattern({ kind: "win", tier: winTier(bet, win) })).toEqual([]);
    }
  });
  it("win haptic grows with the honest win tier", () => {
    const tiers: WinTier[] = ["small", "nice", "big", "huge"];
    const total = (p: number[]) => p.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
    for (let i = 0; i < tiers.length; i++) {
      const p = hapticPattern({ kind: "win", tier: tiers[i]! });
      expect(p.length % 2).toBe(1); // pulses separated by gaps, ends on a pulse
      if (i > 0) {
        const prev = hapticPattern({ kind: "win", tier: tiers[i - 1]! });
        expect(p.length).toBeGreaterThan(prev.length);
        expect(total(p)).toBeGreaterThan(total(prev));
      }
    }
    expect(hapticPattern({ kind: "win", tier: winTier(100, 150) })).toEqual(WIN_TIER_HAPTIC.small);
    expect(hapticPattern({ kind: "win", tier: winTier(100, 2100) })).toEqual(WIN_TIER_HAPTIC.huge);
  });
  it("bonus trigger is exactly one double pulse", () => {
    expect(hapticPattern({ kind: "bonus" })).toEqual(BONUS_DOUBLE_PULSE);
    expect(BONUS_DOUBLE_PULSE.length).toBe(3);
    expect(BONUS_DOUBLE_PULSE[0]).toBe(BONUS_DOUBLE_PULSE[2]);
  });
  it("haptics need the Haptics switch and no Reduce Motion", () => {
    const on = { music: false, effects: false, haptics: true };
    expect(hapticsAllowed(on, false)).toBe(true);
    expect(hapticsAllowed(on, true)).toBe(false);
    expect(hapticsAllowed({ ...on, haptics: false, effects: true, music: true }, false)).toBe(false);
  });
  it("music sits well below effects", () => {
    expect(MUSIC_GAIN).toBeGreaterThan(0);
    expect(MUSIC_GAIN).toBeLessThan(0.03);
  });
});

describe("SS3 runtime gating (feel.ts)", () => {
  let vibrate: ReturnType<typeof vi.fn>;
  let store: ReturnType<typeof mem>;
  let reduce = false;
  beforeEach(() => {
    vi.resetModules();
    vibrate = vi.fn(() => true);
    store = mem();
    reduce = false;
    vi.stubGlobal("window", {
      localStorage: store,
      matchMedia: () => ({ matches: reduce }),
      dispatchEvent: () => true,
      setTimeout, clearTimeout, setInterval, clearInterval,
    });
    vi.stubGlobal("navigator", { vibrate });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("nothing vibrates while every switch is off (the default)", async () => {
    const f = await import("../src/lib/feel");
    f.playWinTier("huge"); f.playFeature(); f.playSpin(); f.playThunk(); f.playPayout(3);
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("Effects alone never vibrates; Haptics alone vibrates", async () => {
    const f = await import("../src/lib/feel");
    f.setFeel("effects", true);
    f.playWinTier("big");
    expect(vibrate).not.toHaveBeenCalled();
    f.setFeel("effects", false);
    f.setFeel("haptics", true);
    f.playWinTier("big");
    expect(vibrate).toHaveBeenCalledWith(WIN_TIER_HAPTIC.big);
  });
  it("tiers: none is silent, bonus is the double pulse, reel stop never vibrates", async () => {
    const f = await import("../src/lib/feel");
    f.setFeel("haptics", true);
    f.playWinTier("none");
    f.playThunk();
    expect(vibrate).not.toHaveBeenCalled();
    f.playFeature();
    expect(vibrate).toHaveBeenLastCalledWith(BONUS_DOUBLE_PULSE);
  });
  it("Reduce Motion blocks every haptic even with Haptics on", async () => {
    const f = await import("../src/lib/feel");
    f.setFeel("haptics", true);
    reduce = true;
    f.playWinTier("huge"); f.playFeature(); f.playSpin();
    expect(vibrate).not.toHaveBeenCalled();
  });
  it("slot banners can hand the haptic to the win plate (no double buzz)", async () => {
    const f = await import("../src/lib/feel");
    f.setFeel("haptics", true);
    f.playPayout(2, false);
    expect(vibrate).not.toHaveBeenCalled();
    f.playPayout(2);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
  it("soundOn (cabinet lights) is true when any switch is on", async () => {
    const f = await import("../src/lib/feel");
    expect(f.soundOn()).toBe(false);
    f.setFeel("music", true);
    expect(f.soundOn()).toBe(true);
    expect(f.musicOn()).toBe(true);
    f.setFeel("music", false);
    expect(f.soundOn()).toBe(false);
  });
  it("Music starts only when its switch is on and stops when turned off (WebAudio, no files)", async () => {
    const made: string[] = [];
    const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} });
    const node = (kind: string) => { made.push(kind); return { type: "", frequency: param(), detune: param(), gain: param(), Q: param(), context: fake, connect(n: unknown) { return n; }, disconnect() {}, start() {}, stop() {} }; };
    const fake = { state: "running", currentTime: 0, destination: {}, resume() {}, createOscillator: () => node("osc"), createGain: () => node("gain"), createBiquadFilter: () => node("filter") };
    (globalThis.window as unknown as Record<string, unknown>).AudioContext = function () { return fake; };
    const f = await import("../src/lib/feel");
    f.startMusic();
    expect(f.musicPlaying()).toBe(false); // switch off: nothing plays
    f.setFeel("music", true);
    expect(f.musicPlaying()).toBe(true);
    expect(made.filter((k) => k === "osc").length).toBeGreaterThan(0);
    f.setFeel("music", false);
    expect(f.musicPlaying()).toBe(false);
  });
});

describe("SS3 wiring", () => {
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
  it("reel-stop tick is sound only (no buzz in playThunk)", () => {
    const src = read("src/lib/feel.ts");
    const body = src.slice(src.indexOf("export function playThunk"), src.indexOf("export function playFeature"));
    expect(body).not.toMatch(/buzz\(/);
    expect(body).toMatch(/tick/);
  });
  it("the win plate fires the tier haptic only when a plate exists", () => {
    const src = read("src/components/WinCelebration.tsx");
    expect(src).toMatch(/hapticKey = celebration && plate \? celebration.key : null/);
    expect(src).toMatch(/if \(hapticKey\) playWinTier\(tier\)/);
  });
  it("every slot cabinet's YOU WIN banner hands haptics to the plate", () => {
    for (const p of ["src/app/slot/page.tsx", "src/app/mine/page.tsx", "src/app/clover/page.tsx", "src/app/prairie/page.tsx", "src/app/vault/page.tsx", "src/components/BuckshotGame.tsx"]) {
      expect(read(p), p).toMatch(/tierHaptics/);
    }
  });
  it("sounds are synthesized (no audio files referenced)", () => {
    for (const p of ["src/lib/feel.ts", "src/components/FeelSettings.tsx"]) {
      expect(read(p)).not.toMatch(/\.(mp3|wav|ogg|m4a)\b|new Audio\(/);
    }
  });
});
