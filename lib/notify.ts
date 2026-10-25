import { createHmac } from "node:crypto";
import dns from "node:dns/promises";
import net from "node:net";
import { createAdminClient } from "@/lib/supabase/admin";

export type CleanAnswer = {
  question_id: string;
  label: string;
  type: string;
  answer: string | null;
};
export type FormInfo = {
  id: string;
  title: string;
  slug: string;
  notification_email: string | null;
};
export type Submission = { id: string; created_at: string };
type Hook = { id: string; url: string; secret: string | null };
type Result = { ok: boolean; status?: number; error?: string; retry?: boolean };

/* ---------- Safety: never let a webhook point at our own network ---------- */

function isPrivateV4(ip: string) {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIp(ip: string) {
  const kind = net.isIP(ip);
  if (kind === 4) return isPrivateV4(ip);
  if (kind === 6) {
    const l = ip.toLowerCase();
    if (l === "::" || l === "::1") return true;
    const mapped = l.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    if (l.startsWith("::ffff:")) return true;
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(l);
  }
  return true;
}

async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }
  if (url.protocol !== "https:") throw new Error("Only https:// URLs are allowed");
  if (url.username || url.password) throw new Error("URLs with credentials are not allowed");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (/(^localhost$|\.localhost$|\.local$|\.internal$)/i.test(host)) {
    throw new Error("This address isn't allowed");
  }

  let addresses: { address: string }[];
  if (net.isIP(host)) {
    addresses = [{ address: host }];
  } else {
    try {
      addresses = await dns.lookup(host, { all: true });
    } catch {
      throw new Error("Couldn't resolve the host name");
    }
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new Error("This address isn't allowed");
  }
  return url;
}

/* ---------- Webhooks ---------- */

async function attempt(hook: Hook, event: string, body: string): Promise<Result> {
  let url: URL;
  try {
    url = await assertSafeUrl(hook.url);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Invalid URL" };
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "FormChat-Webhook/1.0",
    "X-FormChat-Event": event,
    "X-FormChat-Timestamp": timestamp,
  };
  if (hook.secret) {
    headers["X-FormChat-Signature"] =
      "sha256=" + createHmac("sha256", hook.secret).update(`${timestamp}.${body}`).digest("hex");
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body,
      redirect: "manual", // never follow redirects, they could point somewhere internal
      signal: AbortSignal.timeout(8000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    if (res.status >= 300 && res.status < 400) {
      return { ok: false, status: res.status, error: "Redirects are not followed" };
    }
    return {
      ok: false,
      status: res.status,
      error: `Server responded with ${res.status}`,
      retry: res.status >= 500 || res.status === 429,
    };
  } catch (e) {
    const timedOut = e instanceof Error && e.name === "TimeoutError";
    return {
      ok: false,
      retry: true,
      error: timedOut ? "Timed out after 8 seconds" : "Couldn't connect to the server",
    };
  }
}

export async function sendWebhook(
  hook: Hook,
  event: string,
  payload: unknown,
  submissionId: string | null
) {
  const body = JSON.stringify(payload);
  let result = await attempt(hook, event, body);
  if (!result.ok && result.retry) {
    await new Promise((r) => setTimeout(r, 2000)); // one retry for temporary failures
    result = await attempt(hook, event, body);
  }

  await createAdminClient()
    .from("webhook_deliveries")
    .insert({
      webhook_id: hook.id,
      submission_id: submissionId,
      status: result.ok ? "success" : "failed",
      status_code: result.status ?? null,
      error: result.ok ? null : (result.error ?? "Failed").slice(0, 300),
    });

  return result;
}

async function buildPayload(
  form: FormInfo,
  submission: Submission,
  answers: CleanAnswer[],
  event = "response.created"
) {
  const admin = createAdminClient();
  // files live in a private bucket, so give receivers a link that works for 7 days
  const withFiles = await Promise.all(
    answers.map(async (a) => {
      if (a.type !== "file_upload" || !a.answer) return a;
      const { data } = await admin.storage
        .from("form-uploads")
        .createSignedUrl(a.answer, 60 * 60 * 24 * 7);
      return { ...a, url: data?.signedUrl ?? null };
    })
  );
  return {
    event,
    created_at: new Date().toISOString(),
    form: { id: form.id, title: form.title, slug: form.slug },
    response: { id: submission.id, submitted_at: submission.created_at, answers: withFiles },
  };
}

export async function sendTestWebhook(hook: Hook, form: FormInfo) {
  const payload = await buildPayload(
    form,
    { id: "test-response", created_at: new Date().toISOString() },
    [
      { question_id: "q1", label: "What's your name?", type: "text", answer: "Ada Lovelace" },
      { question_id: "q2", label: "Would you recommend us?", type: "yes_no", answer: "Yes" },
    ],
    "test"
  );
  return sendWebhook(hook, "test", payload, null);
}

/* ---------- Email (Resend) ---------- */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 150);
const fileName = (p: string) => (p.split("/").pop() ?? p).replace(/^[0-9a-f-]{36}-/, "");

