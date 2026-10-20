"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, Eye, EyeOff, LogOut, MessageSquare } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

type Form = {
  id: string;
  title: string;
  slug: string;
  is_published: boolean;
  created_at: string;
  submissions: { count: number }[];
};

function randomSlug() {
  return Math.random().toString(36).slice(2, 10);
}

export default function DashboardPage() {
  const router = useRouter();
  const [forms, setForms] = useState<Form[]>([]);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.replace("/login");
        return;
      }
      setEmail(auth.user.email ?? "");

      const { data, error } = await supabase
  .from("forms")
  .select("id, title, slug, is_published, created_at, submissions(count)")
  .eq("owner_id", auth.user.id)
  .order("created_at", { ascending: false });

      if (error) setError(error.message);
      else setForms((data as Form[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  async function createForm() {
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;

    const { data, error } = await supabase
  .from("forms")
  .select("id, title, slug, is_published, created_at, submissions(count)")
  .eq("owner_id", auth.user.id)
  .order("created_at", { ascending: false });

    if (error) setError(error.message);
    else router.push(`/dashboard/forms/${data.id}`);
  }

  async function togglePublish(form: Form) {
    const supabase = createClient();
    const { error } = await supabase
      .from("forms")
      .update({ is_published: !form.is_published })
      .eq("id", form.id);

    if (error) return setError(error.message);
    setForms((prev) =>
      prev.map((f) => (f.id === form.id ? { ...f, is_published: !f.is_published } : f))
    );
  }

  async function removeForm(id: string) {
    if (!confirm("Delete this form and all its responses?")) return;
    const supabase = createClient();
    const { error } = await supabase.from("forms").delete().eq("id", id);
    if (error) return setError(error.message);
    setForms((prev) => prev.filter((f) => f.id !== id));
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const totalResponses = forms.reduce((sum, f) => sum + (f.submissions[0]?.count ?? 0), 0);
  const publishedCount = forms.filter((f) => f.is_published).length;

  const stats = [
    { label: "Total forms", value: forms.length },
    { label: "Published", value: publishedCount },
    { label: "Total responses", value: totalResponses },
  ];

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">
          Form<span className="text-accent">Chat</span>
        </span>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:block">{email}</span>
          <ThemeToggle />
          <button onClick={logout} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5">
            <LogOut size={16} /> Log out
          </button>
        </div>
      </header>

      <div className="mt-10 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your forms</h1>
        <button onClick={createForm} className="flex items-center gap-2 rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-600">
          <Plus size={16} /> New form
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-card p-5">
            <p className="text-sm text-muted">{s.label}</p>
            <p className="mt-1 text-3xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        {loading && <p className="text-muted">Loading...</p>}

        {!loading && forms.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line p-10 text-center text-muted">
            No forms yet. Click 'New form' to create your first one.
          </div>
        )}

        {forms.map((f) => (
  <div
    key={f.id}
    className="flex flex-col gap-4 rounded-2xl border border-line bg-card p-5 lg:flex-row lg:items-center lg:justify-between"
  >
    <div className="min-w-0">
      <div className="flex items-center gap-3">
        <h2 className="truncate font-semibold">{f.title}</h2>
        <span
          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
            f.is_published
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-fg/10 text-muted"
          }`}
        >
          {f.is_published ? "Published" : "Draft"}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted">
        {f.submissions[0]?.count ?? 0} responses · Created{" "}
        {new Date(f.created_at).toLocaleDateString()}
      </p>
    </div>

    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link
        href={`/dashboard/forms/${f.id}/responses`}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5"
      >
        <MessageSquare size={14} /> Responses
      </Link>
      <Link
        href={`/dashboard/forms/${f.id}`}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5"
      >
        <Pencil size={14} /> Edit
      </Link>
      <button
        onClick={() => togglePublish(f)}
        className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5"
      >
        {f.is_published ? <EyeOff size={14} /> : <Eye size={14} />}
        {f.is_published ? "Unpublish" : "Publish"}
      </button>
      <button
        onClick={() => removeForm(f.id)}
        className="rounded-lg border border-line px-3 py-2 text-red-500 hover:bg-red-500/10"
        aria-label="Delete form"
      >
        <Trash2 size={14} />
      </button>
    </div>
  </div>
))}
      </div>
    </main>
  );
}