/**
 * StorageProvider: local disk for development (swap for S3/GCS in production).
 * Safe upload rules: allow-listed MIME types verified by magic bytes, size cap, random keys (no user-controlled paths).
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { StorageProvider } from "./types";

export const ALLOWED_UPLOADS: Record<string, { ext: string; maxBytes: number }> = {
  "image/jpeg": { ext: "jpg", maxBytes: 8 * 1024 * 1024 },
  "image/png": { ext: "png", maxBytes: 8 * 1024 * 1024 },
  "image/webp": { ext: "webp", maxBytes: 8 * 1024 * 1024 },
  "application/pdf": { ext: "pdf", maxBytes: 10 * 1024 * 1024 },
  "audio/webm": { ext: "webm", maxBytes: 10 * 1024 * 1024 },
  "audio/ogg": { ext: "ogg", maxBytes: 10 * 1024 * 1024 },
  "audio/mpeg": { ext: "mp3", maxBytes: 10 * 1024 * 1024 },
  "audio/mp4": { ext: "m4a", maxBytes: 10 * 1024 * 1024 },
};

export function sniffMime(bytes: Uint8Array): string | null {
  const b = bytes;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) return "image/webp";
  if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return "application/pdf";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "audio/webm";
  if (b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53) return "audio/ogg";
  if ((b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return "audio/mpeg";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "audio/mp4";
  return null;
}

export function validateUpload(bytes: Uint8Array, declaredMime: string): { ok: true; mime: string } | { ok: false; error: string } {
  const sniffed = sniffMime(bytes);
  const mime = sniffed ?? declaredMime;
  const rule = ALLOWED_UPLOADS[mime];
  if (!rule || !sniffed) return { ok: false, error: "File type not allowed. Upload a JPEG/PNG/WebP photo, a PDF, or an audio note." };
  if (bytes.byteLength > rule.maxBytes) return { ok: false, error: `File too large (max ${Math.round(rule.maxBytes / 1024 / 1024)} MB).` };
  return { ok: true, mime };
}

class LocalDiskStorage implements StorageProvider {
  kind = "STORAGE";
  provider = "Local disk";
  status = "MOCK" as const;
  description = "Development storage under STORAGE_DIR. Use object storage (S3/GCS) with encryption at rest in production.";
  private root = path.resolve(process.env.STORAGE_DIR ?? "./storage");
  async put(file: { bytes: Uint8Array; mimeType: string }, folder: string) {
    const v = validateUpload(file.bytes, file.mimeType);
    if (!v.ok) throw new Error(v.error);
    const safeFolder = folder.replace(/[^a-z0-9-]/gi, "");
    const key = `${safeFolder}/${crypto.randomUUID()}.${ALLOWED_UPLOADS[v.mime].ext}`;
    await mkdir(path.join(this.root, safeFolder), { recursive: true });
    await writeFile(path.join(this.root, key), file.bytes);
    return { key, size: file.bytes.byteLength };
  }
  async get(key: string) {
    if (!/^[a-z0-9-]+\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/i.test(key)) return null;
    try {
      const bytes = await readFile(path.join(this.root, key));
      const ext = key.split(".").pop()!;
      const mimeType = Object.entries(ALLOWED_UPLOADS).find(([, r]) => r.ext === ext)?.[0] ?? "application/octet-stream";
      return { bytes: new Uint8Array(bytes), mimeType };
    } catch {
      return null;
    }
  }
}

export const getStorage = (): StorageProvider => new LocalDiskStorage();
