import { createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTestEmail, sendTestWebhook } from "@/lib/notify";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function POST(req: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return json({ error: "Please log in again." }, 401);

  const body = (await req.json().catch(() => null)) as {
    type?: string;
    webhook_id?: string;
    form_id?: string;
  } | null;

  if (body?.type === "webhook" && body.webhook_id) {
    // RLS means this only finds webhooks on forms you own
    const { data: mine } = await supabase
      .from("webhooks")
      .select("id, form_id")
      .eq("id", body.webhook_id)
      .maybeSingle();
    if (!mine) return json({ error: "Webhook not found." }, 404);

    const admin = createAdminClient();
    const [{ data: hook }, { data: form }] = await Promise.all([
      admin.from("webhooks").select("id, url, secret").eq("id", mine.id).single(),
      admin.from("forms").select("id, title, slug, notification_email").eq("id", mine.form_id).single(),
    ]);
    if (!hook || !form) return json({ error: "Webhook not found." }, 404);

    const result = await sendTestWebhook(hook, form);
    return json({ ok: result.ok, status: result.status ?? null, error: result.error ?? null });
  }

  if (body?.type === "email" && body.form_id) {
    const { data: form } = await supabase
      .from("forms")
      .select("id, title, slug, notification_email")
      .eq("id", body.form_id)
      .eq("owner_id", user.id) // published forms are public, so check ownership explicitly
      .maybeSingle();
    if (!form) return json({ error: "Form not found." }, 404);

    const result = await sendTestEmail(form);
    return json({ ok: result.ok, error: result.error ?? null });
  }

  return json({ error: "Invalid request." }, 400);
}