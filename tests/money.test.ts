import { describe, it, expect } from "vitest";
import { parseDollarsInput, centsToInput } from "../src/lib/money";

describe("parseDollarsInput", () => {
  it("converts dollars to integer cents", () => {
    expect(parseDollarsInput("100")).toBe(10000);
    expect(parseDollarsInput("10.5")).toBe(1050);
    expect(parseDollarsInput("0.07")).toBe(7);
    expect(parseDollarsInput("$1,234.56")).toBe(123456);
    expect(parseDollarsInput(" .25 ")).toBe(25);
    expect(parseDollarsInput("19.99")).toBe(1999); // no float drift
  });
  it("rejects blank, negative, junk and sub-cent input", () => {
    for (const bad of ["", "  ", "-5", "abc", "1.234", "1e3", "1.2.3", "$"]) expect(parseDollarsInput(bad)).toBeNull();
  });
  it("round-trips with centsToInput", () => {
    expect(centsToInput(10000)).toBe("100.00");
    expect(centsToInput(null)).toBe("");
    expect(parseDollarsInput(centsToInput(1999))).toBe(1999);
  });
});
