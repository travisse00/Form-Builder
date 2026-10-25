import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isVisible, validateAnswer, type Question } from "@/lib/formLogic";
import { deliverSubmission, type CleanAnswer } from "@/lib/notify";
import { logError } from "@/lib/audit";
import { allow, clientId } from "@/lib/ratelimit";
import { verifyToken } from "@/lib/spam";



const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const fail = (error: string, status = 400) => Response.json({ error }, { status });

// Returns an error message, or null if the answer is fine
function checkValue(q: Question, formId: string, value: string): string | null {
  const s = q.settings ?? {};
  switch (q.type) {
    case "text":
      if (value.length > (s.max_length ?? 500)) return `"${q.label}" is too long.`;
      break;
    case "email":
      if (value.length > 254) return `"${q.label}" is too long.`;
      break;
    case "multiple_choice":
    case "dropdown":
      return (q.options ?? []).includes(value) ? null : `Invalid choice for "${q.label}".`;
    case "yes_no":
      return value === "Yes" || value === "No" ? null : `Invalid answer for "${q.label}".`;
    case "rating": {
      const n = Number(value);
      return Number.isInteger(n) && n >= 1 && n <= (s.max ?? 5)
        ? null
        : `Invalid rating for "${q.label}".`;
    }
    case "date": {
      const d = new Date(value + "T00:00:00Z");
      if (!DATE.test(value) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) {
        return `Invalid date for "${q.label}".`;
      }
      break;
    }
    case "file_upload":
      return value.startsWith(`${formId}/`) && !value.includes("..") && value.length <= 300
        ? null
        : `Invalid file for "${q.label}".`;
  }
  return validateAnswer(q, value); // min/max length, formats, date limits, custom messages
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 100_000) return fail("Request too large.", 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return fail("Invalid request.");
  }
  const { form_id, answers, token } = (body ?? {}) as {
  form_id?: unknown; answers?: unknown; token?: unknown;
};
  if (
    typeof form_id !== "string" || !UUID.test(form_id) ||
    !Array.isArray(answers) || answers.length > 100
  ) {
    return fail("Invalid request.");
  }

  const who = clientId(req);
if (
  !(await allow(`submit:${who}:${form_id}`, 10, 600)) ||
  !(await allow(`submit-all:${who}`, 40, 3600))
) {
  return Response.json(
    { error: "Too many submissions. Please wait a few minutes and try again." },
    { status: 429, headers: { "Retry-After": "600" } }
  );
}

const check = verifyToken(form_id, typeof token === "string" ? token : "");
if (!check.ok) {
  return fail(
    check.reason === "expired"
      ? "This session expired. Please restart the conversation."
      : "Verification failed. Please refresh the page and try again."
  );
}
// real people need time to read and type
if (check.ageSeconds < Math.min(2 + answers.length, 15)) {
  return fail("That was too fast. Please wait a moment and try again.");
}

  const admin = createAdminClient();

  const { data: form } = await admin
    .from("forms")
    .select("id, title, slug, is_published, owner_id, notification_email")
    .eq("id", form_id)
    .maybeSingle();
  if (!form || !form.is_published) return fail("This form isn't accepting responses.", 404);

  const { data: owner } = await admin
    .from("profiles")
    .select("is_suspended")
    .eq("id", form.owner_id)
    .maybeSingle();
  if (owner?.is_suspended) return fail("This form isn't accepting responses.", 403);

  const { data: qs } = await admin
    .from("questions")
    .select("id, type, label, options, required, settings, condition")
    .eq("form_id", form.id)
    .order("position");
  const questions = (qs ?? []) as Question[];
  if (questions.length === 0) return fail("This form isn't accepting responses.", 404);

  // Read what the visitor sent
  const given = new Map<string, string | null>();
  for (const item of answers) {
    const a = item as { question_id?: unknown; answer?: unknown };
    if (typeof a?.question_id !== "string" || given.has(a.question_id)) return fail("Invalid request.");
    if (a.answer !== null && typeof a.answer !== "string") return fail("Invalid request.");
    given.set(a.question_id, a.answer === null ? null : a.answer.trim() || null);
  }
  const known = new Set(questions.map((q) => q.id));
  for (const id of given.keys()) if (!known.has(id)) return fail("Invalid request.");

  // Walk the questions in order, exactly like the chat does
  const asked: Record<string, string | null> = {};
  const clean: CleanAnswer[] = [];
  for (const q of questions) {
    if (!isVisible(q, asked)) {
      if (given.has(q.id)) return fail("Invalid request."); // answered a question that was never shown
      continue;
    }
    if (!given.has(q.id)) return fail(`Please answer "${q.label}".`);

    const value = given.get(q.id) ?? null;
    if (value === null) {
      if (q.required) return fail(`"${q.label}" is required.`);
    } else {
      const problem = checkValue(q, form.id, value);
      if (problem) return fail(problem);
    }
    asked[q.id] = value;
    // labels and types come from OUR database, never from the visitor
    clean.push({ question_id: q.id, label: q.label, type: q.type, answer: value });
  }

  const { data: sub, error } = await admin
    .from("submissions")
    .insert({ form_id: form.id, answers: clean })
    .select("id, created_at")
    .single();
  if (error || !sub) {
  await logError("submit", error?.message ?? "Insert returned no row", { form_id: form.id });
  return fail("Couldn't save your response. Please try again.", 500);
}

  // Reply straight away; emails and webhooks finish in the background
  after(async () => {
    try {
      await deliverSubmission(form, sub, clean);
   } catch (e) {
  console.error("Delivery failed", e);
  await logError("delivery", e instanceof Error ? e.message : "Delivery failed", { form_id: form.id });
}
  });

  return Response.json({ ok: true });
}