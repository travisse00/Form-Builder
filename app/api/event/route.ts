import { createAdminClient } from "@/lib/supabase/admin";
import { allow, clientId } from "@/lib/ratelimit";
import { verifyToken } from "@/lib/spam";
import { isFormLive } from "@/lib/forms";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { form_id?: unknown; token?: unknown } | null;
  const formId = body?.form_id;
  const token = body?.token;
  if (typeof formId !== "string" || !UUID.test(formId) || typeof token !== "string") {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!verifyToken(formId, token).ok) return Response.json({ error: "Invalid request." }, { status: 400 });

  if (!(await allow(`event:${clientId(req)}:${formId}`, 30, 3600))) {
    return Response.json({ error: "Too many requests." }, { status: 429 });
  }
  if (!(await isFormLive(formId))) return Response.json({ error: "Not found" }, { status: 404 });

  await createAdminClient().from("form_events").insert({ form_id: formId, event_type: "start" });
  return Response.json({ ok: true });
}