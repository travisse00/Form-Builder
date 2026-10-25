import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Confirms the caller is logged in, is an admin, and isn't suspended.
// Usage:  const auth = await requireAdmin();  if ("error" in auth) return auth.error;
export async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: Response.json({ error: "Please log in again." }, { status: 401 }) } as const;
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role, is_suspended, email")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "admin" || profile.is_suspended) {
    return { error: Response.json({ error: "Not allowed." }, { status: 403 }) } as const;
  }

  return { user, admin, email: (profile.email as string | null) ?? null } as const;
}