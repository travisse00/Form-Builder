import { createAdminClient } from "@/lib/supabase/admin";
import { allow, clientId } from "@/lib/ratelimit";
import { signToken } from "@/lib/spam";
import { isFormLive } from "@/lib/forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { form_id?: unknown; log_view?: unknown } | null;
  const formId = body?.form_id;
  if (typeof formId !== "string" || !UUID.test(formId)) {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const who = clientId(req);
  if (!(await allow(`session:${who}`, 120, 3600))) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }
  if (!(await isFormLive(formId))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  if (body?.log_view === true && (await allow(`view:${who}:${formId}`, 30, 3600))) {
    await createAdminClient().from("form_events").insert({ form_id: formId, event_type: "view" });
  }

  return Response.json({ token: signToken(formId) });
}