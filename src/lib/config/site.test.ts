import { afterEach, describe, expect, it, vi } from "vitest";

/** site.ts reads NEXT_PUBLIC_* at module load, so each case re-imports it with a stubbed environment. */
async function loadSite(contactEmail: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", contactEmail);
  return import("./site");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("contact e-mail", () => {
  it("publishes no address when NEXT_PUBLIC_CONTACT_EMAIL is unset", async () => {
    const { site, configuredContactEmail } = await loadSite("");
    expect(site.contactEmail).toBe("");
    expect(configuredContactEmail()).toBeNull();
  });

  it("treats a reserved example.* placeholder as not configured", async () => {
    const { configuredContactEmail } = await loadSite("hello@example.com");
    expect(configuredContactEmail()).toBeNull();
  });

  it("returns a real configured address, trimmed", async () => {
    const { configuredContactEmail } = await loadSite("  dpo@plotline.sg ");
    expect(configuredContactEmail()).toBe("dpo@plotline.sg");
  });
});

describe("primary navigation", () => {
  it("links to the homes marketplace with a translatable label", async () => {
    const { primaryNav } = await loadSite("");
    expect(primaryNav).toContainEqual({ href: "/homes/", labelKey: "nav.homes", label: "Homes" });
    for (const item of primaryNav) expect(item.href.endsWith("/")).toBe(true);
  });
});

describe("site URL", () => {
  async function loadUrl(env: Record<string, string>) {
    vi.resetModules();
    for (const k of ["NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) vi.stubEnv(k, env[k] ?? "");
    return (await import("./site")).site.url;
  }

  it("prefers NEXT_PUBLIC_SITE_URL and drops a trailing slash", async () => {
    expect(await loadUrl({ NEXT_PUBLIC_SITE_URL: "https://plotline.sg/", VERCEL_PROJECT_PRODUCTION_URL: "x.vercel.app" })).toBe("https://plotline.sg");
  });

  it("falls back to the Vercel production domain, then localhost", async () => {
    expect(await loadUrl({ VERCEL_PROJECT_PRODUCTION_URL: "plotline.vercel.app" })).toBe("https://plotline.vercel.app");
    expect(await loadUrl({ NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL: "plotline.vercel.app" })).toBe("https://plotline.vercel.app");
    expect(await loadUrl({})).toBe("http://localhost:3000");
  });
});
