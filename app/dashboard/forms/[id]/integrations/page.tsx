"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, Copy, KeyRound, Mail, RefreshCw, Send, Trash2, Plus, Webhook } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

type Hook = { id: string; url: string; is_active: boolean; created_at: string };
type Delivery = {
  id: string;
  kind: "Webhook" | "Email";
  target: string;
  status: "success" | "failed";
  code: number | null;
  error: string | null;
  at: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const field =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";
const btn =
  "flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5 disabled:opacity-50";

function newSecret() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export default function IntegrationsPage() {
  const router = useRouter();
  const id = useParams().id as string;

  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [savedEmail, setSavedEmail] = useState("");
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [newUrl, setNewUrl] = useState("");
  const [secret, setSecret] = useState<{ host: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const loadDeliveries = useCallback(async () => {
    const supabase = createClient();
    const [w, e] = await Promise.all([
      supabase
        .from("webhook_deliveries")
        .select("id, status, status_code, error, created_at, webhooks!inner(url, form_id)")
        .eq("webhooks.form_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("email_deliveries")
        .select("id, to_email, status, error, created_at")
        .eq("form_id", id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const rows: Delivery[] = [
      ...(w.data ?? []).map((d) => {
        const hook = Array.isArray(d.webhooks) ? d.webhooks[0] : d.webhooks;
        return {
          id: d.id as string,
          kind: "Webhook" as const,
          target: hostOf(hook?.url ?? ""),
          status: d.status as "success" | "failed",
          code: (d.status_code as number | null) ?? null,
          error: (d.error as string | null) ?? null,
          at: d.created_at as string,
        };
      }),
      ...(e.data ?? []).map((d) => ({
        id: d.id as string,
        kind: "Email" as const,
        target: d.to_email as string,
        status: d.status as "success" | "failed",
        code: null,
        error: (d.error as string | null) ?? null,
        at: d.created_at as string,
      })),
    ]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 20);

    setDeliveries(rows);
  }, [id]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      const { data: form } = await supabase
        .from("forms")
        .select("title, notification_email")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();
      if (!form) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      setTitle(form.title);
      setEmail(form.notification_email ?? "");
      setSavedEmail(form.notification_email ?? "");

      const { data: list } = await supabase
        .from("webhooks")
        .select("id, url, is_active, created_at")
        .eq("form_id", id)
        .order("created_at");
      setHooks((list ?? []) as Hook[]);

      await loadDeliveries();
      setLoading(false);
    }
    load();
  }, [id, router, loadDeliveries]);

  async function saveEmail() {
    setError("");
    setMsg("");
    const value = email.trim();
    if (value && !EMAIL_RE.test(value)) return setError("Enter a valid email address.");
    setBusy("email");
    const { error } = await createClient()
      .from("forms")
      .update({ notification_email: value || null })
      .eq("id", id);
    setBusy("");
    if (error) return setError(error.message);
    setSavedEmail(value);
    setMsg(value ? "Email notifications are on." : "Email notifications are off.");
  }

  async function runTest(body: object, key: string) {
    setError("");
    setMsg("");
    setBusy(key);
    try {
      const res = await fetch("/api/integrations/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) setMsg("Test sent successfully.");
      else setError(data?.error ?? "The test failed. See the delivery log below.");
    } catch {
      setError("Couldn't run the test.");
    }
    setBusy("");
    await loadDeliveries();
  }

  async function addWebhook() {
    setError("");
    setMsg("");
    let u: URL;
    try {
      u = new URL(newUrl.trim());
    } catch {
      return setError("Enter a full URL, e.g. https://example.com/hook");
    }
    if (u.protocol !== "https:") return setError("Webhook URLs must start with https://");

    setBusy("add");
    const value = newSecret();
    const { data, error } = await createClient()
      .from("webhooks")
      .insert({ form_id: id, url: u.toString(), secret: value })
      .select("id, url, is_active, created_at")
      .single();
    setBusy("");
    if (error || !data) return setError(error?.message ?? "Couldn't add the webhook.");

    setHooks((prev) => [...prev, data as Hook]);
    setNewUrl("");
    setSecret({ host: u.host, value });
  }

  async function toggleHook(h: Hook) {
    const { error } = await createClient()
      .from("webhooks")
      .update({ is_active: !h.is_active })
      .eq("id", h.id);
    if (error) return setError(error.message);
    setHooks((prev) => prev.map((x) => (x.id === h.id ? { ...x, is_active: !h.is_active } : x)));
  }

  async function removeHook(h: Hook) {
    if (!confirm(`Delete the webhook for ${hostOf(h.url)}?`)) return;
    const { error } = await createClient().from("webhooks").delete().eq("id", h.id);
    if (error) return setError(error.message);
    setHooks((prev) => prev.filter((x) => x.id !== h.id));
    await loadDeliveries();
  }

  async function regenerate(h: Hook) {
    if (!confirm("Create a new signing secret? The old one stops working immediately.")) return;
    const value = newSecret();
    const { error } = await createClient().from("webhooks").update({ secret: value }).eq("id", h.id);
    if (error) return setError(error.message);
    setSecret({ host: hostOf(h.url), value });
  }

  async function copySecret() {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  if (loading) return <p className="p-10 text-muted">Loading...</p>;
  if (notFound)
    return (
      <main className="p-10">
        <p className="text-muted">Form not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent hover:underline">
          Back to dashboard
        </Link>
      </main>
    );

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href={`/dashboard/forms/${id}`} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} /> Back
        </Link>
        <ThemeToggle />
      </header>

      <h1 className="mt-8 text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted">Integrations</p>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {msg && !error && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{msg}</p>}

      {/* Email */}
      <section className="mt-6 space-y-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-accent">
            <Mail size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Email notifications</h2>
            <p className="text-sm text-muted">Get an email each time someone submits this form.</p>
          </div>
        </div>

        <input
          className={field}
          type="email"
          placeholder="you@example.com (leave empty to turn off)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="flex flex-wrap gap-2">
          <button onClick={saveEmail} disabled={busy === "email" || email.trim() === savedEmail} className={btn}>
            {busy === "email" ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => runTest({ type: "email", form_id: id }, "test-email")}
            disabled={!savedEmail || busy === "test-email" || email.trim() !== savedEmail}
            className={btn}
          >
            <Send size={14} /> {busy === "test-email" ? "Sending..." : "Send test email"}
          </button>
        </div>
        <p className="text-xs text-muted">
          Until a custom domain is verified with the email provider, emails can only be delivered to the
          address that owns the provider account.
        </p>
      </section>

      {/* Webhooks */}
      <section className="mt-6 space-y-4 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/15 text-accent">
            <Webhook size={18} />
          </div>
          <div>
            <h2 className="font-semibold">Webhooks</h2>
            <p className="text-sm text-muted">Send every new response to another app as JSON.</p>
          </div>
        </div>

        {secret && (
          <div className="rounded-xl border border-violet-400/40 bg-violet-500/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold">
              <KeyRound size={14} /> Signing secret for {secret.host}
            </p>
            <p className="mt-1 text-muted">Copy it now. For security, it won't be shown again.</p>
            <code className="mt-3 block break-all rounded-lg bg-fg/5 p-3 text-xs">{secret.value}</code>
            <div className="mt-3 flex gap-3">
              <button onClick={copySecret} className="flex items-center gap-2 text-accent hover:underline">
                {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
              </button>
              <button onClick={() => setSecret(null)} className="text-muted hover:text-fg">
                Done
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className={field}
            placeholder="https://example.com/webhook"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
          <button
            onClick={addWebhook}
            disabled={busy === "add" || !newUrl.trim()}
            className="flex shrink-0 items-center justify-center gap-2 rounded-lg bg-violet-500 px-4 py-3 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {hooks.length === 0 ? (
          <p className="text-sm text-muted">No webhooks yet.</p>
        ) : (
          <ul className="space-y-3">
            {hooks.map((h) => (
              <li key={h.id} className="rounded-xl border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="min-w-0 truncate text-sm font-medium">{h.url}</p>
                  <label className="flex shrink-0 items-center gap-2 text-sm text-muted">
                    <input
                      type="checkbox"
                      checked={h.is_active}
                      onChange={() => toggleHook(h)}
                      className="h-4 w-4 accent-violet-500"
                    />
                    Active
                  </label>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => runTest({ type: "webhook", webhook_id: h.id }, `test-${h.id}`)}
                    disabled={busy === `test-${h.id}`}
                    className={btn}
                  >
                    <Send size={14} /> {busy === `test-${h.id}` ? "Sending..." : "Send test"}
                  </button>
                  <button onClick={() => regenerate(h)} className={btn}>
                    <RefreshCw size={14} /> New secret
                  </button>
                  <button onClick={() => removeHook(h)} className={`${btn} text-red-500`} aria-label="Delete webhook">
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Delivery log */}
      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Delivery log</h2>
          <button onClick={loadDeliveries} className="flex items-center gap-2 text-sm text-accent hover:underline">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {deliveries.length === 0 ? (
          <p className="mt-4 text-sm text-muted">Nothing sent yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-line">
            {deliveries.map((d) => (
              <li key={d.kind + d.id} className="flex flex-wrap items-start justify-between gap-2 py-3 text-sm first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="truncate">
                    <span className="text-muted">{d.kind}</span> · {d.target}
                  </p>
                  {d.error && <p className="mt-0.5 break-words text-xs text-red-500">{d.error}</p>}
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(d.at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    d.status === "success"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-red-500/15 text-red-500"
                  }`}
                >
                  {d.status === "success" ? "Delivered" : "Failed"}
                  {d.code ? ` (${d.code})` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}