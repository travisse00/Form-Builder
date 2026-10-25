"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Download, MessageSquare, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import type { QType, Settings } from "@/lib/formLogic";

type QRow = {
  id: string;
  type: QType;
  label: string;
  options: string[] | null;
  settings: Settings | null;
  position: number;
};
type Answer = { question_id: string; label: string; type?: QType; answer: string | null };
type Sub = { id: string; answers: Answer[]; created_at: string };
type Ev = { event_type: "view" | "start"; created_at: string };
type Range = "7" | "30" | "90" | "all" | "custom";

const RANGES: { id: Range; label: string }[] = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

const COLORS = { views: "#94a3b8", starts: "#f59e0b", done: "#10b981" };

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const short = (key: string) =>
  new Date(key + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const stamp = (iso: string) => {
  const d = new Date(iso);
  return `${ymd(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Supabase returns at most 1000 rows per request, so read in pages (max 10,000 rows)
async function fetchAll(
  build: (
    from: number,
    to: number
  ) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<unknown[]> {
  const out: unknown[] = [];
  for (let page = 0; page < 10; page++) {
    const { data, error } = await build(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

function fileName(path: string) {
  return (path.split("/").pop() ?? path).replace(/^[0-9a-f-]{36}-/, "");
}

// Wrap in quotes, double any quotes, and neutralise spreadsheet formulas (CSV injection)
function csvCell(v: string) {
  let s = v;
  const isPlainNumber = /^-?\d+(\.\d+)?$/.test(s);
  if (!isPlainNumber && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function LineChart({
  labels,
  series,
}: {
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
}) {
  const W = 640, H = 240, L = 36, R = 12, T = 12, B = 28;
  const n = labels.length;
  const max = Math.max(0, ...series.flatMap((s) => s.values));
  const top = max <= 4 ? 4 : Math.ceil(max / 4) * 4;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i / (n - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const ticks = [0, 1, 2, 3, 4].map((t) => (top / 4) * t);
  const labelIdx = n <= 1 ? [0] : n === 2 ? [0, 1] : [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Views, conversation starts and completed responses per day"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="stroke-line" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" className="fill-muted" fontSize="11">
              {t}
            </text>
          </g>
        ))}
        {labelIdx.map((i) => (
          <text
            key={i}
            x={x(i)}
            y={H - 8}
            textAnchor={n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle"}
            className="fill-muted"
            fontSize="11"
          >
            {labels[i]}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.name}>
            <polyline
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
            />
            {n <= 45 &&
              s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color}>
                  <title>{`${s.name}: ${v} (${labels[i]})`}</title>
                </circle>
              ))}
          </g>
        ))}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 text-sm text-muted">
        {series.map((s) => (
          <span key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const router = useRouter();
  const id = useParams().id as string;

  const [form, setForm] = useState<{ title: string; slug: string } | null>(null);
  const [questions, setQuestions] = useState<QRow[]>([]);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [events, setEvents] = useState<Ev[]>([]);
  const [loadingForm, setLoadingForm] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [range, setRange] = useState<Range>("30");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const bounds = useMemo(() => {
    if (range === "all") return { from: "", to: "" };
    if (range === "custom") return { from: customFrom, to: customTo };
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - (Number(range) - 1));
    return { from: ymd(start), to: ymd(end) };
  }, [range, customFrom, customTo]);

  const invalidRange = !!bounds.from && !!bounds.to && bounds.from > bounds.to;
  const formReady = !!form;

  // 1) Load the form and its questions once (also checks you own it)
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
        .select("title, slug")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();

      if (!f) {
        setNotFound(true);
        setLoadingForm(false);
        return;
      }

      const { data: qs } = await supabase
        .from("questions")
        .select("id, type, label, options, settings, position")
        .eq("form_id", id)
        .order("position");

      setForm(f);
      setQuestions((qs ?? []) as QRow[]);
      setLoadingForm(false);
    }
    load();
  }, [id, router]);

  // 2) Load submissions and events whenever the date range changes
  useEffect(() => {
    if (!formReady || invalidRange) return;
    let cancelled = false;

    async function load() {
      setLoadingData(true);
      setError("");
      const supabase = createClient();
      const fromISO = bounds.from ? new Date(bounds.from + "T00:00:00").toISOString() : null;
      const toISO = bounds.to ? new Date(bounds.to + "T23:59:59.999").toISOString() : null;

      try {
        const [s, e] = await Promise.all([
          fetchAll((a, b) => {
            let q = supabase.from("submissions").select("id, answers, created_at").eq("form_id", id);
            if (fromISO) q = q.gte("created_at", fromISO);
            if (toISO) q = q.lte("created_at", toISO);
            return q.order("created_at", { ascending: true }).order("id").range(a, b);
          }),
          fetchAll((a, b) => {
            let q = supabase.from("form_events").select("id, event_type, created_at").eq("form_id", id);
            if (fromISO) q = q.gte("created_at", fromISO);
            if (toISO) q = q.lte("created_at", toISO);
            return q.order("created_at", { ascending: true }).order("id").range(a, b);
          }),
        ]);
        if (cancelled) return;
        setSubs(s as Sub[]);
        setEvents(e as Ev[]);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load analytics.");
      }
      if (!cancelled) setLoadingData(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id, formReady, invalidRange, bounds.from, bounds.to]);

  const stats = useMemo(() => {
    const views = events.filter((e) => e.event_type === "view").length;
    const starts = events.filter((e) => e.event_type === "start").length;
    const completed = subs.length;
    const denom = Math.max(starts, completed);
    const completion = denom ? Math.round((completed / denom) * 100) : null;
    const abandonment = completion === null ? null : 100 - completion;
    const abandoned = Math.max(starts - completed, 0);

    // Daily series (most recent 90 days of the chosen range)
    const end = bounds.to ? new Date(bounds.to + "T00:00:00") : new Date();
    let start: Date;
    if (bounds.from) {
      start = new Date(bounds.from + "T00:00:00");
    } else {
      const times = [...events, ...subs].map((r) => new Date(r.created_at).getTime());
      start = times.length ? new Date(Math.min(...times)) : new Date(end);
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    const earliest = new Date(end);
    earliest.setDate(earliest.getDate() - 89);
    const truncated = start < earliest;
    if (truncated) start = earliest;

    const keys: string[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      keys.push(ymd(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    const index = new Map(keys.map((k, i) => [k, i]));
    const v = keys.map(() => 0);
    const st = keys.map(() => 0);
    const dn = keys.map(() => 0);
    for (const e of events) {
      const i = index.get(ymd(new Date(e.created_at)));
      if (i === undefined) continue;
      if (e.event_type === "view") v[i]++;
      else st[i]++;
    }
    for (const s of subs) {
      const i = index.get(ymd(new Date(s.created_at)));
      if (i !== undefined) dn[i]++;
    }

    // Question-level stats
    type Q = {
      id: string;
      label: string;
      type: QType;
      max: number;
      asked: number;
      answered: number;
      skipped: number;
      sum: number;
      dist: Map<string, number> | null;
    };
    const byId = new Map<string, Q>();
    const list: Q[] = [];
    for (const q of [...questions].sort((a, b) => a.position - b.position)) {
      const max = q.settings?.max ?? 5;
      const opts =
        q.type === "yes_no"
          ? ["Yes", "No"]
          : q.type === "multiple_choice" || q.type === "dropdown"
          ? q.options ?? []
          : q.type === "rating"
          ? Array.from({ length: max }, (_, i) => String(i + 1))
          : null;
      const row: Q = {
        id: q.id,
        label: q.label,
        type: q.type,
        max,
        asked: 0,
        answered: 0,
        skipped: 0,
        sum: 0,
        dist: opts ? new Map(opts.map((o) => [o, 0])) : null,
      };
      byId.set(q.id, row);
      list.push(row);
    }
    for (const s of subs) {
      for (const a of s.answers ?? []) {
        let row = byId.get(a.question_id);
        if (!row) {
          // a question that has since been deleted: keep its saved label
          row = {
            id: a.question_id,
            label: a.label,
            type: a.type ?? "text",
            max: 5,
            asked: 0,
            answered: 0,
            skipped: 0,
            sum: 0,
            dist: null,
          };
          byId.set(a.question_id, row);
          list.push(row);
        }
        row.asked++;
        if (a.answer === null || a.answer === "") {
          row.skipped++;
        } else {
          row.answered++;
          if (row.dist) row.dist.set(a.answer, (row.dist.get(a.answer) ?? 0) + 1);
          if (row.type === "rating") row.sum += Number(a.answer) || 0;
        }
      }
    }

    return {
      views, starts, completed, completion, abandonment, abandoned,
      labels: keys.map(short),
      series: [
        { name: "Views", color: COLORS.views, values: v },
        { name: "Conversation starts", color: COLORS.starts, values: st },
        { name: "Completed", color: COLORS.done, values: dn },
      ],
      truncated,
      questions: list,
    };
  }, [events, subs, questions, bounds.from, bounds.to]);

  function exportCsv() {
    if (!form) return;
    const cols = stats.questions;
    const header = ["Submitted at", ...cols.map((c) => c.label)].map(csvCell).join(",");
    const rows = subs.map((s) => {
      const byQ = new Map((s.answers ?? []).map((a) => [a.question_id, a]));
      const cells = cols.map((c) => {
        const a = byQ.get(c.id);
        if (!a || a.answer === null || a.answer === "") return "";
        return c.type === "file_upload" ? fileName(a.answer) : a.answer;
      });
      return [stamp(s.created_at), ...cells].map(csvCell).join(",");
    });
    const csv = "\uFEFF" + [header, ...rows].join("\r\n"); // BOM so Excel reads UTF-8
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${form.slug}-responses-${ymd(new Date())}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  if (loadingForm) return <p className="p-10 text-muted">Loading...</p>;
  if (notFound || !form)
    return (
      <main className="p-10">
        <p className="text-muted">Form not found.</p>
        <Link href={`/dashboard/forms/${id}`} className="flex items-center gap-2 text-sm text-muted hover:text-fg">
  <ArrowLeft size={16} /> Back
</Link>
      </main>
    );

  const pct = (n: number | null) => (n === null ? "-" : `${n}%`);
  const hasChartData = stats.series.some((s) => s.values.some((x) => x > 0));
  const dateInput =
    "rounded-lg bg-fg/5 px-3 py-2 text-sm outline-none focus:bg-fg/10 dark:[color-scheme:dark]";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
          <ArrowLeft size={16} /> Dashboard
        </Link>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <ThemeToggle />
          <Link href={`/dashboard/forms/${id}/responses`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5">
            <MessageSquare size={14} /> Responses
          </Link>
          <Link href={`/dashboard/forms/${id}`} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5">
            <Pencil size={14} /> Edit form
          </Link>
          <button
            onClick={exportCsv}
            disabled={subs.length === 0}
            className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
          >
            <Download size={14} /> Export CSV
          </button>
        </div>
      </header>

      <h1 className="mt-8 text-2xl font-bold">{form.title}</h1>
      <p className="mt-1 text-sm text-muted">Analytics</p>

      {/* Date filter */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg bg-fg/5 p-1 text-sm">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`rounded-md px-3 py-1.5 ${
                range === r.id ? "bg-card font-medium shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <input type="date" className={dateInput} value={customFrom} max={customTo || undefined} onChange={(e) => setCustomFrom(e.target.value)} aria-label="From date" />
            to
            <input type="date" className={dateInput} value={customTo} min={customFrom || undefined} onChange={(e) => setCustomTo(e.target.value)} aria-label="To date" />
          </div>
        )}
      </div>

      {invalidRange && <p className="mt-4 text-sm text-red-500">The start date must be before the end date.</p>}
      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className={`transition-opacity ${loadingData ? "opacity-50" : ""}`} aria-busy={loadingData}>
        {/* Stat cards */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Views" value={String(stats.views)} />
          <StatCard label="Conversation starts" value={String(stats.starts)} />
          <StatCard label="Completed" value={String(stats.completed)} />
          <StatCard label="Completion rate" value={pct(stats.completion)} />
          <StatCard
            label="Abandonment rate"
            value={pct(stats.abandonment)}
            hint={stats.starts > 0 ? `${stats.abandoned} left unfinished` : undefined}
          />
        </div>
        {stats.completed > stats.starts && (
          <p className="mt-2 text-xs text-muted">
            Some responses were collected before tracking started, so rates use the larger of starts and completed.
          </p>
        )}

        {/* Chart */}
        <section className="mt-8 rounded-2xl border border-line bg-card p-5">
          <h2 className="font-semibold">Activity over time</h2>
          {hasChartData ? (
            <div className="mt-4">
              <LineChart labels={stats.labels} series={stats.series} />
              {stats.truncated && (
                <p className="mt-2 text-xs text-muted">Showing the most recent 90 days of this range.</p>
              )}
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted">No activity in this date range yet.</p>
          )}
        </section>

        {/* Question stats */}
        <section className="mt-8">
          <h2 className="font-semibold">Question breakdown</h2>

          {stats.questions.length === 0 && (
            <div className="mt-4 rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
              No responses in this date range yet.
            </div>
          )}

          <div className="mt-4 space-y-4">
            {stats.questions.map((q, i) => {
              const bars = q.dist ? [...q.dist.entries()] : null;
              const avg = q.type === "rating" && q.answered ? q.sum / q.answered : null;
              return (
                <article key={q.id} className="rounded-2xl border border-line bg-card p-5">
                  <p className="font-medium">
                    <span className="text-muted">{i + 1}.</span> {q.label}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {q.answered} answered · {q.skipped} skipped
                    {q.asked > 0 && ` · ${Math.round((q.answered / q.asked) * 100)}% response rate`}
                    {avg !== null && ` · average ${avg.toFixed(1)} / ${q.max}`}
                  </p>

                  {bars && bars.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {bars.map(([label, count]) => {
                        const share = q.answered ? Math.round((count / q.answered) * 100) : 0;
                        return (
                          <div key={label}>
                            <div className="flex justify-between text-sm">
                              <span className="truncate pr-3">{q.type === "rating" ? `${label} ★` : label}</span>
                              <span className="shrink-0 text-muted">{count} · {share}%</span>
                            </div>
                            <div className="mt-1 h-2 overflow-hidden rounded-full bg-fg/10">
                              <div className="h-full rounded-full bg-violet-500" style={{ width: `${share}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}