export default function Footer() {
  return (
    <footer className="border-t border-line py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-muted sm:flex-row">
        <span>© 2026 FormChat</span>
        <div className="flex gap-6">
          <a href="#features" className="hover:text-fg">Features</a>
          <a href="#how" className="hover:text-fg">How it works</a>
          <a href="mailto:hello@example.com" className="hover:text-fg">Contact</a>
        </div>
      </div>
    </footer>
  );
}