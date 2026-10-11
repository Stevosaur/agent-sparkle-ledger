import { describe, expect, it } from "vitest";
import { inlineText, parseInline, parseMarkdownLite, safeHref } from "./markdown";

describe("markdown-lite", () => {
  it("parses paragraphs, lists and bold", () => {
    const blocks = parseMarkdownLite("The latest sale was **S$464,000**.\nIt was a 3-room flat.\n\n- First point\n- Second **bold** point\n\n1. One\n2. Two");
    expect(blocks).toEqual([
      { t: "p", c: [{ t: "text", v: "The latest sale was " }, { t: "bold", c: [{ t: "text", v: "S$464,000" }] }, { t: "text", v: ". It was a 3-room flat." }] },
      { t: "ul", items: [[{ t: "text", v: "First point" }], [{ t: "text", v: "Second " }, { t: "bold", c: [{ t: "text", v: "bold" }] }, { t: "text", v: " point" }]] },
      { t: "ol", start: 1, items: [[{ t: "text", v: "One" }], [{ t: "text", v: "Two" }]] },
    ]);
  });

  it("starts a list right after a paragraph line and keeps ordered list numbering", () => {
    const blocks = parseMarkdownLite("Options:\n3. Third\n4. Fourth");
    expect(blocks[0].t).toBe("p");
    expect(blocks[1]).toMatchObject({ t: "ol", start: 3 });
  });

  it("joins indented continuation lines into the list item", () => {
    const blocks = parseMarkdownLite("- First line\n  continues here\n- Second");
    expect(blocks).toHaveLength(1);
    expect(inlineText((blocks[0] as { items: Parameters<typeof inlineText>[0][] }).items[0])).toBe("First line continues here");
  });

  it("renders unclosed bold while streaming", () => {
    expect(parseInline("Price **S$46")).toEqual([{ t: "text", v: "Price " }, { t: "bold", c: [{ t: "text", v: "S$46" }] }]);
  });

  it("keeps HTML as plain text", () => {
    const blocks = parseMarkdownLite('<img src=x onerror="alert(1)"> <script>alert(1)</script>');
    expect(blocks).toEqual([{ t: "p", c: [{ t: "text", v: '<img src=x onerror="alert(1)"> <script>alert(1)</script>' }] }]);
  });

  it("allows internal links only", () => {
    expect(parseInline("See [the block](/hdb/blk-872a-tampines-st-86/)")).toEqual([
      { t: "text", v: "See " },
      { t: "link", href: "/hdb/blk-872a-tampines-st-86/", c: [{ t: "text", v: "the block" }] },
    ]);
    expect(parseInline("[click](https://evil.example/)")).toEqual([{ t: "text", v: "click" }]);
    // the javascript: URL is dropped; only the label (and the stray parenthesis) remain as text
    expect(parseInline("[x](javascript:alert(1))")).toEqual([{ t: "text", v: "x)" }]);
    expect(safeHref("//evil.example/")).toBeNull();
    expect(safeHref("/a/../b/")).toBeNull();
    expect(safeHref("/docs/#search")).toBe("/docs/#search");
  });

  it("degrades headings, code fences and tables to text", () => {
    const blocks = parseMarkdownLite("## Summary\n```\ncode\n```\n| Month | Price |\n|---|---|\n| Aug 2026 | S$464,000 |");
    expect(blocks[0]).toEqual({ t: "p", c: [{ t: "bold", c: [{ t: "text", v: "Summary" }] }] });
    expect(inlineText((blocks[1] as { c: Parameters<typeof inlineText>[0] }).c)).toBe("code Month · Price Aug 2026 · S$464,000");
  });
});
