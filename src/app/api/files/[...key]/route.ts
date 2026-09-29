import { NextResponse } from "next/server";
import { getAppContext } from "@/lib/auth/session";
import { getStorage } from "@/lib/integrations/storage";

/** Serve a stored file to members of the owning organisation only (keys are prefixed with the org id). */
export async function GET(_req: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const app = await getAppContext();
  if (!app) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const key = (await params).key.join("/");
  if (!key.startsWith(app.org.id.slice(0, 8) + "-")) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const f = await getStorage().get(key);
  if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new NextResponse(Buffer.from(f.bytes), { headers: { "Content-Type": f.mimeType, "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" } });
}
