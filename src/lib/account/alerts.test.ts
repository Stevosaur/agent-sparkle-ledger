import { describe, expect, it } from "vitest";
import { batchByChat, buildAlertMessage, isNewerMonth, planAlertDispatch, TELEGRAM_MAX_TEXT, type AlertRowLite, type PropertyActivity } from "./alerts-math";
import { getPropertyActivity } from "./activity";
import { generateLinkCode, LINK_CODE_RE, parseBotCommand, safeEqual, sendTelegramMessage, telegramDeepLink } from "./telegram";

const sale: PropertyActivity = { label: "Blk 872A Tampines St 86", url: "https://example.com/hdb/blk-872a-tampines-st-86/", kind: "sale", month: "2026-08", lastPrice: 464000, unitsSold: null, totalUnits: null };

describe("isNewerMonth", () => {
  it("compares YYYY-MM months", () => {
    expect(isNewerMonth("2026-08", "2026-07")).toBe(true);
    expect(isNewerMonth("2026-08", "2026-08")).toBe(false);
    expect(isNewerMonth("2026-01", "2025-12")).toBe(true);
    expect(isNewerMonth("2025-12", "2026-01")).toBe(false);
    expect(isNewerMonth("2026-08", null)).toBe(true);
    expect(isNewerMonth(null, null)).toBe(false);
    expect(isNewerMonth(null, "2026-01")).toBe(false);
  });
});

describe("buildAlertMessage", () => {
  it("describes a new sale", () => {
    const text = buildAlertMessage(sale, "Plotline", "https://example.com/profile/");
    expect(text).toContain("new sale recorded at Blk 872A Tampines St 86");
    expect(text).toContain("S$464,000 (Aug 2026)");
    expect(text).toContain("https://example.com/hdb/blk-872a-tampines-st-86/");
    expect(text).toContain("Manage alerts: https://example.com/profile/");
  });

  it("describes a launch sales update", () => {
    const text = buildAlertMessage({ ...sale, label: "Aurora Fixture Residences", kind: "launch", lastPrice: null, unitsSold: 240, totalUnits: 400 }, "Plotline", "https://example.com/profile/");
    expect(text).toContain("new sales update for Aurora Fixture Residences");
    expect(text).toContain("Units sold: 240 of 400 (as of Aug 2026)");
  });
});

describe("planAlertDispatch", () => {
  const alert = (id: number, overrides: Partial<AlertRowLite> = {}): AlertRowLite => ({ id, user_id: "u1", ref: "hdb:blk-872a-tampines-st-86", kind: "new-sale", channel: "telegram", last_checked_month: "2026-07", ...overrides });
  const activity = new Map<string, PropertyActivity | null>([
    ["hdb:blk-872a-tampines-st-86", sale],
    ["condo:gone", null],
  ]);
  const chats = new Map<string, string | null>([
    ["u1", "111"],
    ["u2", null],
    ["u3", "333"],
  ]);

  it("sends when the property has a newer month and the user is linked", () => {
    const plan = planAlertDispatch([alert(1)], activity, chats, null, "Plotline", "https://example.com/profile/");
    expect(plan.sends).toHaveLength(1);
    expect(plan.sends[0]).toMatchObject({ alertId: 1, userId: "u1", chatId: "111", month: "2026-08" });
    expect(plan.skipped).toEqual([]);
  });

  it("skips unchanged, missing, unlinked, unentitled and email alerts", () => {
    const plan = planAlertDispatch(
      [
        alert(1, { last_checked_month: "2026-08" }),
        alert(2, { ref: "condo:gone" }),
        alert(3, { user_id: "u2" }),
        alert(4, { user_id: "u3" }),
        alert(5, { channel: "email" }),
        alert(6, { user_id: "u1" }),
      ],
      activity,
      chats,
      new Set(["u1", "u2"]),
      "Plotline",
      "https://example.com/profile/",
    );
    expect(plan.skipped).toEqual([
      { alertId: 1, reason: "no-change" },
      { alertId: 2, reason: "not-found" },
      { alertId: 3, reason: "not-linked" },
      { alertId: 4, reason: "not-entitled" },
      { alertId: 5, reason: "channel-unavailable" },
    ]);
    expect(plan.sends.map((s) => s.alertId)).toEqual([6]);
  });
});

