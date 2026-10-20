import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-4xl font-bold">Page not found</h1>
      <p className="text-muted">The page you're looking for doesn't exist.</p>
      <Link href="/" className="rounded-lg bg-violet-500 px-5 py-2.5 font-semibold text-white hover:bg-violet-600">
        Go home
      </Link>
    </main>
  );
}