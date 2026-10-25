import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) {
  throw new Error("Missing Supabase keys. Check your .env.local file.");
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

export const admin = createClient(SUPABASE_URL, SERVICE_KEY, opts); // master key
export const anon = createClient(SUPABASE_URL, ANON_KEY, opts); // a stranger

export const run = Date.now().toString(36); // makes every test run's data unique
export const password = `Test-${run}-Aa1!`;

export async function makeUser(tag: string) {
  const email = `fc-test-${tag}-${run}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: `Test ${tag}` },
  });
  if (error || !data.user) throw new Error(`Couldn't create test user: ${error?.message}`);

  const client = createClient(SUPABASE_URL, ANON_KEY, opts);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`Couldn't sign in test user: ${signInError.message}`);

  return { id: data.user.id, email, client };
}

export type TestUser = Awaited<ReturnType<typeof makeUser>>;

// Deleting the user also deletes their profile, forms, questions and responses
export async function deleteUser(user?: TestUser) {
  if (user) await admin.auth.admin.deleteUser(user.id);
}