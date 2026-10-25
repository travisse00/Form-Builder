export type QType =
  | "text" | "email" | "multiple_choice" | "yes_no"
  | "dropdown" | "rating" | "date" | "file_upload";

export type Operator =
  | "equals" | "not_equals" | "contains"
  | "greater_than" | "less_than" | "answered" | "not_answered";

export type Condition = { question_id: string; operator: Operator; value?: string };

export type Settings = {
  max?: number; // rating stars
  min_length?: number;
  max_length?: number;
  format?: "any" | "number" | "phone" | "url";
  date_min?: string;
  date_max?: string;
  error_message?: string;
};

export type Question = {
  id: string;
  type: QType;
  label: string;
  options: string[] | null;
  required: boolean;
  settings?: Settings | null;
  condition?: Condition | null;
};

export const OPERATOR_LABELS: Record<Operator, string> = {
  equals: "equals",
  not_equals: "does not equal",
  contains: "contains",
  greater_than: "is greater than",
  less_than: "is less than",
  answered: "was answered",
  not_answered: "was skipped",
};

export const NEEDS_VALUE: Operator[] = [
  "equals", "not_equals", "contains", "greater_than", "less_than",
];

// Answers by question id. A key exists only if that question was actually asked.
export type AnswerMap = Record<string, string | null>;

export function isVisible(q: Question, answers: AnswerMap): boolean {
  const c = q.condition;
  if (!c) return true;
  if (!(c.question_id in answers)) return false; // its source question was never asked

  const raw = answers[c.question_id];
  const a = raw === null ? null : raw.trim().toLowerCase();
  const v = (c.value ?? "").trim().toLowerCase();

  switch (c.operator) {
    case "answered": return a !== null && a !== "";
    case "not_answered": return a === null || a === "";
    case "equals": return a !== null && a === v;
    case "not_equals": return a === null || a !== v;
    case "contains": return a !== null && a.includes(v);
    case "greater_than":
    case "less_than": {
      if (a === null || a === "" || v === "") return false;
      const x = Number(a), y = Number(v);
      if (Number.isNaN(x) || Number.isNaN(y)) return false;
      return c.operator === "greater_than" ? x > y : x < y;
    }
    default: return true;
  }
}

// Index of the next question (from `from` onwards) whose condition is met, or -1
export function nextVisibleIndex(qs: Question[], from: number, answers: AnswerMap): number {
  for (let i = from; i < qs.length; i++) {
    if (isVisible(qs[i], answers)) return i;
  }
  return -1;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORMATS = {
  number: { re: /^-?\d+(\.\d+)?$/, msg: "Please enter a number." },
  phone: { re: /^\+?[0-9\s()-]{7,20}$/, msg: "Please enter a valid phone number." },
  url: { re: /^https?:\/\/[^\s.]+\.[^\s]{2,}$/i, msg: "Please enter a valid URL starting with http:// or https://" },
};

// Returns an error message, or null if the value is fine
export function validateAnswer(q: Question, value: string): string | null {
  if (!value) return null;
  const s = q.settings ?? {};
  const custom = s.error_message?.trim();
  const fail = (msg: string) => custom || msg;

  if (q.type === "email" && !EMAIL_RE.test(value)) {
    return fail("Please enter a valid email address.");
  }
  if (q.type === "text") {
    if (s.min_length && value.length < s.min_length)
      return fail(`Please enter at least ${s.min_length} characters.`);
    if (s.max_length && value.length > s.max_length)
      return fail(`Please keep it under ${s.max_length} characters.`);
    const f = s.format && s.format !== "any" ? FORMATS[s.format] : null;
    if (f && !f.re.test(value)) return fail(f.msg);
  }
  if (q.type === "date") {
    if (s.date_min && value < s.date_min) return fail(`Please pick a date on or after ${s.date_min}.`);
    if (s.date_max && value > s.date_max) return fail(`Please pick a date on or before ${s.date_max}.`);
  }
  return null;
}