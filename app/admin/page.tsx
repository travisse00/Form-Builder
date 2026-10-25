"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Ban, RefreshCw, Search, ShieldCheck, ShieldOff, UserCheck } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "user" | "admin";
  is_suspended: boolean;
  created_at: string;
  forms: number;
};

type Overview = {
  me: string;
  stats: {
    users: number; suspended: number; admins: number; newUsers7d: number;
    forms: number; published: number; responses: number; responses7d: number;
  };
  series: { labels: string[]; users: number[]; responses: number[] };
  activity: {
    users: { id: string; email: string | null; full_name: string | null; created_at: string }[];
    forms: { id: string; title: string; is_published: boolean; owner: string; created_at: string }[];
    responses: { id: string; form: string; created_at: string }[];
    audit: { id: string; admin_email: string | null; action: string; target_email: string | null; created_at: string }[];
  };
  errors: {
    counts: { server: number; webhooks: number; emails: number };
    server: { id: string; source: string; message: string; created_at: string }[];
    webhooks: { id: string; target: string; status_code: number | null; error: string | null; created_at: string }[];
    emails: { id: string; to_email: string; error: string | null; created_at: string }[];
  };
};

const TABS = ["Overview", "Users", "Activity", "Errors"] as const;
type Tab = (typeof TABS)[number];

const ACTION_TEXT: Record<string, string> = {
  suspend: "suspended",
  reactivate: "reactivated",
  make_admin: "made admin",
  remove_admin: "removed admin access from",
};

const at = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const shortDay = (key: string) =>
  new Date(key + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}

