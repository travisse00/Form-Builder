import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { signToken, verifyToken } from "@/lib/spam";

const FORM = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "unit-test-secret";
});
afterEach(() => vi.useRealTimers());

describe("session tickets", () => {
  it("accepts a fresh ticket and reports its age", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    const token = signToken(FORM);
    vi.setSystemTime(new Date("2026-10-25T10:00:07Z"));
    const result = verifyToken(FORM, token);
    expect(result.ok).toBe(true);
    if (result.ok) expect(Math.round(result.ageSeconds)).toBe(7);
  });

  it("rejects a ticket used on a different form", () => {
    const token = signToken(FORM);
    expect(verifyToken(OTHER, token).ok).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const token = signToken(FORM);
    const forged = token.slice(0, -1) + (token.endsWith("A") ? "B" : "A");
    expect(verifyToken(FORM, forged).ok).toBe(false);
  });

  it("rejects garbage", () => {
    for (const junk of ["", "abc", "1.2.3", "1234567890123.abc"]) {
      expect(verifyToken(FORM, junk).ok).toBe(false);
    }
  });

  it("expires after 12 hours", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    const token = signToken(FORM);
    vi.setSystemTime(new Date("2026-10-25T22:00:01Z"));
    const result = verifyToken(FORM, token);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects tickets dated in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-25T10:00:00Z"));
    const token = signToken(FORM);
    vi.setSystemTime(new Date("2026-10-25T09:59:50Z"));
    expect(verifyToken(FORM, token).ok).toBe(false);
  });
});