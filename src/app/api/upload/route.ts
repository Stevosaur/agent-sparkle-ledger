import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/auth/session";
import { getStorage, validateUpload } from "@/lib/integrations/storage";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** Authenticated upload of photos / PDFs / voice notes. Type is verified by magic bytes; size capped. */
export async function POST(req: Request) {
  const app = await getAppContext();
  if (!app) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rl = rateLimit(`upload:${app.user.id}:${clientIp(req.headers)}`, 30, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many uploads" }, { status: 429, headers: { "Retry-After": String(rl.retryAfter) } });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "File too large" }, { status: 413 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const v = validateUpload(bytes, file.type);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 415 });
  const folder = String(form.get("folder") ?? "uploads").replace(/[^a-z-]/g, "") || "uploads";
  const res = await getStorage().put({ bytes, mimeType: v.mime }, `${app.org.id.slice(0, 8)}-${folder}`);
  return NextResponse.json({ key: res.key, size: res.size });
}
