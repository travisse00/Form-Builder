import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const cors = { "Access-Control-Allow-Origin": "*" };
  const gone = () => Response.json({ error: "Not found" }, { status: 404, headers: cors });

  if (!/^[a-z0-9-]{1,64}$/i.test(slug)) return gone();

  const admin = createAdminClient();
  const { data } = await admin
    .from("forms")
    .select("title, primary_color, avatar_url, widget_position, is_published, owner_id")
    .eq("slug", slug)
    .maybeSingle();
  if (!data || !data.is_published) return gone();

  const { data: owner } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", data.owner_id)
    .maybeSingle();
  if (owner?.is_suspended) return gone();

  return Response.json(
    {
      title: data.title,
      color: data.primary_color,
      avatar: data.avatar_url,
      position: data.widget_position,
    },
    { headers: cors }
  );
}