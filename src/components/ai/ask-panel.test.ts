import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const viewerState = { viewer: null as null | { integrations: { ai: boolean } }, loading: false, refresh: async () => undefined };
vi.mock("@/lib/auth/viewer-context", () => ({ useViewer: () => viewerState }));

const { AskPanel } = await import("./ask-panel");

describe("AskPanel", () => {
  it("renders nothing when the assistant is not configured", () => {
    viewerState.viewer = null;
    expect(renderToStaticMarkup(createElement(AskPanel, { context: { kind: "general" } }))).toBe("");
    viewerState.viewer = { integrations: { ai: false } };
    expect(renderToStaticMarkup(createElement(AskPanel, { context: { kind: "hdb", slug: "blk-1-x" } }))).toBe("");
  });

  it("renders a labelled input, send button and context suggestions when enabled", () => {
    viewerState.viewer = { integrations: { ai: true } };
    const html = renderToStaticMarkup(createElement(AskPanel, { context: { kind: "hdb", slug: "blk-872a-tampines-st-86" } }));
    expect(html).toContain("Ask about this property");
    expect(html).toContain("How much lease is left on this block?");
    expect(html).toMatch(/<label[^>]*for="([^"]+)"[^>]*>Your question<\/label>/);
    const id = /<label[^>]*for="([^"]+)"/.exec(html)![1];
    expect(html).toContain(`id="${id}"`);
    expect(html).toContain('aria-label="Ask"');
    expect(html).toContain("not financial advice");
    expect(html).not.toContain("dangerouslySetInnerHTML");
  });

  it("uses custom suggestions and title when given", () => {
    viewerState.viewer = { integrations: { ai: true } };
    const html = renderToStaticMarkup(createElement(AskPanel, { context: { kind: "general" }, title: "Ask us", suggestions: ["Custom question?"] }));
    expect(html).toContain("Ask us");
    expect(html).toContain("Custom question?");
    expect(html).not.toContain("median 4-room");
  });
});

describe("MarkdownLite", () => {
  it("renders bold, lists and internal links as elements and escapes HTML", async () => {
    const { MarkdownLite } = await import("./markdown-lite");
    const html = renderToStaticMarkup(createElement(MarkdownLite, { text: "Latest: **S$464,000** <script>alert(1)</script>\n\n- one\n- see [the block](/hdb/blk-1-x/)\n- [evil](https://evil.example/)" }));
    expect(html).toContain('<strong class="font-semibold"><span>S$464,000</span></strong>');
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    // next/link applies the trailingSlash setting at build time; outside Next it drops the slash
    expect(html).toMatch(/href="\/hdb\/blk-1-x\/?"/);
    expect(html).not.toContain("evil.example");
    expect(html).toMatch(/<ul[^>]*>.*<li>.*one.*<\/li>.*<\/ul>/);
  });
});
