import { createClient } from "@supabase/supabase-js";

// Uses the service role key, which bypasses RLS. Only import this from server code
// (API routes). Never import it in a component with "use client".
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}