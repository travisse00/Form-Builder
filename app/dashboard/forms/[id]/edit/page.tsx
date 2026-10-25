"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Save,
  Copy,
  Eye,
  EyeOff,
  MessageSquare,
  RotateCcw,
  Star,
  Calendar,
  Paperclip,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";
import ChatForm, { type FormInfo } from "@/components/ChatForm";
import QuestionSettings from "@/components/QuestionSettings";
import WidgetSettings from "@/components/WidgetSettings";
import {
  NEEDS_VALUE,
  OPERATOR_LABELS,
  type Condition,
  type Question,
  type QType,
  type Settings,
} from "@/lib/formLogic";

type Q = {
  id: string;
  type: QType;
  label: string;
  optionsText: string;
  required: boolean;
  settings: Settings;
  condition: Condition | null;
};

type Draft = {
  title: string;
  description: string;
  welcome: string;
  completion: string;
  color: string;
  questions: Q[];
};

type StoredDraft = {
  savedAt: number;
  data: Draft;
};

function makeDraft(
  title: string,
  description: string,
  welcome: string,
  completion: string,
  color: string,
  questions: Q[]
): Draft {
  return { title, description, welcome, completion, color, questions };
}

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

const HAS_OPTIONS: QType[] = ["multiple_choice", "dropdown"];

const field =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";

function parseOptions(text: string) {
  return text
    .split("\n")
    .map((option) => option.trim())
    .filter(Boolean);
}

function MockAnswer({ q, color }: { q: Q; color: string }) {
  const pill = "rounded-full border-2 px-4 py-1.5 text-sm font-medium";
  const ghost =
    "flex items-center gap-2 rounded-full bg-fg/5 px-4 py-2 text-sm text-muted";

  if (q.type === "yes_no" || q.type === "multiple_choice") {
    const options =
      q.type === "yes_no" ? ["Yes", "No"] : parseOptions(q.optionsText);

    return (
      <>
        {options.map((option) => (
          <span
            key={option}
            className={pill}
            style={{ borderColor: color, color }}
          >
            {option}
          </span>
        ))}
      </>
    );
  }

  if (q.type === "dropdown") {
    return (
      <span className={ghost}>
        Choose an option <ChevronDown size={14} />
      </span>
    );
  }

  if (q.type === "rating") {
    return (
      <span className="flex gap-1">
        {Array.from({ length: q.settings.max ?? 5 }, (_, index) => (
          <Star key={index} size={22} color={color} />
        ))}
      </span>
    );
  }

  if (q.type === "date") {
    return (
      <span className={ghost}>
        <Calendar size={14} /> Pick a date
      </span>
    );
  }

  if (q.type === "file_upload") {
    return (
      <span className={ghost}>
        <Paperclip size={14} /> Choose a file
      </span>
    );
  }

  return (
    <span className={ghost}>
      {q.type === "email" ? "name@email.com" : "Type your answer..."}
    </span>
  );
}

