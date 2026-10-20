import { createClient } from "@supabase/supabase-js";

// export const dynamic = "force-dynamic";

export async function GET( _req: Request, { params }: { params: Promise<{ slug: string }> } ) {
  const { slug } = await params;
 const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data } = await supabase
    .from("forms")
    .select("title, primary_color, is_published")
    .eq("slug", slug)
    .maybeSingle();

  if (!data || !data.is_published) {
    return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
  }

  return Response.json(
    { title: data.title, color: data.primary_color },
    { headers: corsHeaders }
  );
}