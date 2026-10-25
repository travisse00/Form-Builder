import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { allow, clientId } from "@/lib/ratelimit";
import { verifyToken } from "@/lib/spam";
import { isFormLive } from "@/lib/forms";
import { logError } from "@/lib/audit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 5 * 1024 * 1024;
const reply = (error: string, status = 400) => Response.json({ error }, { status });

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    form_id?: unknown; token?: unknown; name?: unknown; size?: unknown;
  } | null;
  const { form_id: formId, token, name, size } = body ?? {};

  if (
    typeof formId !== "string" || !UUID.test(formId) ||
    typeof token !== "string" ||
    typeof name !== "string" || name.length < 1 || name.length > 255 ||
    typeof size !== "number" || !Number.isInteger(size) || size < 1
  ) {
    return reply("Invalid request.");
  }
  if (size > MAX_BYTES) return reply("File is too large (max 5 MB).");

  const who = clientId(req);
  if (!(await allow(`upload:${who}:${formId}`, 10, 3600)) || !(await allow(`upload-all:${who}`, 30, 3600))) {
    return reply("Too many uploads. Please try again later.", 429);
  }
  if (!verifyToken(formId, token).ok) return reply("Verification failed. Please refresh the page.");
  if (!(await isFormLive(formId))) return reply("This form isn't accepting responses.", 404);

  const admin = createAdminClient();
  const { count } = await admin
    .from("questions")
    .select("id", { count: "exact", head: true })
    .eq("form_id", formId)
    .eq("type", "file_upload");
  if (!count) return reply("This form doesn't accept files.");

  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const path = `${formId}/${randomUUID()}-${safeName}`;

  const { data, error } = await admin.storage.from("form-uploads").createSignedUploadUrl(path);
  if (error || !data) {
    await logError("upload", error?.message ?? "No upload URL returned", { form_id: formId });
    return reply("Couldn't start the upload. Please try again.", 500);
  }
  return Response.json({ path, token: data.token });
}