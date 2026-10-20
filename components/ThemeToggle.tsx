"use client";

import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  function toggle() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {}
  }

  return (
    <button
      onClick={toggle}
      aria-label="Toggle theme"
      className="rounded-lg border border-line p-2 text-muted hover:text-fg"
    >
      <Sun size={16} className="hidden dark:block" />
      <Moon size={16} className="dark:hidden" />
    </button>
  );
}