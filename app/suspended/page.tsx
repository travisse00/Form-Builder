"use client";

import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function SuspendedPage() {
  const router = useRouter();

  async function logout() {
    await createClient().auth.signOut();
    router.push("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-500/15 text-red-500">
          <Ban size={22} />
        </div>
        <h1 className="mt-5 text-2xl font-bold">Account suspended</h1>
        <p className="mt-2 text-muted">
          Your account has been suspended, so you can't use the dashboard right now. If you think this
          is a mistake, please contact support.
        </p>
        <button onClick={logout} className="mt-6 rounded-lg border border-line px-4 py-2 text-sm hover:bg-fg/5">
          Log out
        </button>
      </div>
    </main>
  );
}