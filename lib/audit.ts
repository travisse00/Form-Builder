import { createAdminClient } from "@/lib/supabase/admin";

// Records a server-side error for the admin Errors tab. Never throws.
// Don't put personal data in `context`.
export async function logError(source: string, message: string, context?: Record<string, unknown>) {
  try {
    await createAdminClient()
      .from("error_logs")
      .insert({ source, message: message.slice(0, 500), context: context ?? null });
  } catch {}
}