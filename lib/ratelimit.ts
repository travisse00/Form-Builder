import { createHmac } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

// A anonymous fingerprint of the caller, so we never store raw IP addresses
export function clientId(req: Request): string {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "dev")
    .update(ip)
    .digest("hex")
    .slice(0, 24);
}

// true = allowed, false = too many requests in this window.
// If the counter itself breaks we let the request through, so a database hiccup
// doesn't take every form offline.
export async function allow(key: string, max: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("Rate limit check failed:", error.message);
    return true;
  }
  return data === true;
}