export default function FormBuilderPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const draftKey = `form-draft-${id}`;

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
  const [previewRun, setPreviewRun] = useState(0);
  const [previewMode, setPreviewMode] = useState<"overview" | "chat">(
    "overview"
  );
  const [savedSnapshot, setSavedSnapshot] = useState("");
  const [pendingDraft, setPendingDraft] = useState<StoredDraft | null>(null);
  const [widget, setWidget] = useState<{
    avatar: string;
    position: "left" | "right";
  }>({
    avatar: "",
    position: "right",
  });

  const savedIds = useRef<string[]>([]);
  const lastAutosaveTry = useRef("");
  const draft = makeDraft(
    title,
    description,
    welcome,
    completion,
    color,
    questions
  );
  const snapshot = JSON.stringify(draft);
  const dirty = !loading && !notFound && snapshot !== savedSnapshot;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();

      if (cancelled) return;

      if (authError || !auth.user) {
        router.replace("/login");
        return;
      }

      const { data: form, error: formLoadError } = await supabase
        .from("forms")
        .select("*")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (formLoadError || !form) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data: qs, error: questionsLoadError } = await supabase
        .from("questions")
        .select("*")
        .eq("form_id", id)
        .order("position");

      if (cancelled) return;

      if (questionsLoadError) {
        setError(questionsLoadError.message);
        setLoading(false);
        return;
      }

      const loaded: Q[] = (qs ?? []).map((q) => ({
        id: q.id,
        type: q.type as QType,
        label: q.label,
        optionsText: Array.isArray(q.options) ? q.options.join("\n") : "",
        required: q.required ?? false,
        settings: (q.settings ?? {}) as Settings,
        condition: (q.condition ?? null) as Condition | null,
      }));

      const fromDb = makeDraft(
        form.title,
        form.description ?? "",
        form.welcome_message ?? "",
        form.completion_message ?? "",
        form.primary_color ?? "#8b5cf6",
        loaded
      );

      setTitle(fromDb.title);
      setDescription(fromDb.description);
      setWelcome(fromDb.welcome);
      setCompletion(fromDb.completion);
      setColor(fromDb.color);
      setSlug(form.slug);
      setPublished(form.is_published);
      setQuestions(loaded);
      setSavedSnapshot(JSON.stringify(fromDb));
      savedIds.current = loaded.map((question) => question.id);

      try {
        const raw = localStorage.getItem(draftKey);

        if (raw) {
          const parsed = JSON.parse(raw) as Partial<StoredDraft>;

          if (
            parsed.data &&
            JSON.stringify(parsed.data) !== JSON.stringify(fromDb)
          ) {
            setPendingDraft({
              savedAt:
                typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
              data: parsed.data,
            });
          } else {
            localStorage.removeItem(draftKey);
          }
        }
      } catch {
        // Ignore an invalid local backup and continue with the database version.
      }

      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id, router, draftKey]);

  function addQuestion(type: QType) {
    setQuestions((previous) => [
      ...previous,
      {
        id: crypto.randomUUID(),
        type,
        label: "",
        optionsText: HAS_OPTIONS.includes(type) ? "Option 1\nOption 2" : "",
        required: false,
        settings: type === "rating" ? { max: 5 } : {},
        condition: null,
      },
    ]);
  }

  function updateQuestion(qid: string, patch: Partial<Q>) {
    setQuestions((previous) =>
      previous.map((question) =>
        question.id === qid ? { ...question, ...patch } : question
      )
    );
  }

  function removeQuestion(qid: string) {
    setQuestions((previous) =>
      previous
        .filter((question) => question.id !== qid)
        .map((question) =>
          question.condition?.question_id === qid
            ? { ...question, condition: null }
            : question
        )
    );
  }

  function move(index: number, direction: -1 | 1) {
    setQuestions((previous) => {
      const target = index + direction;

      if (target < 0 || target >= previous.length) return previous;

      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function restoreDraft() {
    if (!pendingDraft) return;

    const recovered = pendingDraft.data;
    setTitle(recovered.title);
    setDescription(recovered.description);
    setWelcome(recovered.welcome);
    setCompletion(recovered.completion);
    setColor(recovered.color);
    setQuestions(recovered.questions);
    setPendingDraft(null);
    setMessage("Local draft restored. Save to keep these changes.");
  }

  function discardDraft() {
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore localStorage failures.
    }

    setPendingDraft(null);
  }

  async function save(silent = false): Promise<boolean> {
    const fail = (text: string) => {
      if (!silent) setError(text);
      return false;
    };

    if (!silent) {
      setError("");
      setMessage("");
    }

    if (!title.trim()) return fail("Give your form a title.");

    for (let index = 0; index < questions.length; index++) {
      const question = questions[index];

      if (!question.label.trim()) {
        return fail(`Question ${index + 1} needs some text.`);
      }

      if (
        HAS_OPTIONS.includes(question.type) &&
        parseOptions(question.optionsText).length < 2
      ) {
        return fail(`Question ${index + 1} needs at least 2 options.`);
      }

      const settings = question.settings;

      if (
        settings.min_length != null &&
        settings.max_length != null &&
        settings.min_length > settings.max_length
      ) {
        return fail(
          `Question ${index + 1}: minimum length can't be bigger than the maximum.`
        );
      }

      if (question.condition) {
        const sourceIndex = questions.findIndex(
          (item) => item.id === question.condition!.question_id
        );

        if (
          index === 0 ||
          sourceIndex === -1 ||
          sourceIndex >= index
        ) {
          return fail(
            `Question ${index + 1}: its condition must depend on an earlier question.`
          );
        }

        if (
          NEEDS_VALUE.includes(question.condition.operator) &&
          !question.condition.value?.trim()
        ) {
          return fail(
            `Question ${index + 1}: choose a value for its condition.`
          );
        }
      }
    }

    setSaving(true);

    try {
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
        if (!silent) setError(formError.message);
        return false;
      }

      const removed = savedIds.current.filter(
        (savedId) => !questions.some((question) => question.id === savedId)
      );

      if (removed.length > 0) {
        const { error: deleteError } = await supabase
          .from("questions")
          .delete()
          .in("id", removed)
          .eq("form_id", id);

        if (deleteError) {
          if (!silent) setError(deleteError.message);
          return false;
        }
      }

      if (questions.length > 0) {
        const rows = questions.map((question, index) => ({
          id: question.id,
          form_id: id,
          type: question.type,
          label: question.label.trim(),
          options: HAS_OPTIONS.includes(question.type)
            ? parseOptions(question.optionsText)
            : null,
          required: question.required,
          settings: question.settings,
          condition: question.condition,
          position: index,
        }));

        const { error: questionsError } = await supabase
          .from("questions")
          .upsert(rows);

        if (questionsError) {
          if (!silent) setError(questionsError.message);
          return false;
        }
      }

      savedIds.current = questions.map((question) => question.id);
      setSavedSnapshot(snapshot);
      lastAutosaveTry.current = "";
      setError("");

      if (!silent) setMessage("Saved");

      return true;
    } catch (saveError) {
      if (!silent) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "An unexpected error occurred while saving."
        );
      }

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function togglePublish() {
    if (!published && questions.length === 0) {
      setError("Add at least one question before publishing.");
      return;
    }

    if (!(await save())) return;

    const supabase = createClient();
    const { error: publishError } = await supabase
      .from("forms")
      .update({ is_published: !published })
      .eq("id", id);

    if (publishError) {
      setError(publishError.message);
      return;
    }

    setPublished(!published);
    setMessage(published ? "Unpublished" : "Published");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/f/${slug}`
      );
      setMessage("Link copied");
      setError("");
    } catch {
      setError("Couldn't copy the link. Check your browser clipboard permissions.");
    }
  }

  const siteOrigin =
    typeof window !== "undefined" ? window.location.origin : "";

  const embedCode = `<script src="${siteOrigin}/widget.js" data-form="${slug}" defer></script>`;

  const inlineCode = `<div id="formchat-inline"></div>
<script src="${siteOrigin}/widget.js" data-form="${slug}" data-mode="inline" data-target="#formchat-inline" data-height="600" defer></script>`;

  async function copyEmbed() {
    try {
      await navigator.clipboard.writeText(embedCode);
      setMessage("Embed code copied");
      setError("");
    } catch {
      setError("Couldn't copy the embed code. Check your browser clipboard permissions.");
    }
  }

  async function copyInline() {
    try {
      await navigator.clipboard.writeText(inlineCode);
      setMessage("Inline embed code copied");
      setError("");
    } catch {
      setError("Couldn't copy the inline embed code. Check your browser clipboard permissions.");
    }
  }

  // Back up unsaved work in this browser for draft recovery.
  useEffect(() => {
    if (loading || notFound || pendingDraft) return;

    const timeout = setTimeout(() => {
      try {
        if (snapshot !== savedSnapshot) {
          localStorage.setItem(
            draftKey,
            JSON.stringify({
              savedAt: Date.now(),
              data: draft,
            } satisfies StoredDraft)
          );
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch {
        // Local backup is best-effort; database saving remains separate.
      }
    }, 600);

    return () => clearTimeout(timeout);
    // Draft is represented by snapshot; savedSnapshot identifies the last saved version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, savedSnapshot, loading, notFound, pendingDraft, draftKey]);

  // Autosave unpublished forms. A failed attempt can be retried after the debounce.
  useEffect(() => {
    if (!dirty || published || saving || pendingDraft) return;
    if (lastAutosaveTry.current === snapshot) return;

    const timeout = setTimeout(async () => {
      lastAutosaveTry.current = snapshot;
      const saved = await save(true);

      if (!saved) {
        // Permit a later retry of this same snapshot.
        lastAutosaveTry.current = "";
      }
    }, 2500);

    return () => clearTimeout(timeout);
    // save reads the latest component state when the effect runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, dirty, published, saving, pendingDraft]);

  // Warn before closing the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  if (loading) {
    return <p className="p-10 text-muted">Loading...</p>;
  }

  if (notFound) {
    return (
      <main className="p-10">
        <p className="text-muted">Form not found.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-accent hover:underline"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  const previewQuestions: Question[] = questions.map((question) => ({
    id: question.id,
    type: question.type,
    label: question.label || "Your question appears here",
    options: HAS_OPTIONS.includes(question.type)
      ? parseOptions(question.optionsText)
      : null,
    required: question.required,
    settings: question.settings,
    condition: question.condition,
  }));

  const previewForm: FormInfo = {
    id,
    title: title || "Untitled form",
    welcome_message: welcome,
    completion_message: completion,
    primary_color: color,
    is_published: true,
  };

  const previewKey =
    questions
      .map(
        (question) =>
          question.id + question.type + JSON.stringify(question.condition)
      )
      .join("|") +
    "-" +
    previewRun;

  const status = saving
    ? "Saving..."
    : dirty
      ? published
        ? "Unsaved changes (click Save)"
        : "Unsaved changes"
      : "All changes saved";

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft size={16} /> Dashboard
        </Link>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-xs text-muted" aria-live="polite">
            {status}
          </span>
          <ThemeToggle />
          <Link
            href={`/dashboard/forms/${id}/responses`}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5 sm:px-4"
          >
            <MessageSquare size={16} /> Responses
          </Link>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5 disabled:opacity-50 sm:px-4"
          >
            <Save size={16} /> {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={() => void togglePublish()}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 font-semibold text-white hover:bg-violet-600 disabled:opacity-50 sm:px-4"
          >
            {published ? <EyeOff size={16} /> : <Eye size={16} />}
            {published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </header>

      {pendingDraft && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-400/40 bg-violet-500/10 px-5 py-3 text-sm">
          <span>
            You have unsaved changes from{" "}
            {new Date(pendingDraft.savedAt).toLocaleString()}.
          </span>
          <div className="flex gap-2">
            <button
              onClick={restoreDraft}
              className="rounded-lg bg-violet-500 px-3 py-1.5 font-semibold text-white hover:bg-violet-600"
            >
              Restore
            </button>
            <button
              onClick={discardDraft}
              className="rounded-lg border border-line px-3 py-1.5 hover:bg-fg/5"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      {message && !error && (
        <p className="mt-4 text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      )}

      {published && (
        <>
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-5 py-3 text-sm">
            <span className="truncate text-muted">Public link: /f/{slug}</span>
            <button
              onClick={() => void copyLink()}
              className="flex shrink-0 items-center gap-2 text-accent hover:underline"
            >
              <Copy size={14} /> Copy
            </button>
          </div>

          <div className="mt-3 space-y-5 rounded-2xl border border-line bg-card p-5 text-sm">
            <p className="font-semibold">Embed on your website</p>

            <div>
              <p className="text-muted">
                Floating chat bubble. Paste before the closing body tag.
              </p>
              <pre className="scroll-soft mt-2 overflow-x-auto rounded-lg bg-fg/5 p-3 text-xs">
                {embedCode}
              </pre>
              <button
                onClick={() => void copyEmbed()}
                className="mt-2 flex items-center gap-2 text-accent hover:underline"
              >
                <Copy size={14} /> Copy snippet
              </button>
            </div>

            <div>
              <p className="text-muted">
                Inline chat. Paste where you want the chat to appear on the page.
              </p>
              <pre className="scroll-soft mt-2 overflow-x-auto rounded-lg bg-fg/5 p-3 text-xs">
                {inlineCode}
              </pre>
              <button
                onClick={() => void copyInline()}
                className="mt-2 flex items-center gap-2 text-accent hover:underline"
              >
                <Copy size={14} /> Copy snippet
              </button>
            </div>
          </div>
        </>
      )}

      <div className="mt-6 grid gap-8 lg:grid-cols-2">
        {/* Editor */}
        <div className="space-y-6">
          <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
            <h2 className="font-semibold">Form details</h2>
            <input
              className={field}
              placeholder="Form title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
            <textarea
              className={field}
              rows={2}
              placeholder="Description (optional)"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <input
              className={field}
              placeholder="Welcome message"
              value={welcome}
              onChange={(event) => setWelcome(event.target.value)}
            />
            <textarea
              className={field}
              rows={2}
              placeholder="Success message shown at the end"
              value={completion}
              onChange={(event) => setCompletion(event.target.value)}
            />
            <label className="flex items-center justify-between text-sm text-muted">
              Chat colour
              <input
                type="color"
                value={color}
                onChange={(event) => setColor(event.target.value)}
                className="h-9 w-14 cursor-pointer rounded bg-transparent"
              />
            </label>
            <WidgetSettings formId={id} onChange={setWidget} />
          </section>

          <section className="space-y-4">
            <h2 className="font-semibold">Questions</h2>

            {questions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-line p-8 text-center text-sm text-muted">
                No questions yet. Add one below.
              </div>
            )}

            {questions.map((question, index) => (
              <div
                key={question.id}
                className="rounded-2xl border border-line bg-card p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-accent">
                    {index + 1}. {TYPE_LABELS[question.type]}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move up"
                      className="rounded-lg p-2 text-muted hover:bg-fg/5 disabled:opacity-30"
                    >
                      <ArrowUp size={16} />
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === questions.length - 1}
                      aria-label="Move down"
                      className="rounded-lg p-2 text-muted hover:bg-fg/5 disabled:opacity-30"
                    >
                      <ArrowDown size={16} />
                    </button>
                    <button
                      onClick={() => removeQuestion(question.id)}
                      aria-label="Delete question"
                      className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                <input
                  className={`${field} mt-3`}
                  placeholder="Type your question"
                  value={question.label}
                  onChange={(event) =>
                    updateQuestion(question.id, { label: event.target.value })
                  }
                />

                {HAS_OPTIONS.includes(question.type) && (
                  <textarea
                    className={`${field} mt-3`}
                    rows={4}
                    placeholder="One option per line"
                    value={question.optionsText}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        optionsText: event.target.value,
                      })
                    }
                  />
                )}

                {question.type === "rating" && (
                  <label className="mt-3 flex items-center justify-between text-sm text-muted">
                    Number of stars
                    <select
                      value={question.settings.max ?? 5}
                      onChange={(event) =>
                        updateQuestion(question.id, {
                          settings: {
                            ...question.settings,
                            max: Number(event.target.value),
                          },
                        })
                      }
                      className="rounded-lg bg-fg/5 px-3 py-2 text-fg outline-none"
                    >
                      {[3, 4, 5, 7, 10].map((number) => (
                        <option
                          key={number}
                          value={number}
                          className="bg-card text-fg"
                        >
                          {number}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <label className="mt-3 flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={question.required}
                    onChange={(event) =>
                      updateQuestion(question.id, {
                        required: event.target.checked,
                      })
                    }
                    className="h-4 w-4 accent-violet-500"
                  />
                  Required
                </label>

                <QuestionSettings
                  q={question}
                  earlier={questions.slice(0, index)}
                  onChange={(patch) => updateQuestion(question.id, patch)}
                />
              </div>
            ))}

            <div className="flex flex-wrap gap-2">
              {(Object.keys(TYPE_LABELS) as QType[]).map((type) => (
                <button
                  key={type}
                  onClick={() => addQuestion(type)}
                  className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5"
                >
                  <Plus size={14} /> {TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Preview */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Preview</h2>
            <div className="flex items-center gap-1 rounded-lg bg-fg/5 p-1 text-sm">
              {(["overview", "chat"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setPreviewMode(mode)}
                  className={`rounded-md px-3 py-1 ${
                    previewMode === mode
                      ? "bg-card font-medium shadow-sm"
                      : "text-muted hover:text-fg"
                  }`}
                >
                  {mode === "overview" ? "Overview" : "Try chat"}
                </button>
              ))}
            </div>
          </div>

          {previewMode === "chat" ? (
            <>
              <button
                onClick={() => setPreviewRun((run) => run + 1)}
                className="mb-2 flex items-center gap-2 text-sm text-muted hover:text-fg"
              >
                <RotateCcw size={14} /> Restart
              </button>
              <ChatForm
                key={previewKey}
                preview={{ form: previewForm, questions: previewQuestions }}
              />
            </>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line bg-card">
              <div
                className="px-5 py-4 font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {title || "Untitled form"}
              </div>
              <div className="scroll-soft max-h-[520px] space-y-5 overflow-y-auto p-5">
                {welcome && (
                  <p className="w-fit max-w-[85%] rounded-2xl bg-fg/10 px-4 py-2.5 text-sm">
                    {welcome}
                  </p>
                )}

                {questions.length === 0 && (
                  <p className="text-center text-sm text-muted">
                    Add a question to see it here
                  </p>
                )}

                {questions.map((question) => (
                  <div key={question.id} className="space-y-2">
                    <p className="w-fit max-w-[85%] rounded-2xl bg-fg/10 px-4 py-2.5 text-sm">
                      {question.label || "Your question appears here"}
                      {question.required && " *"}
                    </p>

                    {question.condition && (
                      <p className="text-xs text-muted">
                        Shown if &quot;
                        {questions.find(
                          (item) =>
                            item.id === question.condition!.question_id
                        )?.label || "an earlier question"}
                        &quot; {OPERATOR_LABELS[question.condition.operator]}{" "}
                        {question.condition.value}
                      </p>
                    )}

                    <div className="flex flex-wrap justify-end gap-2">
                      <MockAnswer q={question} color={color} />
                    </div>
                  </div>
                ))}

                {completion && questions.length > 0 && (
                  <p
                    className="w-fit max-w-[85%] rounded-2xl px-4 py-2.5 text-sm text-white"
                    style={{ backgroundColor: color }}
                  >
                    {completion}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
