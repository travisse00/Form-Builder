"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Pencil, MessageSquare, BarChart3, Eye, EyeOff,
  Copy, Check, ExternalLink, GitBranch, Webhook,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import type { Condition, QType } from "@/lib/formLogic";

type FormRow = {
  id: string;
  title: string;
  description: string | null;
  slug: string;
  is_published: boolean;
  welcome_message: string | null;
  completion_message: string | null;
  primary_color: string | null;
  avatar_url: string | null;
  widget_position: string | null;
  created_at: string;
  updated_at: string | null;
};
type QRow = { id: string; type: QType; label: string; required: boolean; condition: Condition | null };
type Answer = { question_id: string; label: string; type?: QType; answer: string | null };
type Sub = { id: string; answers: Answer[]; created_at: string };

const TYPE_LABELS: Record<QType, string> = {
  text: "Short text",
  email: "Email",
  multiple_choice: "Multiple choice",
  dropdown: "Dropdown",
  yes_no: "Yes / No",
  rating: "Rating",
  date: "Date",
  file_upload: "File upload",
};

const fileName = (path: string) => (path.split("/").pop() ?? path).replace(/^[0-9a-f-]{36}-/, "");
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" });

function previewText(s: Sub) {
  const parts = (s.answers ?? [])
    .filter((a) => a.answer)
    .slice(0, 2)
    .map((a) => (a.type === "file_upload" ? fileName(a.answer!) : a.answer!));
  return parts.length ? parts.join(" · ") : "No answers";
}

function CopyRow({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{label}</p>
        <button onClick={copy} className="flex shrink-0 items-center gap-2 text-sm text-accent hover:underline">
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="scroll-soft mt-2 overflow-x-auto rounded-lg bg-fg/5 p-3 text-xs">{text}</pre>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
    </div>
  );
}