async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    return { ok: false, error: "Email isn't set up on the server (RESEND_API_KEY is missing)" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || "FormChat <onboarding@resend.dev>",
        to: [to],
        subject,
        html,
        text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { ok: true as const };
    const detail = (await res.json().catch(() => null)) as { message?: string } | null;
    return {
      ok: false,
      error: (detail?.message ?? `Email service responded with ${res.status}`).slice(0, 300),
    };
  } catch {
    return { ok: false, error: "Couldn't reach the email service" };
  }
}

async function logEmail(
  form: FormInfo,
  submissionId: string | null,
  to: string,
  result: { ok: boolean; error?: string }
) {
  await createAdminClient()
    .from("email_deliveries")
    .insert({
      form_id: form.id,
      submission_id: submissionId,
      to_email: to,
      status: result.ok ? "success" : "failed",
      error: result.ok ? null : result.error ?? "Failed",
    });
}

export async function sendResponseEmail(
  form: FormInfo,
  submission: Submission,
  answers: CleanAnswer[]
) {
  const to = form.notification_email;
  if (!to) return;

  const rows = answers.map((a) => ({
    label: a.label,
    value:
      a.answer == null ? "Skipped" : a.type === "file_upload" ? `File: ${fileName(a.answer)}` : a.answer,
  }));
  const when = new Date(submission.created_at).toUTCString();

  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181b">
<h2 style="margin:0 0 4px">New response</h2>
<p style="margin:0 0 20px;color:#6b7280">${esc(form.title)}</p>
${rows
  .map(
    (r) =>
      `<p style="margin:0 0 2px;font-size:12px;color:#6b7280;text-transform:uppercase">${esc(r.label)}</p>` +
      `<p style="margin:0 0 16px;font-size:15px">${esc(r.value)}</p>`
  )
  .join("")}
<p style="margin-top:24px;font-size:12px;color:#9ca3af">Submitted ${esc(when)}</p>
</div>`;
  const text = `New response: ${form.title}\n\n${rows.map((r) => `${r.label}\n${r.value}`).join("\n\n")}\n\nSubmitted ${when}`;

  const result = await sendEmail(to, oneLine(`New response: ${form.title}`), html, text);
  await logEmail(form, submission.id, to, result);
}

export async function sendTestEmail(form: FormInfo) {
  const to = form.notification_email;
  if (!to) return { ok: false, error: "Save an email address first" };
  const result = await sendEmail(
    to,
    oneLine(`Test email: ${form.title}`),
    `<p style="font-family:system-ui,sans-serif">This is a test email from FormChat. Email notifications for <strong>${esc(form.title)}</strong> are working.</p>`,
    `This is a test email from FormChat. Email notifications for ${form.title} are working.`
  );
  await logEmail(form, null, to, result);
  return result;
}

/* ---------- Called after every saved response ---------- */

export async function deliverSubmission(
  form: FormInfo,
  submission: Submission,
  answers: CleanAnswer[]
) {
  const admin = createAdminClient();
  const jobs: Promise<unknown>[] = [];

  const { data: hooks } = await admin
    .from("webhooks")
    .select("id, url, secret")
    .eq("form_id", form.id)
    .eq("is_active", true);

  if (hooks && hooks.length > 0) {
    const payload = await buildPayload(form, submission, answers);
    for (const h of hooks) jobs.push(sendWebhook(h, "response.created", payload, submission.id));
  }
  if (form.notification_email) jobs.push(sendResponseEmail(form, submission, answers));

  await Promise.allSettled(jobs);
}