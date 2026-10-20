"use client";

import { useEffect, useRef, useState } from "react";
import { Send, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Question = {
  id: string;
  type: "text" | "email" | "multiple_choice" | "yes_no";
  label: string;
  options: string[] | null;
  required: boolean;
};
type FormInfo = {
  id: string;
  title: string;
  welcome_message: string | null;
  completion_message: string | null;
  primary_color: string | null;
  is_published: boolean;
};
type Msg = { from: "bot" | "user"; text: string };
type Answer = { question_id: string; label: string; answer: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ChatForm({ slug, embedded = false }: { slug: string; embedded?: boolean }) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [form, setForm] = useState<FormInfo | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: f } = await supabase
        .from("forms")
        .select("id, title, welcome_message, completion_message, primary_color, is_published")
        .eq("slug", slug)
        .maybeSingle();

      if (!f || !f.is_published) return setStatus("unavailable");

      const { data: qs } = await supabase
        .from("questions")
        .select("id, type, label, options, required")
        .eq("form_id", f.id)
        .order("position");

      if (!qs || qs.length === 0) return setStatus("unavailable");

      setForm(f);
      setQuestions(qs as Question[]);

      const first: Msg[] = [];
      if (f.welcome_message) first.push({ from: "bot", text: f.welcome_message });
      first.push({ from: "bot", text: qs[0].label });
      setMessages(first);
      setStatus("ready");
    }
    load();
  }, [slug]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, failed, done]);

  async function send(finalAnswers: Answer[]) {
    setSubmitting(true);
    setFailed(false);
    const supabase = createClient();
    const { error } = await supabase
      .from("submissions")
      .insert({ form_id: form!.id, answers: finalAnswers });
    setSubmitting(false);

    if (error) return setFailed(true);

    setDone(true);
    setMessages((prev) => [
      ...prev,
      { from: "bot", text: form!.completion_message || "Thanks for your response!" },
    ]);
  }

  function submitAnswer(value: string | null) {
    const q = questions[index];
    const clean = value?.trim() ?? "";

    if (!clean) {
      if (q.required) return setError("This question is required.");
    } else if (q.type === "email" && !EMAIL_RE.test(clean)) {
      return setError("Please enter a valid email address.");
    }

    setError("");
    setInput("");
    const answer = clean || null;
    const nextAnswers = [...answers, { question_id: q.id, label: q.label, answer }];
    setAnswers(nextAnswers);
    setMessages((prev) => [...prev, { from: "user", text: answer ?? "Skipped" }]);

    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setMessages((prev) => [...prev, { from: "bot", text: questions[index + 1].label }]);
    } else {
      send(nextAnswers);
    }
  }

  if (status === "loading") {
    return <p className="p-10 text-center text-muted">Loading...</p>;
  }
  if (status === "unavailable") {
    return <p className="p-10 text-center text-muted">This form isn't available.</p>;
  }

  const color = form?.primary_color || "#8b5cf6";
  const q = questions[index];
  const choices = q.type === "yes_no" ? ["Yes", "No"] : q.options ?? [];

  return (
    <div className={embedded ? "h-dvh" : "flex min-h-dvh items-center justify-center p-4"}>
      <div
        className={`flex flex-col overflow-hidden bg-card ${
          embedded
            ? "h-full"
            : "h-[min(640px,calc(100dvh-2rem))] w-full max-w-md rounded-2xl border border-line"
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 font-semibold text-white" style={{ backgroundColor: color }}>
          {form?.title}
        </div>

        {/* Messages */}
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {messages.map((m, i) => (
            <p
              key={i}
              className={`w-fit max-w-[85%] break-words rounded-2xl px-4 py-2.5 text-sm ${
                m.from === "user" ? "ml-auto text-white" : "bg-fg/10 text-fg"
              }`}
              style={m.from === "user" ? { backgroundColor: color } : undefined}
            >
              {m.text}
            </p>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-line p-3">
          {error && <p className="mb-2 px-1 text-sm text-red-500">{error}</p>}

          {done ? (
            <p className="py-2 text-center text-sm text-muted">Response submitted</p>
          ) : failed ? (
            <div className="flex items-center justify-between gap-3 px-1">
              <p className="text-sm text-red-500">Couldn't send your answers.</p>
              <button
                onClick={() => send(answers)}
                className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5"
              >
                <RotateCcw size={14} /> Retry
              </button>
            </div>
          ) : submitting ? (
            <p className="py-2 text-center text-sm text-muted">Sending...</p>
          ) : choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((o) => (
                <button
                  key={o}
                  onClick={() => submitAnswer(o)}
                  className="rounded-full border-2 px-4 py-1.5 text-sm font-medium transition hover:text-white"
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
          ) : (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                submitAnswer(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type={q.type === "email" ? "email" : "text"}
                value={input}
                maxLength={500}
                onChange={(e) => setInput(e.target.value)}
                placeholder={q.type === "email" ? "name@email.com" : "Type your answer..."}
                className="min-w-0 flex-1 rounded-full bg-fg/5 px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:bg-fg/10"
              />
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