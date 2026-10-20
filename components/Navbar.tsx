import React from 'react'
import ThemeToggle from "@/components/ThemeToggle";

function Navbar() {
  return (
    <div>
      {/* Nav */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="text-lg font-bold tracking-tight">
          Form<span className="text-accent">Chat</span>
        </span>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <a href="#features" className="hidden hover:text-fg sm:block">Features</a>
          <a href="#how" className="hidden hover:text-fg sm:block">How it works</a>
          <a href="/login" className="hover:text-fg">Log in</a>
          <ThemeToggle />
          <a href="/signup" className="rounded-lg bg-fg px-4 py-2 font-semibold text-bg hover:bg-fg/90">
            Sign up
          </a>
        </nav>
      </header>
    </div>
  )
}

export default Navbar