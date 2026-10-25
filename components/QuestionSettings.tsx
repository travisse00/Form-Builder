"use client";

import {
  NEEDS_VALUE,
  OPERATOR_LABELS,
  type Condition,
  type Operator,
  type QType,
  type Settings,
} from "@/lib/formLogic";

type Item = { id: string; type: QType; label: string; optionsText: string };

type Props = {
  q: Item & { settings: Settings; condition: Condition | null };
  earlier: Item[];
  onChange: (patch: { settings?: Settings; condition?: Condition | null }) => void;
};

const field =
  "w-full rounded-lg bg-fg/5 px-3 py-2 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";
const select = "rounded-lg bg-fg/5 px-3 py-2 text-sm text-fg outline-none";

function optionsFor(src: Item): string[] | null {
  if (src.type === "yes_no") return ["Yes", "No"];
  if (src.type === "multiple_choice" || src.type === "dropdown") {
    return src.optionsText.split("\n").map((o) => o.trim()).filter(Boolean);
  }
  return null;
}

const num = (v: string) => (v === "" ? undefined : Number(v));

export default function QuestionSettings({ q, earlier, onChange }: Props) {
  const s = q.settings;
  const setS = (patch: Partial<Settings>) => onChange({ settings: { ...s, ...patch } });
  const c = q.condition;

  const sources = earlier.filter((e) => e.type !== "file_upload");
  const src = c ? sources.find((e) => e.id === c.question_id) : undefined;
  const srcOptions = src ? optionsFor(src) : null;
  const operators = (Object.keys(OPERATOR_LABELS) as Operator[]).filter(
    (o) => src?.type === "rating" || (o !== "greater_than" && o !== "less_than")
  );
  const showValidation = q.type === "text" || q.type === "email" || q.type === "date";

  function toggleCondition(on: boolean) {
    if (!on) return onChange({ condition: null });
    const last = sources[sources.length - 1];
    if (!last) return;
    onChange({
      condition: {
        question_id: last.id,
        operator: last.type === "rating" ? "less_than" : "equals",
        value: "",
      },
    });
  }

  return (
    <div className="mt-4 space-y-4 border-t border-line pt-4">
      {/* Validation */}
      {showValidation && (
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Validation</p>

          {q.type === "text" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <input className={field} type="number" min={0} placeholder="Min length"
                  value={s.min_length ?? ""} onChange={(e) => setS({ min_length: num(e.target.value) })} />
                <input className={field} type="number" min={1} placeholder="Max length"
                  value={s.max_length ?? ""} onChange={(e) => setS({ max_length: num(e.target.value) })} />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-muted">
                Format
                <select className={select} value={s.format ?? "any"}
                  onChange={(e) => setS({ format: e.target.value as Settings["format"] })}>
                  <option value="any" className="bg-card text-fg">Any text</option>
                  <option value="number" className="bg-card text-fg">Number</option>
                  <option value="phone" className="bg-card text-fg">Phone number</option>
                  <option value="url" className="bg-card text-fg">Website URL</option>
                </select>
              </label>
            </>
          )}

          {q.type === "date" && (
            <div className="grid grid-cols-2 gap-2 text-xs text-muted">
              <label>
                Earliest date
                <input className={`${field} mt-1 dark:[color-scheme:dark]`} type="date"
                  value={s.date_min ?? ""} onChange={(e) => setS({ date_min: e.target.value || undefined })} />
              </label>
              <label>
                Latest date
                <input className={`${field} mt-1 dark:[color-scheme:dark]`} type="date"
                  value={s.date_max ?? ""} onChange={(e) => setS({ date_max: e.target.value || undefined })} />
              </label>
            </div>
          )}

          <input className={field} placeholder="Custom error message (optional)"
            value={s.error_message ?? ""} onChange={(e) => setS({ error_message: e.target.value || undefined })} />
        </div>
      )}

      {/* Conditional logic (never on the first question) */}
      {earlier.length > 0 && (
        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!c} disabled={sources.length === 0}
              onChange={(e) => toggleCondition(e.target.checked)}
              className="h-4 w-4 accent-violet-500" />
            Only show this question if...
          </label>

          {c && !src && (
            <p className="text-xs text-red-500">
              The question this depends on was deleted or moved below this one. Pick another.
            </p>
          )}

          {c && (
            <div className="space-y-2">
              <select className={`${select} w-full`} value={c.question_id}
                onChange={(e) =>
                  onChange({ condition: { question_id: e.target.value, operator: "equals", value: "" } })
                }>
                {!src && <option value={c.question_id} className="bg-card text-fg">Choose a question</option>}
                {sources.map((e, i) => (
                  <option key={e.id} value={e.id} className="bg-card text-fg">
                    {i + 1}. {e.label || "Untitled question"}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                <select className={select} value={c.operator}
                  onChange={(e) => onChange({ condition: { ...c, operator: e.target.value as Operator } })}>
                  {operators.map((o) => (
                    <option key={o} value={o} className="bg-card text-fg">{OPERATOR_LABELS[o]}</option>
                  ))}
                </select>

                {NEEDS_VALUE.includes(c.operator) &&
                  (srcOptions ? (
                    <select className={`${select} min-w-0 flex-1`} value={c.value ?? ""}
                      onChange={(e) => onChange({ condition: { ...c, value: e.target.value } })}>
                      <option value="" className="bg-card text-fg">Choose a value</option>
                      {srcOptions.map((o) => (
                        <option key={o} value={o} className="bg-card text-fg">{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input className={`${field} min-w-0 flex-1`}
                      placeholder={src?.type === "rating" ? "e.g. 3" : "Value"}
                      value={c.value ?? ""}
                      onChange={(e) => onChange({ condition: { ...c, value: e.target.value } })} />
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}