import { describe, it, expect, afterEach } from "vitest";
import {
  getPaymentsAdapter,
  getPaymentsStatus,
  sandboxPayments,
  partnerStubPayments,
} from "../src/lib/payments";

const KEY = "PIT_PAYMENTS";

afterEach(() => {
  delete process.env[KEY];
});

describe("getPaymentsAdapter", () => {
  it("defaults to sandbox", () => {
    delete process.env[KEY];
    const pay = getPaymentsAdapter();
    expect(pay.name).toBe("sandbox");
    expect(pay.mode).toBe("sandbox");
    expect(pay.live).toBe(false);
    expect(pay).toBe(sandboxPayments);
  });

  it("selects partner stub for partner / partner_stub", async () => {
    process.env[KEY] = "partner";
    const pay = getPaymentsAdapter();
    expect(pay).toBe(partnerStubPayments);
    expect(pay.live).toBe(false);
    const dep = await pay.deposit({
      userId: "u1",
      amountCents: 1000,
      source: "partner",
    });
    expect(dep.ok).toBe(false);
    if (!dep.ok) expect(dep.error).toMatch(/partner wallet not connected/i);

    process.env[KEY] = "partner_stub";
    expect(getPaymentsAdapter()).toBe(partnerStubPayments);
  });

  it("refuses live from env alone", async () => {
    process.env[KEY] = "live";
    const pay = getPaymentsAdapter();
    expect(pay.live).toBe(false);
    expect(pay.mode).toBe("partner_stub");
    const dep = await pay.deposit({
      userId: "u1",
      amountCents: 5000,
      source: "partner",
    });
    expect(dep.ok).toBe(false);
    if (!dep.ok) expect(dep.error).toMatch(/not implemented/i);
  });

  it("getPaymentsStatus mirrors adapter", () => {
    delete process.env[KEY];
    const s = getPaymentsStatus();
    expect(s.adapter).toBe("sandbox");
    expect(s.mode).toBe("sandbox");
    expect(s.live).toBe(false);
    expect(s.message.length).toBeGreaterThan(0);
  });

  it("sandbox deposit accepts sandbox_test_funds", async () => {
    delete process.env[KEY];
    const res = await getPaymentsAdapter().deposit({
      userId: "u1",
      amountCents: 1000,
      source: "sandbox_test_funds",
    });
    expect(res.ok).toBe(true);
  });
});
