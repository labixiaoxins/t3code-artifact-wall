import { formatPercent, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { uiText } from "~/i18n";
import type { UsageMetric } from "./usageShortcuts";

export function usageMetricPresentation(
  metric: UsageMetric,
  totals: {
    readonly costUsd: number;
    readonly totalTokens: number;
    readonly costShare?: number;
    readonly tokenShare?: number;
  },
) {
  const isCost = metric === "cost";
  return {
    isCost,
    value: isCost ? formatUsd(totals.costUsd) : formatTokens(totals.totalTokens),
    share: isCost
      ? uiText("{0} of cost · {1} tokens", {
          "0": formatPercent(totals.costShare ?? 0),
          "1": formatTokens(totals.totalTokens),
        })
      : uiText("{0} of tokens · {1}", {
          "0": formatPercent(totals.tokenShare ?? 0),
          "1": formatUsd(totals.costUsd),
        }),
  };
}
