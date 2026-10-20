"use client";

import { useEffect, useRef, useState } from "react";
// import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowUp, ArrowDown, Plus, Trash2, Save, Copy, Eye, EyeOff, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

type QType = "text" | "email" | "multiple_choice" | "yes_no";
type Q = { id: string; type: QType; label: string; optionsText: string; required: boolean };

const TYPE_LABELS: Record<QType, string> = {
  text: "Short text",
  email: "Email",
  multiple_choice: "Multiple choice",
  yes_no: "Yes / No",
};

const field =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";

function parseOptions(text: string) {
  return text.split("\n").map((o) => o.trim()).filter(Boolean);
}

export default function FormBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [welcome, setWelcome] = useState("");
  const [completion, setCompletion] = useState("");
  const [color, setColor] = useState("#8b5cf6");
  const [slug, setSlug] = useState("");
  const [published, setPublished] = useState(false);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const savedIds = useRef<string[]>([]);

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
        .select("*")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();

      if (!form) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTitle(form.title);
      setDescription(form.description ?? "");
      setWelcome(form.welcome_message ?? "");
      setCompletion(form.completion_message ?? "");
      setColor(form.primary_color ?? "#8b5cf6");
      setSlug(form.slug);
      setPublished(form.is_published);

      const { data: qs } = await supabase
        .from("questions")
        .select("*")
        .eq("form_id", id)
        .order("position");

      const loaded: Q[] = (qs ?? []).map((q) => ({
        id: q.id,
        type: q.type,
        label: q.label,
        optionsText: Array.isArray(q.options) ? q.options.join("\n") : "",
        required: q.required ?? false,
      }));
      setQuestions(loaded);
      savedIds.current = loaded.map((q) => q.id);
      setLoading(false);
    }
    load();
  }, [id, router]);

  function addQuestion(type: QType) {
    setQuestions((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type,
        label: "",
        optionsText: type === "multiple_choice" ? "Option 1\nOption 2" : "",
        required: false,
      },
    ]);
  }

  function updateQuestion(qid: string, patch: Partial<Q>) {
    setQuestions((prev) => prev.map((q) => (q.id === qid ? { ...q, ...patch } : q)));
  }

  function removeQuestion(qid: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== qid));
  }

  function move(index: number, dir: -1 | 1) {
    setQuestions((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function save(): Promise<boolean> {
    setError("");
    setMessage("");

    if (!title.trim()) {
      setError("Give your form a title.");
      return false;
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.label.trim()) {
        setError(`Question ${i + 1} needs some text.`);
        return false;
      }
      if (q.type === "multiple_choice" && parseOptions(q.optionsText).length < 2) {
        setError(`Question ${i + 1} needs at least 2 options.`);
        return false;
      }
    }

    setSaving(true);
    const supabase = createClient();

    const { error: formError } = await supabase
      .from("forms")
      .update({
        title: title.trim(),
        description: description.trim() || null,
        welcome_message: welcome,
        completion_message: completion,
        primary_color: color,
      })
      .eq("id", id);

    if (formError) {
      setError(formError.message);
      setSaving(false);
      return false;
    }

    const removed = savedIds.current.filter((sid) => !questions.some((q) => q.id === sid));
    if (removed.length > 0) {
      const { error: delError } = await supabase.from("questions").delete().in("id", removed);
      if (delError) {
        setError(delError.message);
        setSaving(false);
        return false;
      }
    }

    if (questions.length > 0) {
      const rows = questions.map((q, i) => ({
        id: q.id,
        form_id: id,
        type: q.type,
        label: q.label.trim(),
        options: q.type === "multiple_choice" ? parseOptions(q.optionsText) : null,
        required: q.required,
        position: i,
      }));
      const { error: qError } = await supabase.from("questions").upsert(rows);
      if (qError) {
        setError(qError.message);
        setSaving(false);
        return false;
      }
    }

    savedIds.current = questions.map((q) => q.id);
    setSaving(false);
    setMessage("Saved");
    return true;
  }

  async function togglePublish() {
    if (!published && questions.length === 0) {
      setError("Add at least one question before publishing.");
      return;
    }
    if (!(await save())) return;

    const supabase = createClient();
    const { error } = await supabase
      .from("forms")
      .update({ is_published: !published })
      .eq("id", id);

    if (error) return setError(error.message);
    setPublished(!published);
    setMessage(published ? "Unpublished" : "Published");
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`);
    setMessage("Link copied");
  }

  const embedCode = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/widget.js" data-form="${slug}" defer></script>`;

async function copyEmbed() {
  await navigator.clipboard.writeText(embedCode);
  setMessage("Embed code copied");
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
    <main className="mx-auto max-w-6xl px-6 py-8">
      {/* Top bar */}
      <header className="flex flex-wrap items-center justify-between gap-3">
  <Link href="/dashboard" className="flex items-center gap-2 text-sm text-muted hover:text-fg">
    <ArrowLeft size={16} /> Dashboard
  </Link>

  <div className="flex flex-wrap items-center gap-2 text-sm">
    <ThemeToggle />
    <Link
      href={`/dashboard/forms/${id}/responses`}
      className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5 sm:px-4"
    >
      <MessageSquare size={16} /> Responses
    </Link>
    <button
      onClick={save}
      disabled={saving}
      className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5 disabled:opacity-50 sm:px-4"
    >
      <Save size={16} /> {saving ? "Saving..." : "Save"}
    </button>
    <button
      onClick={togglePublish}
      className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 font-semibold text-white hover:bg-violet-600 sm:px-4"
    >
      {published ? <EyeOff size={16} /> : <Eye size={16} />}
      {published ? "Unpublish" : "Publish"}
    </button>
  </div>
</header>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      {message && !error && <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">{message}</p>}

      {published && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-sm">
          <span className="truncate text-muted">Public link: /f/{slug}</span>
          <button onClick={copyLink} className="flex shrink-0 items-center gap-2 text-accent hover:underline">
            <Copy size={14} /> Copy
          </button>
        </div>
      )}

      {published && (
  <div className="mt-3 rounded-2xl border border-line bg-card p-5 text-sm">
    <p className="font-semibold">Embed on your website</p>
    <p className="mt-1 text-muted">Paste this just before the closing &lt;/body&gt; tag.</p>
    <pre className="mt-3 overflow-x-auto rounded-lg bg-fg/5 p-3 text-xs">{embedCode}</pre>
    <button onClick={copyEmbed} className="mt-3 flex items-center gap-2 text-accent hover:underline">
      <Copy size={14} /> Copy snippet
    </button>
  </div>
)}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
            <h2 className="font-semibold">Form details</h2>
            <input className={field} placeholder="Form title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea className={field} rows={2} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
            <input className={field} placeholder="Welcome message" value={welcome} onChange={(e) => setWelcome(e.target.value)} />
            <input className={field} placeholder="Completion message" value={completion} onChange={(e) => setCompletion(e.target.value)} />
            <label className="flex items-center justify-between text-sm text-muted">
              Chat colour
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-14 cursor-pointer rounded bg-transparent" />
            </label>
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Questions</h2>

            {questions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                No questions yet. Add one below.
              </div>
            )}

            {questions.map((q, i) => (
              <div key={q.id} className="rounded-2xl border border-line bg-card p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {i + 1}. {TYPE_LABELS[q.type]}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded-lg p-2 text-muted hover:bg-fg/5 disabled:opacity-30">
                      <ArrowUp size={16} />
                    </button>
                    <button onClick={() => move(i, 1)} disabled={i === questions.length - 1} aria-label="Move down" className="rounded-lg p-2 text-muted hover:bg-fg/5 disabled:opacity-30">
                      <ArrowDown size={16} />
                    </button>
                    <button onClick={() => removeQuestion(q.id)} aria-label="Delete question" className="rounded-lg p-2 text-red-500 hover:bg-red-500/10">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <input
                  className={`${field} mt-3`}
                  placeholder="Type your question"
                  value={q.label}
                  onChange={(e) => updateQuestion(q.id, { label: e.target.value })}
                />

                {q.type === "multiple_choice" && (
                  <textarea
                    className={`${field} mt-3`}
                    rows={4}
                    placeholder="One option per line"
                    value={q.optionsText}
                    onChange={(e) => updateQuestion(q.id, { optionsText: e.target.value })}
                  />
                )}

                <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(q.id, { required: e.target.checked })}
                    className="h-4 w-4 accent-violet-500"
                  />
                  Required
                </label>
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as QType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => addQuestion(t)}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5"
                >
                  <Plus size={14} /> {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <h2 className="mb-3 font-semibold">Preview</h2>
          <div className="overflow-hidden rounded-2xl border border-line bg-card">
            <div className="px-5 py-4 font-semibold text-white" style={{ backgroundColor: color }}>
              {title || "Untitled form"}
            </div>

            <div className="max-h-[560px] space-y-4 overflow-y-auto p-5">
              {welcome && <p className="w-fit max-w-[85%] rounded-2xl bg-fg/10 px-4 py-2.5 text-sm">{welcome}</p>}

              {questions.map((q) => (
                <div key={q.id} className="space-y-2">
                  <p className="w-fit max-w-[85%] rounded-2xl bg-fg/10 px-4 py-2.5 text-sm">
                    {q.label || "Your question appears here"}
                    {q.required && " *"}
                  </p>

                  {(q.type === "text" || q.type === "email") && (
                    <div className="ml-auto w-fit rounded-full bg-fg/5 px-4 py-2 text-sm text-muted">
                      {q.type === "email" ? "name@email.com" : "Type your answer..."}
                    </div>
                  )}

                  {(q.type === "yes_no" || q.type === "multiple_choice") && (
                    <div className="flex flex-wrap justify-end gap-2">
                      {(q.type === "yes_no" ? ["Yes", "No"] : parseOptions(q.optionsText)).map((o) => (
                        <span key={o} className="rounded-full border-2 px-4 py-1.5 text-sm font-medium" style={{ borderColor: color, color }}>
                          {o}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {completion && questions.length > 0 && (
                <p className="w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm text-white" style={{ backgroundColor: color }}>
                  {completion}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}