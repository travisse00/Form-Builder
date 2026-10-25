import { requireAdmin } from "@/lib/admin";

const SIZE = 15;

export async function GET(req: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin } = auth;

  const url = new URL(req.url);
  // strip characters that have special meaning inside a search filter
  const q = (url.searchParams.get("q") ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  const page = Math.max(0, Math.min(1000, Number(url.searchParams.get("page")) || 0));

  let query = admin
    .from("profiles")
    .select("id, email, full_name, role, is_suspended, created_at", { count: "exact" });
  if (q) query = query.or(`email.ilike.%${q}%,full_name.ilike.%${q}%`);

  const { data, count, error } = await query
    .order("created_at", { ascending: false })
    .order("id")
    .range(page * SIZE, page * SIZE + SIZE - 1);
  if (error) return Response.json({ error: "Couldn't load users." }, { status: 500 });

  const ids = (data ?? []).map((u) => u.id);
  const owned = new Map<string, number>();
  if (ids.length > 0) {
    const { data: rows } = await admin.from("forms").select("owner_id").in("owner_id", ids);
    for (const r of rows ?? []) owned.set(r.owner_id, (owned.get(r.owner_id) ?? 0) + 1);
  }

  return Response.json({
    users: (data ?? []).map((u) => ({ ...u, forms: owned.get(u.id) ?? 0 })),
    total: count ?? 0,
    page,
    size: SIZE,
  });
}