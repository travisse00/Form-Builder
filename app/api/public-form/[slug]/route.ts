import { createAdminClient } from "@/lib/supabase/admin";
import { allow, clientId } from "@/lib/ratelimit";

const noStore = { "Cache-Control": "no-store" };
const gone = () => Response.json({ error: "Not found" }, { status: 404, headers: noStore });

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,64}$/i.test(slug)) return gone();

  if (!(await allow(`public-form:${clientId(req)}`, 300, 3600))) {
    return Response.json({ error: "Too many requests." }, { status: 429, headers: noStore });
  }

  const admin = createAdminClient();
  const { data: form } = await admin
    .from("forms")
    .select("id, title, welcome_message, completion_message, primary_color, avatar_url, is_published, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!form || !form.is_published) return gone();

  const { data: owner } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", form.owner_id)
    .maybeSingle();
  if (owner?.is_suspended) return gone();

  const { data: questions } = await admin
    .from("questions")
    .select("id, type, label, options, required, settings, condition")
    .eq("form_id", form.id)
    .order("position");
  if (!questions || questions.length === 0) return gone();

  // owner_id and notification_email are deliberately NOT sent
  return Response.json(
    {
      form: {
        id: form.id,
        title: form.title,
        welcome_message: form.welcome_message,
        completion_message: form.completion_message,
        primary_color: form.primary_color,
        avatar_url: form.avatar_url,
        is_published: true,
      },
      questions,
    },
    { headers: noStore }
  );
}