describe("batchByChat", () => {
  const send = (alertId: number, chatId: string, label: string) => {
    const activity = { ...sale, label };
    const plan = planAlertDispatch([{ id: alertId, user_id: `u${chatId}`, ref: "r", kind: "new-sale", channel: "telegram", last_checked_month: null }], new Map([["r", activity]]), new Map([[`u${chatId}`, chatId]]), null, "Plotline", "https://example.com/profile/");
    return plan.sends[0];
  };

  it("sends a single alert exactly as its own message", () => {
    const s = send(1, "111", "Blk 1");
    expect(batchByChat([s], "https://example.com/profile/")).toEqual([{ chatId: "111", alerts: [{ alertId: 1, month: "2026-08" }], text: s.text }]);
  });

  it("combines a chat's alerts into one message with one footer", () => {
    const messages = batchByChat([send(1, "111", "Blk 1"), send(2, "222", "Blk 2"), send(3, "111", "Blk 3")], "https://example.com/profile/");
    expect(messages.map((m) => [m.chatId, m.alerts.map((a) => a.alertId)])).toEqual([
      ["111", [1, 3]],
      ["222", [2]],
    ]);
    expect(messages[0].text).toContain("new sale recorded at Blk 1");
    expect(messages[0].text).toContain("new sale recorded at Blk 3");
    expect(messages[0].text.match(/Manage alerts:/g)).toHaveLength(1);
    expect(messages[0].text.endsWith("Manage alerts: https://example.com/profile/")).toBe(true);
  });

  it("splits a chat's alerts only when a message would pass Telegram's length limit", () => {
    const sends = Array.from({ length: 40 }, (_, i) => send(i + 1, "111", `Blk ${i + 1} ${"x".repeat(150)}`));
    const messages = batchByChat(sends, "https://example.com/profile/");
    expect(messages.length).toBeGreaterThan(1);
    for (const m of messages) expect(m.text.length).toBeLessThanOrEqual(TELEGRAM_MAX_TEXT);
    expect(messages.flatMap((m) => m.alerts.map((a) => a.alertId))).toEqual(sends.map((s) => s.alertId));
  });
});

describe("getPropertyActivity (fixtures)", () => {
  it("reads tx.last for sale properties", () => {
    const a = getPropertyActivity({ kind: "hdb", slug: "blk-872a-tampines-st-86" });
    expect(a).toMatchObject({ kind: "sale", month: "2026-08", lastPrice: 464000, label: "Blk 872A Tampines St 86" });
    expect(a?.url.endsWith("/hdb/blk-872a-tampines-st-86/")).toBe(true);
    expect(getPropertyActivity({ kind: "landed-street", slug: "sample-ln" })).toMatchObject({ month: "2025-09" });
    expect(getPropertyActivity({ kind: "hdb", slug: "blk-999-tampines-st-99" })).toMatchObject({ month: null });
  });

  it("reads the latest sales report for launches", () => {
    expect(getPropertyActivity({ kind: "launch", slug: "aurora-fixture-residences", launchType: "condo" })).toMatchObject({ kind: "launch", month: "2026-08", unitsSold: 240, totalUnits: 400 });
    expect(getPropertyActivity({ kind: "launch", slug: "upcoming-fixture-towers", launchType: "condo" })).toMatchObject({ kind: "launch", month: null });
  });

  it("returns null for unknown properties", () => {
    expect(getPropertyActivity({ kind: "condo", slug: "does-not-exist" })).toBeNull();
  });
});

describe("telegram helpers", () => {
  it("generates single-use link codes valid as /start parameters", () => {
    const a = generateLinkCode();
    const b = generateLinkCode();
    expect(a).toMatch(LINK_CODE_RE);
    expect(a).not.toBe(b);
    expect(telegramDeepLink("PlotlineBot", a)).toBe(`https://t.me/PlotlineBot?start=${a}`);
  });

  it("parses bot commands", () => {
    expect(parseBotCommand("/start abcdefghijklmnopqrstuvwx")).toEqual({ command: "start", code: "abcdefghijklmnopqrstuvwx" });
    expect(parseBotCommand("/start@PlotlineBot abcdefghijklmnopqrstuvwx")).toEqual({ command: "start", code: "abcdefghijklmnopqrstuvwx" });
    expect(parseBotCommand("/start")).toEqual({ command: "start", code: null });
    expect(parseBotCommand("/start short")).toEqual({ command: "start", code: null });
    expect(parseBotCommand("/start bad!code!bad!code!bad")).toEqual({ command: "start", code: null });
    expect(parseBotCommand("/stop")).toEqual({ command: "stop" });
    expect(parseBotCommand("hello")).toEqual({ command: "other" });
    expect(parseBotCommand(undefined)).toEqual({ command: "other" });
  });

  it("compares secrets in constant time", () => {
    expect(safeEqual("secret", "secret")).toBe(true);
    expect(safeEqual("secret", "secreT")).toBe(false);
    expect(safeEqual("secret", "secret-longer")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
  });

  it("calls sendMessage and reports Bot API failures without throwing", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const okFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await sendTelegramMessage("TOKEN", "42", "hi", okFetch)).toEqual({ ok: true, status: 200, description: undefined });
    expect(calls[0].url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    expect(calls[0].body).toMatchObject({ chat_id: "42", text: "hi" });

    const blocked = (async () => new Response(JSON.stringify({ ok: false, description: "Forbidden: bot was blocked by the user" }), { status: 403 })) as unknown as typeof fetch;
    expect(await sendTelegramMessage("TOKEN", "42", "hi", blocked)).toEqual({ ok: false, status: 403, description: "Forbidden: bot was blocked by the user" });

    const down = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    expect(await sendTelegramMessage("TOKEN", "42", "hi", down)).toEqual({ ok: false, status: 0, description: "ECONNRESET" });
  });
});
