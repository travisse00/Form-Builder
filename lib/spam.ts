import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_AGE_SECONDS = 12 * 60 * 60;

function sign(formId: string, ts: string) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createHmac("sha256", secret).update(`session.${formId}.${ts}`).digest("base64url");
}

// A ticket stamped with the time it was issued. Can't be forged without the server key.
export function signToken(formId: string) {
  const ts = Date.now().toString();
  return `${ts}.${sign(formId, ts)}`;
}

export function verifyToken(
  formId: string,
  token: string
): { ok: true; ageSeconds: number } | { ok: false; reason: "invalid" | "expired" } {
  const parts = token.split(".");
  if (parts.length !== 2 || !/^\d{10,15}$/.test(parts[0])) return { ok: false, reason: "invalid" };

  const expected = Buffer.from(sign(formId, parts[0]));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }

  const age = (Date.now() - Number(parts[0])) / 1000;
  if (age < 0) return { ok: false, reason: "invalid" };
  if (age > MAX_AGE_SECONDS) return { ok: false, reason: "expired" };
  return { ok: true, ageSeconds: age };
}