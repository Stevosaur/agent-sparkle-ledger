import { describe, expect, it, vi } from "vitest";

const stream = vi.fn(() => ({ on: vi.fn(), finalMessage: vi.fn() }));
const ctor = vi.fn();

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class MockAnthropic {
    static APIError = actual.default.APIError;
    static RateLimitError = actual.default.RateLimitError;
    beta = { messages: { stream } };
    constructor(opts: unknown) {
      ctor(opts);
    }
  }
  return { ...actual, default: MockAnthropic };
});

describe("createAnthropicClient", () => {
  it("streams through the SDK's beta messages API with bounded retries and timeout", async () => {
    const { createAnthropicClient } = await import("./ask");
    const client = createAnthropicClient();
    expect(ctor).toHaveBeenCalledWith({ maxRetries: 2, timeout: 60_000 });
    const signal = new AbortController().signal;
    const params = { model: "claude-opus-5-5", max_tokens: 10, messages: [{ role: "user" as const, content: "hi" }] };
    client.stream(params, { signal });
    expect(stream).toHaveBeenCalledWith(params, { signal });
  });
});