export default function FormOverviewPage() {
  const router = useRouter();
  const id = useParams().id as string;

  const [form, setForm] = useState<FormRow | null>(null);
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [recent, setRecent] = useState<Sub[]>([]);
  const [counts, setCounts] = useState({ views: 0, starts: 0, responses: 0 });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data: f } = await supabase
        .from("forms")
        .select("*")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();

      if (!f) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const count = (table: string, type?: string) => {
        let q = supabase.from(table).select("id", { count: "exact", head: true }).eq("form_id", id);
        if (type) q = q.eq("event_type", type);
        return q;
      };

      const [qs, subs, views, starts, responses] = await Promise.all([
        supabase.from("questions").select("id, type, label, required, condition").eq("form_id", id).order("position"),
        supabase.from("submissions").select("id, answers, created_at").eq("form_id", id).order("created_at", { ascending: false }).limit(5),
        count("form_events", "view"),
        count("form_events", "start"),
        count("submissions"),
      ]);

      setForm(f as FormRow);
      setQuestions((qs.data ?? []) as QRow[]);
      setRecent((subs.data ?? []) as Sub[]);
      setCounts({
        views: views.count ?? 0,
        starts: starts.count ?? 0,
        responses: responses.count ?? 0,
      });
      setLoading(false);
    }
    load();
  }, [id, router]);

  async function togglePublish() {
    if (!form) return;
    setError("");
    if (!form.is_published && questions.length === 0) {
      return setError("Add at least one question before publishing.");
    }
    const supabase = createClient();
    const { error } = await supabase
      .from("forms")
      .update({ is_published: !form.is_published })
      .eq("id", id);
    if (error) return setError(error.message);
    setForm({ ...form, is_published: !form.is_published });
  }

  if (loading) return <p className="p-10 text-muted">Loading...</p>;
  if (notFound || !form)
    return (
      <main className="p-10">
        <p className="text-muted">Form not found.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-accent hover:underline">
          Back to dashboard
        </Link>
      </main>
    );

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const publicLink = `${origin}/f/${form.slug}`;
  const floatingCode = `<script src="${origin}/widget.js" data-form="${form.slug}" defer></script>`;
  const inlineCode = `<div id="formchat-inline"></div>
<script src="${origin}/widget.js" data-form="${form.slug}" data-mode="inline" data-target="#formchat-inline" data-height="600" defer></script>`;

  const denom = Math.max(counts.starts, counts.responses);
  const completion = denom ? `${Math.round((counts.responses / denom) * 100)}%` : "-";
  const color = form.primary_color || "#8b5cf6";

  const links = [
    { href: `/dashboard/forms/${id}/edit`, icon: Pencil, title: "Edit form", text: "Questions, rules and appearance" },
    { href: `/dashboard/forms/${id}/responses`, icon: MessageSquare, title: "Responses", text: `${counts.responses} received` },
    { href: `/dashboard/forms/${id}/analytics`, icon: BarChart3, title: "Analytics", text: "Charts, rates and export" },
    { href: `/dashboard/forms/${id}/integrations`, icon: Webhook, title: "Integrations", text: "Email alerts and webhooks" },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ThemeToggle />
          <Link href={`/dashboard/forms/${id}/edit`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5 sm:px-4">
            <Pencil size={16} /> Edit
          </Link>
          <button
            onClick={togglePublish}
            className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 font-semibold text-white hover:bg-violet-600 sm:px-4"
          >
            {form.is_published ? <EyeOff size={16} /> : <Eye size={16} />}
            {form.is_published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {/* Title */}
      <div className="mt-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold">{form.title}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              form.is_published
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-fg/10 text-muted"
            }`}
          >
            {form.is_published ? "Published" : "Draft"}
          </span>
        </div>
        {form.description && <p className="mt-2 text-muted">{form.description}</p>}
        <p className="mt-2 text-sm text-muted">
          Created {day(form.created_at)}
          {form.updated_at && ` · Last edited ${day(form.updated_at)}`}
        </p>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {/* Stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Views" value={String(counts.views)} />
        <StatCard label="Conversation starts" value={String(counts.starts)} />
        <StatCard label="Completed" value={String(counts.responses)} />
        <StatCard label="Completion rate" value={completion} />
      </div>

      {/* Quick links */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {links.map(({ href, icon: Icon, title, text }) => (
          <Link key={title} href={href} className="flex items-center gap-4 rounded-2xl border border-line bg-card p-5 transition hover:border-violet-400/60">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-accent">
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{title}</p>
              <p className="truncate text-sm text-muted">{text}</p>
            </div>
          </Link>
        ))}
      </div>

      {/* Share */}
      <section className="mt-8 rounded-2xl border border-line bg-card p-5">
        <h2 className="font-semibold">Share and embed</h2>

        {form.is_published ? (
          <div className="mt-4 space-y-5">
            <div>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted">Public link</p>
                <a href={publicLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-accent hover:underline">
                  <ExternalLink size={14} /> Open
                </a>
              </div>
              <CopyRow label="" text={publicLink} />
            </div>
            <CopyRow label="Floating chat bubble (paste before the closing </body> tag)" text={floatingCode} />
            <CopyRow label="Inline chat (paste where the chat should appear)" text={inlineCode} />
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
            <p className="text-muted">Publish this form to get a public link and embed codes.</p>
            <button onClick={togglePublish} className="rounded-lg border border-line px-3 py-2 hover:bg-fg/5">
              Publish now
            </button>
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Questions */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Questions ({questions.length})</h2>
            <Link href={`/dashboard/forms/${id}/edit`} className="text-sm text-accent hover:underline">Edit</Link>
          </div>

          {questions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No questions yet. Edit the form to add some.</p>
          ) : (
            <ol className="mt-4 space-y-3">
              {questions.map((q, i) => (
                <li key={q.id} className="flex gap-3 text-sm">
                  <span className="text-muted">{i + 1}.</span>
                  <div className="min-w-0">
                    <p className="break-words">{q.label}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                      {TYPE_LABELS[q.type]}
                      {q.required && <span>· Required</span>}
                      {q.condition && (
                        <span className="flex items-center gap-1"><GitBranch size={12} /> Conditional</span>
                      )}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Recent responses */}
        <section className="rounded-2xl border border-line bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Recent responses</h2>
            <Link href={`/dashboard/forms/${id}/responses`} className="text-sm text-accent hover:underline">View all</Link>
          </div>

          {recent.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No responses yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {recent.map((s) => (
                <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="truncate text-sm">{previewText(s)}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {new Date(s.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Chat settings */}
      <section className="mt-6 rounded-2xl border border-line bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Chat settings</h2>
          <Link href={`/dashboard/forms/${id}/edit`} className="text-sm text-accent hover:underline">Change</Link>
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Colour</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border border-line" style={{ backgroundColor: color }} />
              {color}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Bubble position</dt>
            <dd className="mt-1 capitalize">{form.widget_position ?? "right"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Welcome message</dt>
            <dd className="mt-1 break-words">{form.welcome_message || <span className="text-muted">None</span>}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Success message</dt>
            <dd className="mt-1 break-words">{form.completion_message || <span className="text-muted">Default</span>}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}