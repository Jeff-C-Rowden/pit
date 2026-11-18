// SS3: the "Sound & feel" kit. Three separate, remembered switches — Music, Effects, Haptics —
// all OFF by default (per device, localStorage). Pure helpers so the rules are unit-tested:
//   - Haptics follow the real settled result only: nothing for a loss, a push or a pay that does not
//     beat the bet (winTier "none"), and nothing at all for reel stops, so a losing spin never buzzes
//     and there is no near-miss tease. Reduce Motion turns every haptic off.
//   - Reel stops get a short sound tick (Effects) that is the same on every reel of every spin.
//   - A bonus trigger is one clean double pulse.
// Legacy: before SS3 one "pit.sound" switch drove both sound and buzz. If it was "on" and the player
// has not touched the new switches, Effects and Haptics start on (Music did not exist, stays off).

import type { WinTier } from "./winCelebration";

export type FeelChannel = "music" | "effects" | "haptics";
export const FEEL_CHANNELS: FeelChannel[] = ["music", "effects", "haptics"];
export const FEEL_KEYS: Record<FeelChannel, string> = {
  music: "pit.feel.music",
  effects: "pit.feel.effects",
  haptics: "pit.feel.haptics",
};
export const LEGACY_SOUND_KEY = "pit.sound";

export const FEEL_LABEL: Record<FeelChannel, { title: string; detail: string }> = {
  music: { title: "Music", detail: "Quiet synthesized lounge pad. Pauses when the tab is hidden." },
  effects: { title: "Effects", detail: "Spin kick, reel-stop tick, chip clacks and win chimes." },
  haptics: { title: "Haptics", detail: "Vibration on wins and bonus triggers only. Never on losses. Off with Reduce Motion." },
};

export type FeelState = Record<FeelChannel, boolean>;
export const FEEL_DEFAULT: FeelState = { music: false, effects: false, haptics: false };

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };

/** Reads the three switches; missing keys fall back to the legacy single switch, then to off. */
export function readFeel(store: Store | null | undefined): FeelState {
  if (!store) return { ...FEEL_DEFAULT };
  try {
    const legacyOn = store.getItem(LEGACY_SOUND_KEY) === "on";
    const one = (ch: FeelChannel): boolean => {
      const v = store.getItem(FEEL_KEYS[ch]);
      if (v === "on") return true;
      if (v === "off") return false;
      return ch === "music" ? false : legacyOn;
    };
    return { music: one("music"), effects: one("effects"), haptics: one("haptics") };
  } catch {
    return { ...FEEL_DEFAULT };
  }
}

/** Writes one switch. The legacy key mirrors "anything on" so old builds in other tabs stay sane. */
export function writeFeel(store: Store | null | undefined, ch: FeelChannel, on: boolean): FeelState {
  if (!store) return { ...FEEL_DEFAULT };
  const next = { ...readFeel(store), [ch]: on };
  try {
    for (const c of FEEL_CHANNELS) store.setItem(FEEL_KEYS[c], next[c] ? "on" : "off");
    store.setItem(LEGACY_SOUND_KEY, next.effects || next.haptics || next.music ? "on" : "off");
  } catch {}
  return next;
}

export function anyFeelOn(s: FeelState): boolean {
  return s.music || s.effects || s.haptics;
}

/** Short pill text: "OFF", "ALL ON" or the channels that are on ("FX · BUZZ"). */
export function feelSummary(s: FeelState): string {
  const on = FEEL_CHANNELS.filter((c) => s[c]);
  if (!on.length) return "OFF";
  if (on.length === 3) return "ALL ON";
  return on.map((c) => ({ music: "MUSIC", effects: "FX", haptics: "BUZZ" })[c]).join(" · ");
}

export type HapticEvent =
  | { kind: "reelStop" }
  | { kind: "spin" }
  | { kind: "win"; tier: WinTier }
  | { kind: "bonus" }
  | { kind: "loss" };

/** Per-win-tier vibration (ms). Grows with the honest tier; "none" (no profit) is silent. */
export const WIN_TIER_HAPTIC: Record<WinTier, number[]> = {
  none: [],
  small: [14],
  nice: [18, 60, 18],
  big: [26, 60, 26, 60, 26],
  huge: [32, 60, 32, 60, 32, 60, 90],
};
/** Bonus trigger: one clean double pulse. */
export const BONUS_DOUBLE_PULSE = [40, 90, 40];
export const SPIN_KICK = [12, 30, 8];

/** Vibration pattern for an event. [] means "do nothing" (losses, reel stops, sub-bet pays). */
export function hapticPattern(ev: HapticEvent): number[] {
  switch (ev.kind) {
    case "win": return WIN_TIER_HAPTIC[ev.tier] ?? [];
    case "bonus": return BONUS_DOUBLE_PULSE;
    case "spin": return SPIN_KICK;
    default: return [];
  }
}

/** Haptics fire only when the Haptics switch is on and motion is allowed. */
export function hapticsAllowed(s: FeelState, reducedMotion: boolean): boolean {
  return s.haptics && !reducedMotion;
}

/** Lounge pad chord roots (Hz) for the Music loop: slow, calm, no rising "build" tied to play. */
export const MUSIC_CHORDS: number[][] = [
  [130.81, 196.0, 246.94], // C maj7-ish
  [110.0, 164.81, 261.63], // A min
  [87.31, 174.61, 220.0], // F maj
  [98.0, 146.83, 246.94], // G
];
export const MUSIC_CHORD_SECONDS = 8;
/** Master gain for music: kept well under effects so it sits in the background. */
export const MUSIC_GAIN = 0.018;
