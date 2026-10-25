"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw, Star, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  isVisible,
  nextVisibleIndex,
  validateAnswer,
  type Question,
  type QType,
} from "@/lib/formLogic";

export type { QType, Question, Condition, Settings } from "@/lib/formLogic";

export type FormInfo = {
  id: string;
  title: string;
  welcome_message: string | null;
  completion_message: string | null;
  primary_color: string | null;
  is_published: boolean;
  avatar_url?: string | null;
};

type Msg =
  | { from: "bot"; kind: "welcome" }
  | { from: "bot"; kind: "question"; qid: string }
  | { from: "bot"; kind: "done" }
  | { from: "user"; text: string };

type Answer = { question_id: string; label: string; type: QType; answer: string | null };

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const toMap = (list: Answer[]) =>
  Object.fromEntries(list.map((a) => [a.question_id, a.answer])) as Record<string, string | null>;

function firstMessages(list: Question[]): Msg[] {
  const first: Msg[] = [{ from: "bot", kind: "welcome" }];
  if (list.length > 0) first.push({ from: "bot", kind: "question", qid: list[0].id });
  return first;
}

// Asks the server for a signed session ticket (and logs a "view" if asked)
async function fetchToken(formId: string, logView: boolean): Promise<string> {
  try {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ form_id: formId, log_view: logView }),
    });
    if (res.ok) return ((await res.json()) as { token?: string }).token ?? "";
    console.warn("FormChat: /api/session failed with status", res.status);
  } catch (e) {
    console.warn("FormChat: couldn't reach /api/session", e);
  }
  return "";
}

// Analytics: a visitor answered their first question
function logStart(formId: string, token: string) {
  fetch("/api/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ form_id: formId, token }),
  }).catch(() => {});
}

