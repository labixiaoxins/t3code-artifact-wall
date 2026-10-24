import type {
  EnvironmentId,
  ProviderDriverKind,
  ServerProviderUsageLimits,
  ServerProviderUsageWindow,
} from "@t3tools/contracts";
import { collectLimitAccounts, type LimitPresentations } from "@t3tools/shared/usageLimits";
import * as Schema from "effect/Schema";

export const QUOTA_PREFERENCES_KEY = "t3code:quota-topbar:v1";
export const QuotaPreferencesSchema = Schema.Struct({
  pins: Schema.NullOr(Schema.Array(Schema.String)),
  windows: Schema.Record(Schema.String, Schema.String),
  showNames: Schema.Boolean,
});
export type QuotaPreferences = typeof QuotaPreferencesSchema.Type;
export const DEFAULT_QUOTA_PREFERENCES: QuotaPreferences = {
  pins: null,
  windows: {},
  showNames: true,
};
export interface QuotaAccount {
  readonly id: string;
  readonly driver: ProviderDriverKind;
  readonly label: string;
  readonly alias: string;
  readonly limits: ServerProviderUsageLimits | undefined;
  readonly connected: boolean;
  readonly failed: boolean;
}
type Presentations = ReadonlyMap<
  EnvironmentId,
  LimitPresentations extends ReadonlyMap<EnvironmentId, infer P>
    ? P & { readonly connection: { readonly phase: string } }
    : never
>;
const LABELS: Readonly<Record<string, string>> = {
  codex: "Codex",
  claudeAgent: "Claude",
  antigravity: "Antigravity",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
};

