import { describe, expect, it } from "vite-plus/test";
import { ProviderThreadId } from "@t3tools/contracts";
import { latestContextUsage } from "./contextUsage";

describe("active provider context", () => {
  const active = ProviderThreadId.make("active");
  const other = ProviderThreadId.make("previous");
  const usage = { usedTokens: 80_000, maxTokens: 200_000, updatedAt: "2026-10-11T00:00:00Z" };
  it("keeps the last active report between turns and ignores newer reports from other sessions", () => {
    expect(
      latestContextUsage({
        thread: { activeProviderThreadId: active },
        providerTurns: [
          { providerThreadId: active, tokenUsage: usage },
          { providerThreadId: other, tokenUsage: { ...usage, usedTokens: 190_000 } },
          { providerThreadId: active },
        ],
      }),
    ).toBe(usage);
  });
  it("does not borrow a former session's usage after switching providers", () => {
    expect(
      latestContextUsage({
        thread: { activeProviderThreadId: active },
        providerTurns: [{ providerThreadId: other, tokenUsage: usage }],
      }),
    ).toBeNull();
    expect(latestContextUsage(null)).toBeNull();
  });
  it("accepts an explicit zero report after compaction", () => {
    const zero = { ...usage, usedTokens: 0 };
    expect(
      latestContextUsage({
        thread: { activeProviderThreadId: active },
        providerTurns: [
          { providerThreadId: active, tokenUsage: usage },
          { providerThreadId: active, tokenUsage: zero },
        ],
      }),
    ).toBe(zero);
  });
});
