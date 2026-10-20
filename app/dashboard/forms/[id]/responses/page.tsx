
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

type Answer = {
  question_id: string;
  label: string;
  answer: string | null;
};

type Submission = {
  id: string;
  answers: Answer[];
  created_at: string;
};

export default function ResponsesPage() {
  return (
    <Suspense
      fallback={<p className="p-10 text-muted text-center justify-center flex">Loading responses...</p>}
    >
      <ResponsesContent />
    </Suspense>
  );
}

function ResponsesContent() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [title, setTitle] = useState("");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createClient();

      const { data: auth } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!auth.user) {
        router.replace("/login");
        return;
      }

      const { data: form, error: formError } = await supabase
        .from("forms")
        .select("title")
        .eq("id", id)
        .eq("owner_id", auth.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (formError) {
        setError(formError.message);
        setLoading(false);
        return;
      }

      if (!form) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setTitle(form.title);

      const { data, error: submissionsError } = await supabase
        .from("submissions")
        .select("id, answers, created_at")
        .eq("form_id", id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (submissionsError) {
        setError(submissionsError.message);
      } else {
        setSubmissions((data as Submission[]) ?? []);
      }

      setLoading(false);
    }

    load().catch((err: unknown) => {
      if (cancelled) return;

      setError(
        err instanceof Error
          ? err.message
          : "Failed to load responses."
      );
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  if (loading) {
    return <p className="p-10 text-muted">Loading...</p>;
  }

  if (notFound) {
    return (
      <main className="p-10">
        <p className="text-muted">Form not found.</p>
        <Link
          href="/dashboard"
          className="mt-4 inline-block text-accent hover:underline"
        >
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-muted hover:text-fg"
        >
          <ArrowLeft size={16} />
          Dashboard
        </Link>

        <div className="flex items-center gap-2 text-sm">
          <ThemeToggle />
          <Link
            href={`/dashboard/forms/${id}`}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 hover:bg-fg/5"
          >
            <Pencil size={14} />
            Edit form
          </Link>
        </div>
      </header>

      <h1 className="mt-8 text-2xl font-bold">{title}</h1>

      <p className="mt-1 text-sm text-muted">
        {submissions.length}{" "}
        {submissions.length === 1 ? "response" : "responses"}
      </p>

      {error && (
        <p className="mt-4 text-sm text-red-500">{error}</p>
      )}

      {submissions.length === 0 && !error && (
        <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center text-muted">
          No responses yet. Share your form link to start collecting.
        </div>
      )}

      <div className="mt-6 space-y-4">
        {submissions.map((submission, i) => (
          <article
            key={submission.id}
            className="rounded-2xl border border-line bg-card p-5"
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold">
                Response #{submissions.length - i}
              </span>

              <time className="text-muted">
                {new Date(submission.created_at).toLocaleString(
                  undefined,
                  {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }
                )}
              </time>
            </div>

            <dl className="mt-4 space-y-3">
              {submission.answers.map((answer) => (
                <div key={answer.question_id}>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted">
                    {answer.label}
                  </dt>
                  <dd className="mt-0.5 break-words text-sm">
                    {answer.answer ?? (
                      <span className="text-muted">Skipped</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </main>
  );
}
