import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/lib/config/site";

/** Default social card for every page without its own image: the brand wordmark and tagline. */

export const alt = `${site.name}: Singapore property research`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Geist (the site font) from the installed package; falls back to the built-in font if unavailable. */
async function loadFont(file: string): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(path.join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans", file));
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  } catch {
    return null;
  }
}

export default async function OpengraphImage() {
  const [regular, bold] = await Promise.all([loadFont("Geist-Regular.ttf"), loadFont("Geist-Bold.ttf")]);
  const fonts = [
    ...(regular ? [{ name: "Geist", data: regular, weight: 400 as const, style: "normal" as const }] : []),
    ...(bold ? [{ name: "Geist", data: bold, weight: 700 as const, style: "normal" as const }] : []),
  ];
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #f4faf8 0%, #ffffff 55%, #e3f1ed 100%)",
          color: "#0f1d1b",
          fontFamily: fonts.length ? "Geist" : undefined,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <svg width="120" height="120" viewBox="0 0 32 32">
            <rect width="32" height="32" rx="8" fill="#19625b" />
            <path d="M6 22 L12 15 L17 18 L26 8" stroke="#ffffff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="26" cy="8" r="2.4" fill="#f7b538" />
          </svg>
          <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{site.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 54, fontWeight: 700, lineHeight: 1.15, maxWidth: 980 }}>{site.tagline}</div>
          <div style={{ fontSize: 30, color: "#4b5d5a", maxWidth: 980 }}>HDB resale, condo and landed sales, valuations, calculators and rankings.</div>
        </div>
        <div style={{ display: "flex", height: 10, width: 220, borderRadius: 5, background: "#19625b" }} />
      </div>
    ),
    { ...size, fonts },
  );
}
