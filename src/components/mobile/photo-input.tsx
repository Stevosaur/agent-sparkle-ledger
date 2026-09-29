"use client";
import { useRef, useState } from "react";
import { Camera, Check } from "lucide-react";

/** Camera/photo capture → authenticated upload → storage key. */
export function PhotoInput({ onUploaded, folder, label = "Photo" }: { onUploaded: (key: string | null) => void; folder: string; label?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [preview, setPreview] = useState<string | null>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setPreview(URL.createObjectURL(f));
          setState("uploading");
          const fd = new FormData();
          fd.append("file", f);
          fd.append("folder", folder);
          try {
            const r = await fetch("/api/upload", { method: "POST", body: fd });
            const j = await r.json();
            if (!r.ok) throw new Error(j.error);
            setState("done");
            onUploaded(j.key);
          } catch {
            setState("error");
            onUploaded(null);
          }
        }}
      />
      <button type="button" onClick={() => ref.current?.click()} className="flex h-16 w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-border bg-panel-2 text-sm text-text-2 active:bg-panel-3">
        {preview ? <img src={preview} alt="" className="h-12 w-12 rounded object-cover" /> : <Camera className="size-5" />}
        {state === "uploading" ? "Uploading…" : state === "done" ? <span className="flex items-center gap-1 text-ok"><Check className="size-4" /> {label} attached</span> : state === "error" ? <span className="text-short">Upload failed — tap to retry</span> : label}
      </button>
    </>
  );
}
