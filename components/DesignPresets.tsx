"use client";

import { useEffect, useState } from "react";
import { Palette, Trash2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type DesignValues = { color: string; welcome: string; completion: string };

type Preset = { id: string; name: string; settings: DesignValues };

const MAX_PRESETS = 20;

const field =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";

export default function DesignPresets({
  current,
  onApply,
}: {
  current: DesignValues;
  onApply: (v: DesignValues) => void;
}) {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("design_presets")
        .select("id, name, settings")
        .order("created_at", { ascending: false });
      if (error) setErr(error.message);
      else setPresets((data ?? []) as Preset[]);
      setLoading(false);
    }
    load();
  }, []);

  async function savePreset() {
    setErr("");
    setMsg("");
    const clean = name.trim();
    if (!clean) return setErr("Give the preset a name.");
    if (clean.length > 40) return setErr("Keep the name under 40 characters.");
    if (presets.length >= MAX_PRESETS) return setErr(`You can keep up to ${MAX_PRESETS} presets. Delete one first.`);

    setBusy(true);
    const supabase = createClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setBusy(false);
      return;
    }

    const { data, error } = await supabase
      .from("design_presets")
      .insert({
        owner_id: auth.user.id,
        name: clean,
        settings: {
          color: current.color,
          welcome: current.welcome,
          completion: current.completion,
        },
      })
      .select("id, name, settings")
      .single();
    setBusy(false);

    if (error || !data) return setErr(error?.message ?? "Couldn't save the preset.");
    setPresets((prev) => [data as Preset, ...prev]);
    setName("");
    setMsg("Preset saved");
  }

  function apply(p: Preset) {
    setErr("");
    onApply({
      color: p.settings.color || "#8b5cf6",
      welcome: p.settings.welcome ?? "",
      completion: p.settings.completion ?? "",
    });
    setMsg(`Applied "${p.name}"`);
  }

  async function remove(p: Preset) {
    if (!confirm(`Delete the preset "${p.name}"? Forms already using it keep their look.`)) return;
    const supabase = createClient();
    const { error } = await supabase.from("design_presets").delete().eq("id", p.id);
    if (error) return setErr(error.message);
    setPresets((prev) => prev.filter((x) => x.id !== p.id));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <div className="flex items-center gap-2">
        <Palette size={18} className="text-accent" />
        <h2 className="font-semibold">Design presets</h2>
      </div>
      <p className="text-xs text-muted">
        Save this form's colour and chat messages, then reuse them on your other forms.
      </p>

      <div className="flex gap-2">
        <input
          className={field}
          placeholder="Preset name, e.g. Brand purple"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePreset()}
          aria-label="Preset name"
        />
        <button
          onClick={savePreset}
          disabled={busy}
          className="shrink-0 rounded-lg bg-violet-500 px-4 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </div>

      {err && <p className="text-sm text-red-500">{err}</p>}
      {msg && !err && <p className="text-sm text-muted">{msg}</p>}

      {loading ? (
        <p className="text-sm text-muted">Loading presets...</p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-muted">No presets yet. Save your first one above.</p>
      ) : (
        <ul className="divide-y divide-line">
          {presets.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span
                className="h-6 w-6 shrink-0 rounded-full border border-line"
                style={{ backgroundColor: p.settings.color || "#8b5cf6" }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{p.name}</p>
                <p className="truncate text-xs text-muted">
                  {p.settings.welcome || "No welcome message"}
                </p>
              </div>
              <button
                onClick={() => apply(p)}
                className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-fg/5"
              >
                <Check size={14} /> Apply
              </button>
              <button
                onClick={() => remove(p)}
                aria-label={`Delete preset ${p.name}`}
                className="rounded-lg p-2 text-red-500 hover:bg-red-500/10"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}