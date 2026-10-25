import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, deleteUser, makeUser, run, type TestUser } from "./helpers";

const BASE = process.env.TEST_BASE_URL;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe.skipIf(!BASE)("the public API", () => {
  let owner: TestUser;
  let formId = "";
  let draftId = "";
  let nameQ = "";
  let emailQ = "";
  let token = "";
  const slug = `t-${run}-api`;
  const draftSlug = `t-${run}-draft`;

  beforeAll(async () => {
    // fail with a clear message if the dev server isn't running
    try {
      await fetch(`${BASE}/api/session`, { method: "OPTIONS" });
    } catch {
      throw new Error("Can't reach the app. Start it with `npm run dev` in another terminal first.");
    }

    // fresh rate-limit counters, so repeated test runs don't block each other
    await admin.from("rate_limits").delete().neq("key", "");

    owner = await makeUser("owner");

    const pub = await admin
      .from("forms")
      .insert({
        owner_id: owner.id,
        title: "API test form",
        slug,
        is_published: true,
        notification_email: "owner-secret@example.com",
      })
      .select("id")
      .single();
    const draft = await admin
      .from("forms")
      .insert({ owner_id: owner.id, title: "Draft form", slug: draftSlug, is_published: false })
      .select("id")
      .single();
    if (!pub.data || !draft.data) throw new Error("Couldn't create test forms");
    formId = pub.data.id;
    draftId = draft.data.id;

    const qs = await admin
      .from("questions")
      .insert([
        { form_id: formId, type: "text", label: "Your name", required: true, position: 0 },
        { form_id: formId, type: "email", label: "Your email", required: false, position: 1 },
      ])
      .select("id, position")
      .order("position");
    nameQ = qs.data![0].id;
    emailQ = qs.data![1].id;

    const res = await post("/api/session", { form_id: formId, log_view: false });
    token = (await res.json()).token;
    await sleep(6000); // the "too fast" rule makes real submissions wait a few seconds
  });

  afterAll(async () => {
    await deleteUser(owner);
  });

  const answers = (name: string | null, email: string | null) => [
    { question_id: nameQ, answer: name, label: "HACKED LABEL" },
    { question_id: emailQ, answer: email },
  ];

  it("hands out a session ticket for a published form", async () => {
    const res = await post("/api/session", { form_id: formId, log_view: false });
    expect(res.status).toBe(200);
    expect(typeof (await res.json()).token).toBe("string");
  });

  it("refuses a session ticket for an unpublished form", async () => {
    const res = await post("/api/session", { form_id: draftId, log_view: false });
    expect(res.status).toBe(404);
  });

  it("rejects a submission without a ticket", async () => {
    const res = await post("/api/submit", { form_id: formId, answers: answers("Ada", null) });
    expect(res.status).toBe(400);
  });

  it("rejects a forged ticket", async () => {
    const res = await post("/api/submit", {
      form_id: formId,
      token: "1234567890123.forged",
      answers: answers("Ada", null),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a submission that arrives too fast", async () => {
    const fresh = (await (await post("/api/session", { form_id: formId, log_view: false })).json()).token;
    const res = await post("/api/submit", { form_id: formId, token: fresh, answers: answers("Ada", null) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/too fast/i);
  });

  it("rejects a missing required answer", async () => {
    const res = await post("/api/submit", { form_id: formId, token, answers: answers(null, null) });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid email", async () => {
    const res = await post("/api/submit", { form_id: formId, token, answers: answers("Ada", "nope") });
    expect(res.status).toBe(400);
  });

  it("rejects answers to questions that don't exist", async () => {
    const extra = [...answers("Ada", null), { question_id: crypto.randomUUID(), answer: "x" }];
    const res = await post("/api/submit", { form_id: formId, token, answers: extra });
    expect(res.status).toBe(400);
  });

  it("saves a valid response using labels from the database, not the visitor", async () => {
    const res = await post("/api/submit", {
      form_id: formId,
      token,
      answers: answers("Ada", "ada@mail.com"),
    });
    expect(res.status).toBe(200);

    const { data } = await admin.from("submissions").select("answers").eq("form_id", formId);
    expect(data).toHaveLength(1); // none of the rejected attempts were saved
    const saved = data![0].answers as { label: string; answer: string }[];
    expect(saved[0].label).toBe("Your name");
    expect(saved[0].answer).toBe("Ada");
  });

  it("serves a public form without leaking the owner's details", async () => {
    const res = await fetch(`${BASE}/api/public-form/${slug}`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("owner-secret@example.com");
    expect(text).not.toContain(owner.id);
  });

  it("does not serve an unpublished form", async () => {
    const res = await fetch(`${BASE}/api/public-form/${draftSlug}`);
    expect(res.status).toBe(404);
  });

  it("keeps admin routes closed to visitors who aren't logged in", async () => {
    expect((await fetch(`${BASE}/api/admin/overview`)).status).toBe(401);
    expect((await fetch(`${BASE}/api/admin/users`)).status).toBe(401);
    expect((await post(`/api/admin/users/${crypto.randomUUID()}`, { action: "suspend" })).status).toBe(401);
  });

  it("requires login for the integrations test route", async () => {
    const res = await post("/api/integrations/test", { type: "email", form_id: formId });
    expect(res.status).toBe(401);
  });

  it("blocks floods with rate limiting", async () => {
    const target = crypto.randomUUID();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      const res = await post("/api/submit", { form_id: target, answers: [], token: "x" });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
  });
});