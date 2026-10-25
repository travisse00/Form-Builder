import { requireAdmin } from "@/lib/admin";

const DAY = 86_400_000;
const head = { count: "exact", head: true } as const;

function bucket(rows: { created_at: string }[] | null, keys: string[]) {
  const idx = new Map(keys.map((k, i) => [k, i]));
  const out = keys.map(() => 0);
  for (const r of rows ?? []) {
    const i = idx.get(r.created_at.slice(0, 10));
    if (i !== undefined) out[i]++;
  }
  return out;
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;
  const { admin, user } = auth;

  const now = Date.now();
  const since7 = new Date(now - 7 * DAY).toISOString();
  const since1 = new Date(now - DAY).toISOString();
  const keys = Array.from({ length: 14 }, (_, i) =>
    new Date(now - (13 - i) * DAY).toISOString().slice(0, 10)
  );
  const since14 = `${keys[0]}T00:00:00Z`;

  const [users, suspended, admins, newUsers, forms, published, subs, subs7] = await Promise.all([
    admin.from("profiles").select("id", head),
    admin.from("profiles").select("id", head).eq("is_suspended", true),
    admin.from("profiles").select("id", head).eq("role", "admin"),
    admin.from("profiles").select("id", head).gte("created_at", since7),
    admin.from("forms").select("id", head),
    admin.from("forms").select("id", head).eq("is_published", true),
    admin.from("submissions").select("id", head),
    admin.from("submissions").select("id", head).gte("created_at", since7),
  ]);

  const [
    userRows, subRows, recentUsers, recentForms, recentSubs, audit,
    errs, hooks, mails, errs24, hooks24, mails24,
  ] = await Promise.all([
    admin.from("profiles").select("created_at").gte("created_at", since14).limit(10000),
    admin.from("submissions").select("created_at").gte("created_at", since14).limit(10000),
    admin.from("profiles").select("id, email, full_name, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("forms").select("id, title, is_published, owner_id, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("submissions").select("id, form_id, created_at").order("created_at", { ascending: false }).limit(8),
    admin.from("admin_audit_log").select("id, admin_email, action, target_email, created_at").order("created_at", { ascending: false }).limit(15),
    admin.from("error_logs").select("id, source, message, created_at").order("created_at", { ascending: false }).limit(25),
    admin.from("webhook_deliveries").select("id, webhook_id, status_code, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(25),
    admin.from("email_deliveries").select("id, to_email, error, created_at").eq("status", "failed").order("created_at", { ascending: false }).limit(25),
    admin.from("error_logs").select("id", head).gte("created_at", since1),
    admin.from("webhook_deliveries").select("id", head).eq("status", "failed").gte("created_at", since1),
    admin.from("email_deliveries").select("id", head).eq("status", "failed").gte("created_at", since1),
  ]);

  // Look up names for the activity lists
  const ownerIds = [...new Set((recentForms.data ?? []).map((f) => f.owner_id))];
  const formIds = [...new Set((recentSubs.data ?? []).map((s) => s.form_id))];
  const hookIds = [...new Set((hooks.data ?? []).map((h) => h.webhook_id))];

  const [owners, titles, hookRows] = await Promise.all([
    ownerIds.length ? admin.from("profiles").select("id, email").in("id", ownerIds) : Promise.resolve({ data: [] }),
    formIds.length ? admin.from("forms").select("id, title").in("id", formIds) : Promise.resolve({ data: [] }),
    hookIds.length ? admin.from("webhooks").select("id, url").in("id", hookIds) : Promise.resolve({ data: [] }),
  ]);
  const ownerEmail = new Map((owners.data ?? []).map((o) => [o.id, o.email]));
  const formTitle = new Map((titles.data ?? []).map((t) => [t.id, t.title]));
  const hookHost = new Map((hookRows.data ?? []).map((h) => [h.id, hostOf(h.url)]));

  return Response.json({
    me: user.id,
    stats: {
      users: users.count ?? 0,
      suspended: suspended.count ?? 0,
      admins: admins.count ?? 0,
      newUsers7d: newUsers.count ?? 0,
      forms: forms.count ?? 0,
      published: published.count ?? 0,
      responses: subs.count ?? 0,
      responses7d: subs7.count ?? 0,
    },
    series: {
      labels: keys,
      users: bucket(userRows.data, keys),
      responses: bucket(subRows.data, keys),
    },
    activity: {
      users: recentUsers.data ?? [],
      forms: (recentForms.data ?? []).map((f) => ({
        id: f.id,
        title: f.title,
        is_published: f.is_published,
        owner: ownerEmail.get(f.owner_id) ?? "Unknown",
        created_at: f.created_at,
      })),
      responses: (recentSubs.data ?? []).map((s) => ({
        id: s.id,
        form: formTitle.get(s.form_id) ?? "Deleted form",
        created_at: s.created_at,
      })),
      audit: audit.data ?? [],
    },
    errors: {
      counts: { server: errs24.count ?? 0, webhooks: hooks24.count ?? 0, emails: mails24.count ?? 0 },
      server: errs.data ?? [],
      webhooks: (hooks.data ?? []).map((h) => ({
        id: h.id,
        target: hookHost.get(h.webhook_id) ?? "Deleted webhook",
        status_code: h.status_code,
        error: h.error,
        created_at: h.created_at,
      })),
      emails: mails.data ?? [],
    },
  });
}