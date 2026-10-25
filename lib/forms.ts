import { createAdminClient } from "@/lib/supabase/admin";

// A form only works for visitors when it's published and its owner isn't suspended
export async function isFormLive(formId: string) {
  const admin = createAdminClient();
  const { data: form } = await admin
    .from("forms")
    .select("is_published, owner_id")
    .eq("id", formId)
    .maybeSingle();
  if (!form?.is_published) return false;

  const { data: owner } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", form.owner_id)
    .maybeSingle();
  return !owner?.is_suspended;
}