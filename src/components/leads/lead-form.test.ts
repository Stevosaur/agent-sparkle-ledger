import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

type Viewer = null | { integrations: { leads?: boolean } };
const viewerState = { viewer: null as Viewer, loading: false, refresh: async () => undefined };
vi.mock("@/lib/auth/viewer-context", () => ({ useViewer: () => viewerState }));

/** site.ts reads NEXT_PUBLIC_* at module load, so each render re-imports the form with the stubbed environment. */
async function render(viewer: Viewer, env: Record<string, string> = {}, props: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_WHATSAPP_NUMBER", env.whatsapp ?? "");
  vi.stubEnv("NEXT_PUBLIC_CONTACT_EMAIL", env.email ?? "");
  viewerState.viewer = viewer;
  const { LeadForm } = await import("./lead-form");
  return renderToStaticMarkup(createElement(LeadForm, { type: "general", ...props }));
}

const OFFLINE = "Online requests are not connected yet";
/** whether the submit button carries the disabled attribute (the class list also has disabled: variants) */
const submitDisabled = (html: string) => /\sdisabled(?:=""|[\s>])/.test(/<button[^>]*type="submit"[^>]*>/.exec(html)?.[0] ?? "");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LeadForm without a lead store", () => {
  it("works as before while the viewer is loading or when leads are configured", async () => {
    for (const viewer of [null, { integrations: {} }, { integrations: { leads: true } }]) {
      const html = await render(viewer);
      expect(html).not.toContain(OFFLINE);
      expect(submitDisabled(html)).toBe(false);
    }
  });

  it("says so up front and disables submit when /api/me/ reports no lead store", async () => {
    const html = await render({ integrations: { leads: false } });
    expect(html).toContain(OFFLINE);
    expect(html).toContain("no other contact channel is set up");
    expect(html.indexOf(OFFLINE)).toBeLessThan(html.indexOf("<form"));
    expect(submitDisabled(html)).toBe(true);
  });

  it("offers the configured WhatsApp and e-mail channels instead", async () => {
    const html = await render({ integrations: { leads: false } }, { whatsapp: "+65 9123 4567", email: "hello@plotline.sg" });
    expect(html).toContain("https://wa.me/6591234567?text=");
    expect(html).toContain("mailto:hello@plotline.sg?subject=");
    expect(html).not.toContain("no other contact channel is set up");
  });

  it("never offers a placeholder e-mail address", async () => {
    const html = await render({ integrations: { leads: false } }, { email: "hello@example.com" });
    expect(html).not.toContain("mailto:");
    expect(html).toContain("no other contact channel is set up");
  });

  it("accepts a node as the title", async () => {
    const html = await render(null, {}, { title: createElement("span", { "data-testid": "t" }, "Get notified") });
    expect(html).toContain('<span data-testid="t">Get notified</span>');
  });
});
