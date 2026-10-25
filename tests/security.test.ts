import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anon, deleteUser, makeUser, run, type TestUser } from "./helpers";

let A: TestUser; // the owner
let B: TestUser; // another logged-in user, who must not see A's data
let privateForm = "";
let publicForm = "";
let questionId = "";
const filePath = () => `${privateForm}/test.txt`;

// Blocked means "nothing came back" (the database may also refuse with an error)
function expectNoRows(res: { data: unknown[] | null }) {
  expect(res.data ?? []).toHaveLength(0);
}

beforeAll(async () => {
  A = await makeUser("a");
  B = await makeUser("b");

  const f1 = await admin
    .from("forms")
    .insert({
      owner_id: A.id,
      title: "A private form",
      slug: `t-${run}-priv`,
      is_published: false,
      notification_email: "owner-a@example.com",
    })
    .select("id")
    .single();
  const f2 = await admin
    .from("forms")
    .insert({ owner_id: A.id, title: "A public form", slug: `t-${run}-pub`, is_published: true })
    .select("id")
    .single();
  if (!f1.data || !f2.data) throw new Error("Couldn't create test forms");
  privateForm = f1.data.id;
  publicForm = f2.data.id;

  const qn = await admin
    .from("questions")
    .insert({ form_id: privateForm, type: "text", label: "Secret question", required: false, position: 0 })
    .select("id")
    .single();
  if (!qn.data) throw new Error("Couldn't create test question");
  questionId = qn.data.id;

  await admin.from("submissions").insert({
    form_id: privateForm,
    answers: [{ question_id: questionId, label: "Secret question", type: "text", answer: "secret answer" }],
  });
  await admin.from("form_events").insert({ form_id: privateForm, event_type: "view" });
  await admin.from("webhooks").insert({
    form_id: privateForm,
    url: "https://example.com/hook",
    secret: "whsec_test",
  });
  await admin.storage.from("form-uploads").upload(filePath(), new Blob(["secret file"]), {
    contentType: "text/plain",
  });
});

afterAll(async () => {
  if (privateForm) await admin.storage.from("form-uploads").remove([filePath()]);
  await deleteUser(A);
  await deleteUser(B);
});

describe("another logged-in user cannot reach my data", () => {
  it("cannot read my forms, even by their exact id", async () => {
    expectNoRows(await B.client.from("forms").select("id").eq("id", privateForm));
  });

  it("cannot read my published form directly either", async () => {
    expectNoRows(await B.client.from("forms").select("id").eq("id", publicForm));
  });

  it("only ever sees their own forms in a full listing", async () => {
    const { data } = await B.client.from("forms").select("id, owner_id");
    for (const row of data ?? []) expect(row.owner_id).toBe(B.id);
  });

  it.each([["questions"], ["submissions"], ["form_events"], ["webhooks"]])(
    "cannot read %s that belong to my form",
    async (table) => {
      expectNoRows(await B.client.from(table).select("*").eq("form_id", privateForm));
    }
  );

  it("cannot change my form", async () => {
    const res = await B.client.from("forms").update({ title: "hacked" }).eq("id", privateForm).select("id");
    expectNoRows(res);
    const { data } = await admin.from("forms").select("title").eq("id", privateForm).single();
    expect(data?.title).toBe("A private form");
  });

  it("cannot delete my form", async () => {
    const res = await B.client.from("forms").delete().eq("id", privateForm).select("id");
    expectNoRows(res);
    const { data } = await admin.from("forms").select("id").eq("id", privateForm);
    expect(data).toHaveLength(1);
  });

  it("cannot add a question to my form", async () => {
    const res = await B.client
      .from("questions")
      .insert({ form_id: privateForm, type: "text", label: "injected", required: false, position: 5 });
    expect(res.error).not.toBeNull();
  });

  it("cannot create a form in my name", async () => {
    const res = await B.client
      .from("forms")
      .insert({ owner_id: A.id, title: "fake", slug: `t-${run}-fake` });
    expect(res.error).not.toBeNull();
  });

  it("cannot read my profile, but can read their own", async () => {
    expectNoRows(await B.client.from("profiles").select("*").eq("id", A.id));
    const own = await B.client.from("profiles").select("id").eq("id", B.id);
    expect(own.data).toHaveLength(1);
  });

  it("cannot make themselves an admin", async () => {
    const res = await B.client.from("profiles").update({ role: "admin" }).eq("id", B.id);
    expect(res.error).not.toBeNull();
    const { data } = await admin.from("profiles").select("role").eq("id", B.id).single();
    expect(data?.role).toBe("user");
  });

  it("cannot download my uploaded files", async () => {
    const res = await B.client.storage.from("form-uploads").download(filePath());
    expect(res.error).not.toBeNull();
  });
});

describe("the owner can reach their own data", () => {
  it("reads their own form, questions and responses", async () => {
    const form = await A.client.from("forms").select("id").eq("id", privateForm);
    const subs = await A.client.from("submissions").select("id").eq("form_id", privateForm);
    expect(form.data).toHaveLength(1);
    expect(subs.data).toHaveLength(1);
  });

  it("downloads their own uploaded file", async () => {
    const res = await A.client.storage.from("form-uploads").download(filePath());
    expect(res.error).toBeNull();
  });

  it("can see their webhook but never read its signing secret back", async () => {
    const list = await A.client.from("webhooks").select("id, url").eq("form_id", privateForm);
    expect(list.data).toHaveLength(1);
    const secret = await A.client.from("webhooks").select("secret").eq("form_id", privateForm);
    expect(secret.error).not.toBeNull();
  });
});

describe("a stranger with only the public key can do nothing directly", () => {
  it.each([["forms"], ["questions"], ["submissions"], ["form_events"], ["webhooks"], ["profiles"]])(
    "cannot read %s",
    async (table) => {
      expectNoRows(await anon.from(table).select("*"));
    }
  );

  it("cannot write a response straight into the database", async () => {
    const res = await anon.from("submissions").insert({ form_id: publicForm, answers: [] });
    expect(res.error).not.toBeNull();
  });

  it("cannot fake analytics events", async () => {
    const res = await anon.from("form_events").insert({ form_id: publicForm, event_type: "view" });
    expect(res.error).not.toBeNull();
  });

  it("cannot upload files directly", async () => {
    const res = await anon.storage.from("form-uploads").upload(`${publicForm}/evil.txt`, new Blob(["x"]));
    expect(res.error).not.toBeNull();
  });

  it("cannot call the rate-limit function", async () => {
    const res = await anon.rpc("check_rate_limit", { p_key: "x", p_max: 1, p_window_seconds: 60 });
    expect(res.error).not.toBeNull();
  });
});