// Preference ids must stay local and must not persist emails or credential fingerprints.
function preferenceId(value: string): string {
  let hash = 14695981039346656037n;
  for (let i = 0; i < value.length; i++)
    hash = BigInt.asUintN(64, (hash ^ BigInt(value.charCodeAt(i))) * 1099511628211n);
  return hash.toString(36);
}
export function quotaAccounts(presentations: Presentations): readonly QuotaAccount[] {
  // Failed probes can retain usable cached windows. Unsupported accounts cannot.
  const cached = new Map(
    [...presentations].map(([id, p]) => [
      id,
      {
        ...p,
        serverConfig: p.serverConfig && {
          ...p.serverConfig,
          providers: p.serverConfig.providers.map((provider) =>
            provider.usageLimits?.unavailable?.reason === "probeFailed" &&
            provider.usageLimits.windows.length
              ? { ...provider, usageLimits: { ...provider.usageLimits, unavailable: undefined } }
              : provider,
          ),
          usageLimitSources: p.serverConfig.usageLimitSources?.map((source) => ({
            ...source,
            accounts: source.accounts.map((account) =>
              account.usageLimits.unavailable?.reason === "probeFailed" &&
              account.usageLimits.windows.length
                ? { ...account, usageLimits: { ...account.usageLimits, unavailable: undefined } }
                : account,
            ),
          })),
        },
      },
    ]),
  );
  const known = collectLimitAccounts(cached);
  const nativeLogins = [...presentations].flatMap(([id, p]) =>
    (p.serverConfig?.providers ?? []).map((provider) => ({
      key: `${id}:${provider.instanceId}`,
      provider,
    })),
  );
  const accounts: QuotaAccount[] = known.map((account) => {
    const related = [...presentations].filter(
      ([id, p]) =>
        account.environments.some((e) => e.environmentId === id) ||
        p.serverConfig?.usageLimitSources?.some((source) =>
          account.key.startsWith(source.id + ":"),
        ),
    );
    const failed = related.some(
      ([, p]) =>
        p.serverConfig?.providers.some(
          (provider) =>
            provider.driver === account.driver &&
            ((provider.usageLimits?.credentialFingerprint ===
              account.limits.credentialFingerprint &&
              !!account.limits.credentialFingerprint) ||
              (provider.auth.email === account.email && !!account.email) ||
              (account.redeem &&
                "instanceId" in account.redeem.input &&
                provider.instanceId === account.redeem.input.instanceId)) &&
            provider.usageLimits?.unavailable?.reason === "probeFailed",
        ) ||
        p.serverConfig?.usageLimitSources?.some(
          (source) =>
            account.key.startsWith(source.id + ":") &&
            (!!source.error ||
              source.accounts.some((a) => a.usageLimits.unavailable?.reason === "probeFailed")),
        ),
    );
    const alias =
      account.displayName && !account.displayName.includes("@")
        ? account.displayName
        : (account.plan ?? "");
    return {
      id: preferenceId(account.key),
      driver: account.driver,
      label: LABELS[account.driver] ?? String(account.driver),
      alias,
      limits: account.limits,
      connected: related.some(([, p]) => p.connection.phase === "connected"),
      failed,
    };
  });
  for (const [environmentId, p] of presentations) {
    for (const provider of p.serverConfig?.providers ?? []) {
      if (!provider.enabled || !provider.installed) continue;
      const exists = known.some(
        (a) =>
          a.driver === provider.driver &&
          ((a.redeem &&
            "instanceId" in a.redeem.input &&
            a.redeem.input.instanceId === provider.instanceId &&
            a.redeem.environmentId === environmentId) ||
            (a.environments.some((e) => e.environmentId === environmentId) &&
              provider.auth.email &&
              a.email === provider.auth.email &&
              nativeLogins.find((login) => login.key === a.key)?.provider.auth.workspaceId ===
                provider.auth.workspaceId)),
      );
      if (exists) continue;
      const alias =
        provider.displayName && !provider.displayName.includes("@")
          ? provider.displayName
          : (provider.auth.label ?? "");
      accounts.push({
        id: preferenceId(`${environmentId}:${provider.instanceId}`),
        driver: provider.driver,
        label: LABELS[provider.driver] ?? (alias || String(provider.driver)),
        alias,
        limits: provider.usageLimits,
        connected: p.connection.phase === "connected",
        failed: provider.usageLimits?.unavailable?.reason === "probeFailed",
      });
    }
  }
  const counts = new Map<string, number>();
  return accounts.map((a) => {
    const index = (counts.get(a.driver) ?? 0) + 1;
    counts.set(a.driver, index);
    return { ...a, alias: `${index}${a.alias ? ` · ${a.alias}` : ""}` };
  });
}
export function quotaPins(
  preferences: QuotaPreferences,
  accounts: readonly QuotaAccount[],
): readonly string[] {
  if (preferences.pins !== null) return [...new Set(preferences.pins)].slice(0, 4);
  const drivers = new Set<string>();
  const priority = ["codex", "claudeAgent", "antigravity"];
  return [...accounts]
    .sort(
      (a, b) =>
        (priority.indexOf(a.driver) < 0 ? 10 : priority.indexOf(a.driver)) -
        (priority.indexOf(b.driver) < 0 ? 10 : priority.indexOf(b.driver)),
    )
    .filter((a) => {
      if (
        !a.limits?.windows.length ||
        a.limits.unavailable?.reason === "unsupported" ||
        drivers.has(a.driver)
      )
        return false;
      drivers.add(a.driver);
      return true;
    })
    .slice(0, 3)
    .map((a) => a.id);
}
export function quotaWindow(
  account: QuotaAccount,
  preferences: QuotaPreferences,
): ServerProviderUsageWindow | null {
  if (account.limits?.unavailable?.reason === "unsupported") return null;
  const wanted = preferences.windows[account.id];
  if (wanted) return account.limits?.windows.find((w) => `${w.kind}:${w.id}` === wanted) ?? null;
  return (
    account.limits?.windows.find((w) => w.kind === "weekly") ?? account.limits?.windows[0] ?? null
  );
}
export function quotaState(
  account: QuotaAccount,
  window: ServerProviderUsageWindow | null,
  now: number,
) {
  if (!window || !Number.isFinite(window.usedPercent))
    return { remaining: null, state: "unknown" as const };
  const checked = Date.parse(account.limits?.checkedAt ?? "");
  const reset = Date.parse(window.resetsAt ?? "");
  if (Number.isFinite(reset) && reset <= now)
    return { remaining: Math.round(100 - window.usedPercent), state: "reset" as const };
  const stale =
    !account.connected ||
    account.failed ||
    !Number.isFinite(checked) ||
    now - checked > 10 * 60_000;
  return {
    remaining: Math.round(100 - Math.max(0, Math.min(100, window.usedPercent))),
    state: stale ? ("stale" as const) : ("current" as const),
  };
}
