/**
 * Markdown-lite for assistant answers: paragraphs, bullet and numbered lists, **bold** and internal
 * links. Produces a small AST that the UI renders as React elements, so model output is never
 * injected as HTML. Anything else (headings, code, tables) degrades to plain text.
 * Client-safe and pure.
 */

export type Inline = { t: "text"; v: string } | { t: "bold"; c: Inline[] } | { t: "link"; href: string; c: Inline[] };

export type Block = { t: "p"; c: Inline[] } | { t: "ul"; items: Inline[][] } | { t: "ol"; start: number; items: Inline[][] };

const UL = /^\s*[-*•]\s+(.*)$/;
const OL = /^\s*(\d{1,3})[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const FENCE = /^\s*```/;
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** Internal site paths only ("/hdb/blk-1-x/", "/docs/#search"); no protocol-relative or external URLs. */
export function safeHref(href: string): string | null {
  const h = href.trim();
  if (!/^\/(?!\/)[A-Za-z0-9\-._~/%]*(\?[A-Za-z0-9\-._~=&%+]*)?(#[A-Za-z0-9\-._~]*)?$/.test(h)) return null;
  if (h.includes("..") || h.includes("\\")) return null;
  return h;
}

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ t: "text", v: text });
    text = "";
  };
  let i = 0;
  while (i < src.length) {
    // **bold** (an unclosed marker runs to the end, so partially streamed text renders cleanly)
    if (src.startsWith("**", i) || src.startsWith("__", i)) {
      const marker = src.slice(i, i + 2);
      const end = src.indexOf(marker, i + 2);
      const inner = end === -1 ? src.slice(i + 2) : src.slice(i + 2, end);
      if (inner.trim()) {
        flush();
        out.push({ t: "bold", c: parseInline(inner) });
      }
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    // [label](href)
    if (src[i] === "[") {
      const m = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/.exec(src.slice(i));
      if (m) {
        flush();
        const href = safeHref(m[2]);
        const label = parseInline(m[1]);
        if (href) out.push({ t: "link", href, c: label });
        else out.push(...label);
        i += m[0].length;
        continue;
      }
    }
    // `code` -> plain text
    if (src[i] === "`") {
      const end = src.indexOf("`", i + 1);
      if (end > i) {
        text += src.slice(i + 1, end);
        i = end + 1;
        continue;
      }
    }
    text += src[i];
    i += 1;
  }
  flush();
  return mergeText(out);
}

function mergeText(nodes: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const n of nodes) {
    const last = out[out.length - 1];
    if (n.t === "text" && last?.t === "text") out[out.length - 1] = { t: "text", v: last.v + n.v };
    else out.push(n);
  }
  return out;
}

export function parseMarkdownLite(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { t: "ul" | "ol"; start: number; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", c: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((s) => parseInline(s.trim()));
      blocks.push(list.t === "ul" ? { t: "ul", items } : { t: "ol", start: list.start, items });
    }
    list = null;
  };

  for (const rawLine of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/\s+$/, "");
    if (FENCE.test(line) || TABLE_RULE.test(line)) continue;
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }
    const ul = UL.exec(line);
    const ol = ul ? null : OL.exec(line);
    if (ul || ol) {
      flushPara();
      const kind = ul ? "ul" : "ol";
      if (!list || list.t !== kind) {
        flushList();
        list = { t: kind, start: ol ? Number(ol[1]) : 1, items: [] };
      }
      list.items.push(ul ? ul[1] : ol![2]);
      continue;
    }
    if (list && /^\s{2,}\S/.test(rawLine)) {
      // indented continuation of the previous list item
      list.items[list.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    flushList();
    const heading = HEADING.exec(line);
    if (heading) {
      flushPara();
      blocks.push({ t: "p", c: [{ t: "bold", c: parseInline(heading[1]) }] });
      continue;
    }
    // table rows read as text: "| a | b |" -> "a · b"
    const text = /^\s*\|.*\|\s*$/.test(line)
      ? line
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim())
          .filter(Boolean)
          .join(" · ")
      : line.trim();
    para.push(text);
  }
  flushPara();
  flushList();
  return blocks;
}

/** Plain text of an answer (for copying / history). */
export function inlineText(nodes: Inline[]): string {
  return nodes.map((n) => (n.t === "text" ? n.v : inlineText(n.c))).join("");
}