function Chart({ labels, users, responses }: Overview["series"]) {
  const W = 640, H = 200, L = 32, R = 10, T = 10, B = 24;
  const n = labels.length;
  const max = Math.max(1, ...users, ...responses);
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const lines = [
    { name: "New users", color: "#8b5cf6", values: users },
    { name: "Responses", color: "#10b981", values: responses },
  ];

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="New users and responses over the last 14 days">
        {[0, 1, 2, 3, 4].map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y((top / 4) * t)} y2={y((top / 4) * t)} className="stroke-line" strokeWidth={1} />
            <text x={L - 6} y={y((top / 4) * t) + 4} textAnchor="end" className="fill-muted" fontSize="11">
              {(top / 4) * t}
            </text>
          </g>
        ))}
        {[0, Math.floor((n - 1) / 2), n - 1].map((i, k) => (
          <text key={i} x={x(i)} y={H - 6} textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} className="fill-muted" fontSize="11">
            {shortDay(labels[i])}
          </text>
        ))}
        {lines.map((s) => (
          <g key={s.name}>
            <polyline fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            {s.values.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color}>
                <title>{`${s.name}: ${v} (${shortDay(labels[i])})`}</title>
              </circle>
            ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex gap-4 text-sm text-muted">
        {lines.map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted">Days are in UTC.</p>
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [data, setData] = useState<Overview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [size, setSize] = useState(15);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const api = useCallback(
    async (url: string, init?: RequestInit) => {
      const res = await fetch(url, init);
      if (res.status === 401) {
        router.replace("/login");
        throw new Error("auth");
      }
      if (res.status === 403) {
        router.replace("/dashboard");
        throw new Error("auth");
      }
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Something went wrong.");
      return body;
    },
    [router]
  );

  const loadOverview = useCallback(async () => {
    try {
      setData(await api("/api/admin/overview"));
    } catch (e) {
      if (e instanceof Error && e.message !== "auth") setError(e.message);
    }
    setLoading(false);
  }, [api]);

  const loadUsers = useCallback(async () => {
    try {
      const r = await api(`/api/admin/users?q=${encodeURIComponent(q)}&page=${page}`);
      setUsers(r.users);
      setTotal(r.total);
      setSize(r.size);
    } catch (e) {
      if (e instanceof Error && e.message !== "auth") setError(e.message);
    }
  }, [api, q, page]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (tab === "Users") loadUsers();
  }, [tab, loadUsers]);

  // wait until the person stops typing before searching
  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0);
      setQ(search.trim());
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  async function act(u: UserRow, action: string, question: string) {
    if (!confirm(question)) return;
    setError("");
    setMsg("");
    setBusyId(u.id);
    try {
      const r = await api(`/api/admin/users/${u.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setMsg(r.message ?? "Done.");
      await Promise.all([loadUsers(), loadOverview()]);
    } catch (e) {
      if (e instanceof Error && e.message !== "auth") setError(e.message);
    }
    setBusyId("");
  }

  if (loading) return <p className="p-10 text-muted">Loading...</p>;
  if (!data) return <p className="p-10 text-red-500">{error || "Couldn't load the admin dashboard."}</p>;

  const { stats, series, activity, errors } = data;
  const errorTotal = errors.counts.server + errors.counts.webhooks + errors.counts.emails;
  const pages = Math.max(1, Math.ceil(total / size));
  const btn = "flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs hover:bg-fg/5 disabled:opacity-50";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="flex items-center gap-2 text-sm">
          <button onClick={loadOverview} className={btn}>
            <RefreshCw size={14} /> Refresh
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Admin</h1>
        <span className="flex items-center gap-1 rounded-full bg-violet-500/15 px-2.5 py-0.5 text-xs font-medium text-accent">
          <ShieldCheck size={12} /> Administrator
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-1 rounded-lg bg-fg/5 p-1 text-sm sm:w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 ${tab === t ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"}`}
          >
            {t}
            {t === "Errors" && errorTotal > 0 && (
              <span className="ml-2 rounded-full bg-red-500/15 px-1.5 text-xs text-red-500">{errorTotal}</span>
            )}
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {msg && !error && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}

      {tab === "Overview" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Users" value={stats.users} />
            <Stat label="New users (7 days)" value={stats.newUsers7d} />
            <Stat label="Suspended" value={stats.suspended} />
            <Stat label="Admins" value={stats.admins} />
            <Stat label="Forms" value={stats.forms} />
            <Stat label="Published forms" value={stats.published} />
            <Stat label="Responses" value={stats.responses} />
            <Stat label="Responses (7 days)" value={stats.responses7d} />
          </div>
          {errorTotal > 0 && (
            <button onClick={() => setTab("Errors")} className="w-full rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-3 text-left text-sm">
              {errorTotal} {errorTotal === 1 ? "error" : "errors"} in the last 24 hours. View the Errors tab.
            </button>
          )}
          <Card title="Last 14 days">
            <Chart {...series} />
          </Card>
        </div>
      )}

      {tab === "Users" && (
        <div className="mt-6">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="w-full rounded-lg bg-fg/5 py-3 pl-11 pr-4 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40"
            />
          </div>

          <p className="mt-3 text-sm text-muted">{total} {total === 1 ? "user" : "users"}</p>

          <div className="mt-3 space-y-3">
            {users.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                No users found.
              </div>
            )}

            {users.map((u) => {
              const isMe = u.id === data.me;
              const busy = busyId === u.id;
              return (
                <div key={u.id} className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{u.full_name || "No name"}</p>
                      {u.role === "admin" && (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-accent">Admin</span>
                      )}
                      {u.is_suspended && (
                        <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-500">Suspended</span>
                      )}
                      {isMe && <span className="text-xs text-muted">(you)</span>}
                    </div>
                    <p className="truncate text-sm text-muted">{u.email}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {u.forms} {u.forms === 1 ? "form" : "forms"} · Joined {at(u.created_at)}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {u.is_suspended ? (
                      <button disabled={busy} className={btn}
                        onClick={() => act(u, "reactivate", `Reactivate ${u.email}? They will be able to sign in again.`)}>
                        <UserCheck size={14} /> Reactivate
                      </button>
                    ) : (
                      !isMe && u.role !== "admin" && (
                        <button disabled={busy} className={`${btn} text-red-500`}
                          onClick={() => act(u, "suspend", `Suspend ${u.email}? They will be signed out and their public forms will stop working.`)}>
                          <Ban size={14} /> Suspend
                        </button>
                      )
                    )}
                    {u.role === "user" && !u.is_suspended && (
                      <button disabled={busy} className={btn}
                        onClick={() => act(u, "make_admin", `Give ${u.email} full admin access?`)}>
                        <ShieldCheck size={14} /> Make admin
                      </button>
                    )}
                    {u.role === "admin" && !isMe && (
                      <button disabled={busy} className={btn}
                        onClick={() => act(u, "remove_admin", `Remove admin access from ${u.email}?`)}>
                        <ShieldOff size={14} /> Remove admin
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-muted">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className={btn}>Previous</button>
              <span>Page {page + 1} of {pages}</span>
              <button disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)} className={btn}>Next</button>
            </div>
          )}
        </div>
      )}

      {tab === "Activity" && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Card title="Newest users">
            {activity.users.length === 0 ? <Empty text="No users yet." /> : (
              <ul className="divide-y divide-line">
                {activity.users.map((u) => (
                  <li key={u.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="truncate text-sm">{u.full_name || u.email}</p>
                    <p className="text-xs text-muted">{u.email} · {at(u.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Newest forms">
            {activity.forms.length === 0 ? <Empty text="No forms yet." /> : (
              <ul className="divide-y divide-line">
                {activity.forms.map((f) => (
                  <li key={f.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="truncate text-sm">{f.title} <span className="text-muted">({f.is_published ? "published" : "draft"})</span></p>
                    <p className="truncate text-xs text-muted">{f.owner} · {at(f.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Latest responses">
            {activity.responses.length === 0 ? <Empty text="No responses yet." /> : (
              <ul className="divide-y divide-line">
                {activity.responses.map((r) => (
                  <li key={r.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="truncate text-sm">{r.form}</p>
                    <p className="text-xs text-muted">{at(r.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Admin actions">
            {activity.audit.length === 0 ? <Empty text="No admin actions yet." /> : (
              <ul className="divide-y divide-line">
                {activity.audit.map((a) => (
                  <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="break-words text-sm">
                      {a.admin_email ?? "An admin"} {ACTION_TEXT[a.action] ?? a.action} {a.target_email ?? "a user"}
                    </p>
                    <p className="text-xs text-muted">{at(a.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === "Errors" && (
        <div className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Server errors (24h)" value={errors.counts.server} />
            <Stat label="Failed webhooks (24h)" value={errors.counts.webhooks} />
            <Stat label="Failed emails (24h)" value={errors.counts.emails} />
          </div>

          <Card title="Server errors">
            {errors.server.length === 0 ? <Empty text="No server errors recorded." /> : (
              <ul className="divide-y divide-line">
                {errors.server.map((e) => (
                  <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="break-words text-sm"><span className="text-muted">{e.source}</span> · {e.message}</p>
                    <p className="text-xs text-muted">{at(e.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Failed webhooks">
            {errors.webhooks.length === 0 ? <Empty text="No failed webhooks." /> : (
              <ul className="divide-y divide-line">
                {errors.webhooks.map((w) => (
                  <li key={w.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="break-words text-sm">{w.target}{w.status_code ? ` (${w.status_code})` : ""}</p>
                    {w.error && <p className="break-words text-xs text-red-500">{w.error}</p>}
                    <p className="text-xs text-muted">{at(w.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Failed emails">
            {errors.emails.length === 0 ? <Empty text="No failed emails." /> : (
              <ul className="divide-y divide-line">
                {errors.emails.map((m) => (
                  <li key={m.id} className="py-2.5 first:pt-0 last:pb-0">
                    <p className="break-words text-sm">{m.to_email}</p>
                    {m.error && <p className="break-words text-xs text-red-500">{m.error}</p>}
                    <p className="text-xs text-muted">{at(m.created_at)}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </main>
  );
}