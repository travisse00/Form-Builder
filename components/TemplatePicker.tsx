"use client";

import { useEffect } from "react";
import { X, FilePlus, Mail, Star, CalendarDays, Briefcase, type LucideIcon } from "lucide-react";
import { TEMPLATES, type Template } from "@/lib/templates";

const ICONS: Record<string, LucideIcon> = {
  blank: FilePlus,
  contact: Mail,
  feedback: Star,
  event: CalendarDays,
  job: Briefcase,
};

type Props = {
  busy: boolean;
  onSelect: (t: Template) => void;
  onClose: () => void;
};

export default function TemplatePicker({ busy, onSelect, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose a template"
        onClick={(e) => e.stopPropagation()}
        className="scroll-soft max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-bg p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Start with a template</h2>
            <p className="mt-1 text-sm text-muted">Pick one, then edit everything in the builder.</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="rounded-lg p-2 text-muted hover:bg-fg/5">
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {TEMPLATES.map((t) => {
            const Icon = ICONS[t.id] ?? FilePlus;
            return (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                disabled={busy}
                className="rounded-2xl border border-line bg-card p-5 text-left transition hover:border-violet-400/60 disabled:opacity-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15 text-accent">
                  <Icon size={20} />
                </div>
                <h3 className="mt-3 font-semibold">{t.name}</h3>
                <p className="mt-1 text-sm text-muted">{t.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {t.questions.length} {t.questions.length === 1 ? "question" : "questions"}
                </p>
              </button>
            );
          })}
        </div>

        {busy && <p className="mt-4 text-center text-sm text-muted">Creating your form...</p>}
      </div>
    </div>
  );
}