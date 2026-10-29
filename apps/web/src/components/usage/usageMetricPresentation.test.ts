import { describe, expect, it, vi } from "vite-plus/test";
const locale = vi.hoisted(() => ({ value: "zh-CN" }));
vi.mock("~/i18n", () => ({
  uiText: (key: string, values?: Record<string, unknown>) => {
    const text =
      locale.value === "zh-CN"
        ? ({
            cost: "费用",
            "{0} of cost · {1} tokens": "占费用 {0} · {1} tokens",
            "{0} of tokens · {1}": "占令牌 {0} · {1}",
          }[key] ?? key)
        : key;
    return text.replace(/\{(\d)\}/g, (_, key) => String(values?.[key] ?? key));
  },
}));
import { usageMetricPresentation } from "./usageMetricPresentation";
describe("usage currency and token presentation", () => {
  it.each(["zh-CN", "en"])(
    "keeps totals and provider shares on the selected metric in %s",
    (language) => {
      locale.value = language;
      const totals = {
        costUsd: 218.27,
        totalTokens: 394000000,
        costShare: 0.846,
        tokenShare: 0.78,
      };
      const cost = usageMetricPresentation("cost", totals);
      const tokens = usageMetricPresentation("tokens", totals);
      expect(cost.isCost).toBe(true);
      expect(cost.value).toBe("$218.27");
      expect(cost.share).toContain("84.6%");
      expect(tokens.isCost).toBe(false);
      expect(tokens.value).toBe("394M");
      expect(tokens.share).toContain("78.0%");
    },
  );
});