function Avatar({
  src,
  name,
  color,
  size,
  onBrand = false,
}: {
  src?: string | null;
  name: string;
  color: string;
  size: number;
  onBrand?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const dims = { width: size, height: size };

  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        onError={() => setBroken(true)}
        className="shrink-0 rounded-full object-cover"
        style={dims}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
        onBrand ? "bg-white/25" : ""
      }`}
      style={{ ...dims, backgroundColor: onBrand ? undefined : color }}
    >
      {(name || "?").charAt(0).toUpperCase()}
    </span>
  );
}

type Props = {
  slug?: string;
  embedded?: boolean;
  preview?: { form: FormInfo; questions: Question[] };
};

export default function ChatForm({ slug, embedded = false, preview }: Props) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    preview ? "ready" : "loading"
  );
  const [form, setForm] = useState<FormInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [input, setInput] = useState("");
  const [hover, setHover] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [failMsg, setFailMsg] = useState("");
  const [done, setDone] = useState(false);
  const [typing, setTyping] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startLogged = useRef(false);
  const tokenRef = useRef("");

  // In preview mode the form and questions come from props, so edits show up live.
  const f = preview ? preview.form : form;
  const qs = preview ? preview.questions : questions;

  useEffect(() => {
    if (preview) {
      setMessages(firstMessages(preview.questions));
      return;
    }

    async function load() {
      let info: FormInfo | null = null;
      let list: Question[] = [];
      try {
        const res = await fetch(`/api/public-form/${encodeURIComponent(slug ?? "")}`);
        if (res.ok) {
          const data = await res.json();
          info = data.form;
          list = data.questions;
        }
      } catch {}

      if (!info || list.length === 0) return setStatus("unavailable");

      // count one "view" per browser tab session, and get the signed session ticket
      let logView = true;
      try {
        const key = `fc-view-${info.id}`;
        if (sessionStorage.getItem(key)) logView = false;
        else sessionStorage.setItem(key, "1");
      } catch {}
      tokenRef.current = await fetchToken(info.id, logView);

      setForm(info);
      setQuestions(list);
      setMessages(firstMessages(list));
      setStatus("ready");
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, typing, failed, done]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  if (status === "loading") {
    return <p className="p-10 text-center text-muted">Loading...</p>;
  }
  if (status === "unavailable" || !f) {
    return <p className="p-10 text-center text-muted">This form isn't available.</p>;
  }
  if (qs.length === 0) {
    return (
      <div className="flex h-[520px] items-center justify-center rounded-2xl border border-dashed border-line text-sm text-muted">
        Add a question to see the preview
      </div>
    );
  }

  const q = qs[index];
  if (!q) return null;

  const color = f.primary_color || "#8b5cf6";
  const layout = preview ? "inline" : embedded ? "embedded" : "page";
  const outerClass =
    layout === "embedded"
      ? "h-dvh"
      : layout === "inline"
      ? "h-[520px]"
      : "flex min-h-dvh items-center justify-center p-4";
  const cardClass =
    layout === "embedded"
      ? "h-full"
      : layout === "inline"
      ? "h-full rounded-2xl border border-line"
      : "h-[min(640px,calc(100dvh-2rem))] w-full max-w-md rounded-2xl border border-line";

  const choices =
    q.type === "yes_no" ? ["Yes", "No"] : q.type === "multiple_choice" ? q.options ?? [] : [];
  const ratingMax = q.settings?.max ?? 5;
  const textMax = q.settings?.max_length ?? 500;

  // Progress: answered so far, out of answered + the questions still due to be asked
  const answeredCount = answers.length;
  const currentMap = toMap(answers);
  const remaining = qs
    .slice(index)
    .filter((x, i) => i === 0 || !x.condition || isVisible(x, currentMap)).length;
  const total = answeredCount + remaining;
  const progress = done ? 100 : Math.round((answeredCount / total) * 100);

  const restart = () => {
    if (timer.current) clearTimeout(timer.current);
    startLogged.current = false;
    // a new conversation gets a fresh session ticket
    if (!preview) {
      fetchToken(f.id, false).then((t) => {
        tokenRef.current = t;
      });
    }
    setTyping(false);
    setMessages(firstMessages(qs));
    setIndex(0);
    setAnswers([]);
    setInput("");
    setHover(0);
    setError("");
    setSubmitting(false);
    setUploading(false);
    setFailed(false);
    setFailMsg("");
    setDone(false);
  };

  const complete = () => {
    setDone(true);
    setMessages((prev) => [...prev, { from: "bot", kind: "done" }]);
  };

  const send = async (finalAnswers: Answer[]) => {
    if (preview) return complete(); // preview never saves anything

    // Try once more to get a ticket if the first request failed
    if (!tokenRef.current) tokenRef.current = await fetchToken(f.id, false);
    if (!tokenRef.current) {
      setFailMsg("Couldn't verify your session. Please refresh the page and try again.");
      setFailed(true);
      return;
    }

    setSubmitting(true);
    setFailed(false);
    setFailMsg("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: f.id,
          token: tokenRef.current,
          answers: finalAnswers.map((a) => ({ question_id: a.question_id, answer: a.answer })),
        }),
      });
      if (res.ok) {
        complete();
      } else {
        const data = await res.json().catch(() => null);
        setFailMsg(data?.error ?? `Something went wrong (${res.status}).`);
        setFailed(true);
      }
    } catch {
      setFailMsg("Couldn't reach the server. Check your connection.");
      setFailed(true);
    }
    setSubmitting(false);
  };

  const submitAnswer = (value: string | null, display?: string) => {
    const clean = value?.trim() ?? "";

    if (!clean) {
      if (q.required) return setError("This question is required.");
    } else {
      const problem = validateAnswer(q, clean);
      if (problem) return setError(problem);
    }

    // The first valid answer of a conversation counts as a "start"
    if (!startLogged.current && !preview && tokenRef.current) {
      startLogged.current = true;
      logStart(f.id, tokenRef.current);
    }

    setError("");
    setInput("");
    setHover(0);
    const answer = clean || null;
    const nextAnswers = [
      ...answers,
      { question_id: q.id, label: q.label, type: q.type, answer },
    ];
    setAnswers(nextAnswers);
    setMessages((prev) => [
      ...prev,
      { from: "user", text: answer ? display ?? answer : "Skipped" },
    ]);

    // Jump to the next question whose condition is met (skipping hidden ones)
    const next = nextVisibleIndex(qs, index + 1, toMap(nextAnswers));
    if (next !== -1) {
      const nextId = qs[next].id;
      setIndex(next);
      setTyping(true);
      timer.current = setTimeout(() => {
        setMessages((prev) => [...prev, { from: "bot", kind: "question", qid: nextId }]);
        setTyping(false);
      }, 450);
    } else {
      send(nextAnswers);
    }
  };

  const handleFile = async (file: File) => {
    setError("");
    if (file.size > MAX_FILE_BYTES) return setError("File is too large (max 5 MB).");
    if (preview) return submitAnswer(file.name);

    setUploading(true);
    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          form_id: f.id,
          token: tokenRef.current,
          name: file.name,
          size: file.size,
        }),
      });
      const slip = await res.json().catch(() => null);
      if (!res.ok || !slip?.path || !slip?.token) {
        setUploading(false);
        return setError(slip?.error ?? "Upload failed. Please try again.");
      }

      const { error } = await createClient()
        .storage.from("form-uploads")
        .uploadToSignedUrl(slip.path, slip.token, file, { contentType: file.type || undefined });
      setUploading(false);
      if (error) return setError("Upload failed. Please try again.");
      submitAnswer(slip.path, file.name);
    } catch {
      setUploading(false);
      setError("Upload failed. Please try again.");
    }
  };

  const pillInput =
    "min-w-0 flex-1 rounded-full bg-fg/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:bg-fg/10";

  return (
    <div className={outerClass}>
      <div className={`flex flex-col overflow-hidden bg-card ${cardClass}`}>
        {/* Header */}
        <div
          className={`px-4 py-3 text-white ${embedded ? "max-[480px]:pr-14" : ""}`}
          style={{ backgroundColor: color }}
        >
          <div className="flex items-center gap-3">
            <Avatar key={f.avatar_url ?? ""} src={f.avatar_url} name={f.title} color={color} size={36} onBrand />
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold leading-tight">{f.title}</p>
              <p className="text-xs text-white/80">
                {done ? "Completed" : `Question ${Math.min(answeredCount + 1, total)} of ${total}`}
              </p>
            </div>
            <button
              onClick={restart}
              disabled={submitting || uploading}
              aria-label="Restart conversation"
              title="Restart"
              className="rounded-full p-2 hover:bg-white/15 disabled:opacity-50"
            >
              <RotateCcw size={16} />
            </button>
          </div>
          <div
            className="mt-3 h-1 overflow-hidden rounded-full bg-white/25"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-white transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Messages */}
        <div
          ref={listRef}
          role="log"
          aria-live="polite"
          className="scroll-soft flex-1 space-y-3 overflow-y-auto p-5"
        >
          {messages.map((m, i) => {
            const text =
              m.from === "user"
                ? m.text
                : m.kind === "welcome"
                ? f.welcome_message
                : m.kind === "done"
                ? f.completion_message || "Thanks for your response!"
                : qs.find((x) => x.id === m.qid)?.label;

            if (!text) return null;

            if (m.from === "user") {
              return (
                <p
                  key={i}
                  className="msg-in ml-auto w-fit max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm text-white"
                  style={{ backgroundColor: color }}
                >
                  {text}
                </p>
              );
            }

            return (
              <div key={i} className="msg-in flex items-end gap-2">
                <Avatar key={f.avatar_url ?? ""} src={f.avatar_url} name={f.title} color={color} size={28} />
                <p className="w-fit max-w-[80%] break-words rounded-2xl bg-fg/10 px-4 py-2.5 text-sm text-fg">
                  {text}
                </p>
              </div>
            );
          })}

          {typing && (
            <div className="msg-in flex items-end gap-2" aria-label="Typing">
              <Avatar key={f.avatar_url ?? ""} src={f.avatar_url} name={f.title} color={color} size={28} />
              <div className="flex gap-1 rounded-2xl bg-fg/10 px-4 py-3">
                {[0, 1, 2].map((n) => (
                  <span
                    key={n}
                    className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
                    style={{ animationDelay: `${n * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-line p-3">
          {error && <p className="mb-2 px-1 text-sm text-red-500">{error}</p>}

          {done ? (
            <div className="flex items-center justify-center gap-3 py-2 text-sm text-muted">
              <span>{preview ? "Preview finished. Nothing was saved." : "Response submitted"}</span>
              <button onClick={restart} className="text-accent hover:underline">
                Start over
              </button>
            </div>
          ) : failed ? (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm text-red-500">{failMsg || "Couldn't send your answers."}</p>
              <button
                onClick={() => send(answers)}
                className="flex shrink-0 items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5"
              >
                <RotateCcw size={14} /> Retry
              </button>
            </div>
          ) : submitting ? (
            <p className="py-2 text-center text-sm text-muted">Sending...</p>
          ) : typing ? (
            <div className="h-11" aria-hidden />
          ) : choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((o) => (
                <button
                  key={o}
                  onClick={() => submitAnswer(o)}
                  className="rounded-full border-2 px-4 py-1.5 text-sm font-medium transition"
                  style={{ borderColor: color, color }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = color;
                    e.currentTarget.style.color = "#fff";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                    e.currentTarget.style.color = color;
                  }}
                >
                  {o}
                </button>
              ))}
              {!q.required && (
                <button onClick={() => submitAnswer(null)} className="px-3 py-1.5 text-sm text-muted hover:text-fg">
                  Skip
                </button>
              )}
            </div>
          ) : q.type === "rating" ? (
            <div className="flex flex-wrap items-center gap-1">
              {Array.from({ length: ratingMax }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  onClick={() => submitAnswer(String(n), `${n} / ${ratingMax}`)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  aria-label={`${n} out of ${ratingMax}`}
                  className="p-1"
                >
                  <Star size={26} color={color} fill={n <= hover ? color : "none"} />
                </button>
              ))}
              {!q.required && (
                <button onClick={() => submitAnswer(null)} className="ml-2 text-sm text-muted hover:text-fg">
                  Skip
                </button>
              )}
            </div>
          ) : q.type === "file_upload" ? (
            <div className="flex flex-wrap items-center gap-3">
              <label
                className="flex cursor-pointer items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-medium"
                style={{ borderColor: color, color }}
              >
                <Paperclip size={16} /> {uploading ? "Uploading..." : "Choose a file"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleFile(file);
                    e.target.value = "";
                  }}
                />
              </label>
              <span className="text-xs text-muted">Max 5 MB</span>
              {!q.required && !uploading && (
                <button onClick={() => submitAnswer(null)} className="text-sm text-muted hover:text-fg">
                  Skip
                </button>
              )}
            </div>
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (q.type === "date" && input) {
                  const nice = new Date(input + "T00:00:00").toLocaleDateString(undefined, {
                    dateStyle: "medium",
                  });
                  submitAnswer(input, nice);
                } else {
                  submitAnswer(input);
                }
              }}
              className="flex items-center gap-2"
            >
              {q.type === "dropdown" ? (
                <select value={input} onChange={(e) => setInput(e.target.value)} className={pillInput}>
                  <option value="" className="bg-card text-fg">Choose an option</option>
                  {(q.options ?? []).map((o) => (
                    <option key={o} value={o} className="bg-card text-fg">{o}</option>
                  ))}
                </select>
              ) : q.type === "date" ? (
                <input
                  type="date"
                  value={input}
                  min={q.settings?.date_min || undefined}
                  max={q.settings?.date_max || undefined}
                  onChange={(e) => setInput(e.target.value)}
                  className={`${pillInput} dark:[color-scheme:dark]`}
                />
              ) : (
                <input
                  type={q.type === "email" ? "email" : "text"}
                  inputMode={
                    q.settings?.format === "number"
                      ? "decimal"
                      : q.settings?.format === "phone"
                      ? "tel"
                      : undefined
                  }
                  value={input}
                  maxLength={textMax}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={q.type === "email" ? "name@email.com" : "Type your answer..."}
                  className={pillInput}
                />
              )}
              {!q.required && !input && (
                <button type="button" onClick={() => submitAnswer(null)} className="px-2 text-sm text-muted hover:text-fg">
                  Skip
                </button>
              )}
              <button
                type="submit"
                aria-label="Send"
                className="rounded-full p-2.5 text-white"
                style={{ backgroundColor: color }}
              >
                <Send size={16} />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}