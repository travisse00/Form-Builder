
"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Save, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export type WidgetValues = {
  avatar: string;
  position: "left" | "right";
};

const field =
  "w-full rounded-lg bg-fg/5 px-4 py-3 text-sm outline-none placeholder:text-muted focus:bg-fg/10 focus:ring-2 focus:ring-violet-500/40";

export default function WidgetSettings({
  formId,
  onChange,
}: {
  formId: string;
  onChange: (v: WidgetValues) => void;
}) {
  const [avatar, setAvatar] = useState("");
  const [position, setPosition] = useState<"left" | "right">("right");
  const [saved, setSaved] = useState<WidgetValues>({
    avatar: "",
    position: "right",
  });

  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing widget settings from Supabase.
  useEffect(() => {
    async function load() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from("forms")
        .select("avatar_url, widget_position")
        .eq("id", formId)
        .maybeSingle();

      if (error) {
        setErr("Couldn't load settings: " + error.message);
        return;
      }

      const values: WidgetValues = {
        avatar: data?.avatar_url ?? "",
        position:
          data?.widget_position === "left" ? "left" : "right",
      };

      setAvatar(values.avatar);
      setPosition(values.position);
      setSaved(values);
    }

    load();
  }, [formId]);

  // Keep the builder preview synchronized.
  useEffect(() => {
    onChange({
      avatar: avatar.trim(),
      position,
    });
  }, [avatar, position, onChange]);

  const dirty =
    avatar.trim() !== saved.avatar ||
    position !== saved.position;

  // Upload an image to Cloudinary.
  async function uploadAvatar(file?: File) {
    if (!file) return;

    setErr("");
    setMsg("");

    if (!file.type.startsWith("image/")) {
      setErr("Please select an image file.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErr("The image must be 5 MB or smaller.");
      return;
    }

    const cloudName =
      process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;

    const uploadPreset =
      process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

    const folder =
      process.env.NEXT_PUBLIC_CLOUDINARY_FOLDER;

    if (!cloudName || !uploadPreset) {
      setErr(
        "Cloudinary configuration is missing. Check your .env.local file."
      );
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();

      formData.append("file", file);
      formData.append("upload_preset", uploadPreset);

      if (folder) {
        formData.append("folder", folder);
      }

      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error?.message || "Cloudinary upload failed."
        );
      }

      if (!result.secure_url) {
        throw new Error(
          "Cloudinary did not return an image URL."
        );
      }

      // Automatically populate the avatar field.
      setAvatar(result.secure_url);
      setMsg(
        "Image uploaded. Click Save appearance to save it."
      );
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Image upload failed."
      );
    } finally {
      setUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // Save the avatar URL and position in Supabase.
  async function save() {
    setErr("");
    setMsg("");

    const url = avatar.trim();

    if (url && !/^https:\/\/\S+$/i.test(url)) {
      setErr("The avatar must be a link starting with https://");
      return;
    }

    setBusy(true);

    try {
      const supabase = createClient();

      const { error } = await supabase
        .from("forms")
        .update({
          avatar_url: url || null,
          widget_position: position,
        })
        .eq("id", formId);

      if (error) {
        setErr(error.message);
        return;
      }

      setSaved({
        avatar: url,
        position,
      });

      setMsg("Saved successfully.");
    } catch {
      setErr("Something went wrong while saving.");
    } finally {
      setBusy(false);
    }
  }

  function removeAvatar() {
    setAvatar("");
    setMsg("");
    setErr("");
  }

  return (
    <section className="space-y-4 rounded-2xl border border-line bg-card p-5">
      <h2 className="font-semibold">Widget appearance</h2>

      {/* Avatar image */}
      <div className="space-y-3">
        <label
          htmlFor="widget-avatar-url"
          className="block text-sm font-medium"
        >
          Avatar image
        </label>

        <input
          id="widget-avatar-url"
          className={field}
          placeholder="Avatar image link (https://...)"
          value={avatar}
          onChange={(e) => {
            setAvatar(e.target.value);
            setMsg("");
            setErr("");
          }}
        />

        {/* Hidden file input triggered by the upload button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            uploadAvatar(e.target.files?.[0]);
          }}
        />

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5 disabled:opacity-50"
          >
            {uploading ? (
              <Upload size={14} className="animate-pulse" />
            ) : (
              <ImagePlus size={14} />
            )}

            {uploading ? "Uploading..." : "Upload image"}
          </button>

          {avatar && (
            <button
              type="button"
              onClick={removeAvatar}
              className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-muted hover:bg-fg/5 hover:text-fg"
            >
              <X size={14} />
              Remove avatar
            </button>
          )}
        </div>

        {/* Avatar preview */}
        {avatar && (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatar}
              alt="Widget avatar preview"
              className="h-12 w-12 rounded-full border border-line object-cover"
            />

            <p className="break-all text-xs text-muted">
              Avatar preview
            </p>
          </div>
        )}

        <p className="text-xs text-muted">
          Upload an image up to 5 MB, or paste an HTTPS image link.
          A square image works best. Remember to save your changes.
        </p>
      </div>

      {/* Widget position */}
      <div className="flex items-center justify-between text-sm text-muted">
        Bubble position

        <div className="flex gap-1 rounded-lg bg-fg/5 p-1">
          {(["left", "right"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPosition(p)}
              className={`rounded-md px-3 py-1 capitalize ${
                position === p
                  ? "bg-card font-medium text-fg shadow-sm"
                  : "hover:text-fg"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Feedback */}
      {err && (
        <p role="alert" className="text-sm text-red-500">
          {err}
        </p>
      )}

      {msg && !err && (
        <p role="status" className="text-sm text-muted">
          {msg}
        </p>
      )}

      {/* Save settings */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted">
          {dirty ? "Not saved yet" : msg || "Saved"}
        </span>

        <button
          type="button"
          onClick={save}
          disabled={busy || uploading || !dirty}
          className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm hover:bg-fg/5 disabled:opacity-50"
        >
          <Save size={14} />
          {busy ? "Saving..." : "Save appearance"}
        </button>
      </div>
    </section>
  );
}
