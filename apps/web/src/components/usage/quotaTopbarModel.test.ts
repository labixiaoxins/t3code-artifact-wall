import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  DEFAULT_QUOTA_PREFERENCES,
  quotaAccounts,
  quotaPins,
  quotaState,
  quotaWindow,
} from "./quotaTopbarModel";

const now = Date.parse("2026-10-24T12:00:00Z");
function provider(overrides: Partial<ServerProvider> = {}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make("codex"),
    driver: ProviderDriverKind.make("codex"),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated", email: "private@example.invalid" },
    checkedAt: new Date(now).toISOString(),
    models: [],
    slashCommands: [],
    skills: [],
    usageLimits: {
      checkedAt: new Date(now).toISOString(),
      windows: [
        {
          id: "primary",
          kind: "session",
          label: "5h",
          usedPercent: 28,
          resetsAt: new Date(now + 3600000).toISOString(),
          windowDurationMins: 300,
        },
        {
          id: "secondary",
          kind: "weekly",
          label: "Week",
          usedPercent: 38,
          resetsAt: new Date(now + 86400000).toISOString(),
        },
      ],
    },
    ...overrides,
  };
}
function present(providers: readonly ServerProvider[], phase = "connected", environment = "env") {
  return new Map([
    [
      EnvironmentId.make(environment),
      { entry: { target: { label: "Test" } }, connection: { phase }, serverConfig: { providers } },
    ],
  ]);
}
describe("quota topbar data", () => {
  it("does not hide an unreadable workspace behind another workspace on the same email", () => {
    const accounts = quotaAccounts(
      present([
        provider({
          instanceId: ProviderInstanceId.make("one"),
          auth: { status: "authenticated", email: "same@example.invalid", workspaceId: "one" },
        }),
        provider({
          instanceId: ProviderInstanceId.make("two"),
          auth: { status: "authenticated", email: "same@example.invalid", workspaceId: "two" },
          usageLimits: undefined,
        }),
      ]),
    );
    expect(accounts).toHaveLength(2);
    expect(accounts.filter((a) => !a.limits)).toHaveLength(1);
  });
  it("merges the same subscription across environments without exposing account identifiers", () => {
    const accounts = quotaAccounts(
      new Map([
        ...present([provider()], "connected", "a"),
        ...present([provider()], "connected", "b"),
      ]),
    );
    expect(accounts).toHaveLength(1);
    expect(JSON.stringify(accounts)).not.toContain("private@example.invalid");
    expect(quotaPins(DEFAULT_QUOTA_PREFERENCES, accounts)).toEqual([accounts[0]!.id]);
  });
  it("keeps separate accounts and workspaces", () => {
    const accounts = quotaAccounts(
      present([
        provider({
          instanceId: ProviderInstanceId.make("one"),
          auth: { status: "authenticated", email: "same@example.invalid", workspaceId: "one" },
        }),
        provider({
          instanceId: ProviderInstanceId.make("two"),
          auth: { status: "authenticated", email: "same@example.invalid", workspaceId: "two" },
        }),
      ]),
    );
    expect(accounts).toHaveLength(2);
    expect(new Set(accounts.map((a) => a.id)).size).toBe(2);
  });
  it("preserves selected windows and never silently substitutes a missing window", () => {
    const a = quotaAccounts(present([provider()]))[0]!;
    expect(quotaWindow(a, DEFAULT_QUOTA_PREFERENCES)?.kind).toBe("weekly");
    expect(
      quotaWindow(a, { ...DEFAULT_QUOTA_PREFERENCES, windows: { [a.id]: "session:primary" } })
        ?.usedPercent,
    ).toBe(28);
    expect(
      quotaWindow(a, { ...DEFAULT_QUOTA_PREFERENCES, windows: { [a.id]: "weekly:removed" } }),
    ).toBeNull();
  });
  it("keeps cached windows after probe failure, but clears unsupported quotas", () => {
    const base = provider();
    const a = quotaAccounts(
      present([
        { ...base, usageLimits: { ...base.usageLimits!, unavailable: { reason: "probeFailed" } } },
      ]),
    )[0]!;
    expect(a.failed).toBe(true);
    expect(quotaState(a, quotaWindow(a, DEFAULT_QUOTA_PREFERENCES), now)).toEqual({
      remaining: 62,
      state: "stale",
    });
    const unsupported = quotaAccounts(
      present([
        { ...base, usageLimits: { ...base.usageLimits!, unavailable: { reason: "unsupported" } } },
      ]),
    )[0]!;
    expect(
      quotaState(unsupported, quotaWindow(unsupported, DEFAULT_QUOTA_PREFERENCES), now),
    ).toEqual({ remaining: null, state: "unknown" });
  });
  it("labels offline and old snapshots without inventing a balance", () => {
    const a = quotaAccounts(present([provider()], "disconnected"))[0]!;
    expect(quotaState(a, quotaWindow(a, DEFAULT_QUOTA_PREFERENCES), now).state).toBe("stale");
    const live = { ...a, connected: true };
    expect(quotaState(live, quotaWindow(live, DEFAULT_QUOTA_PREFERENCES), now + 660000).state).toBe(
      "stale",
    );
  });
  it("keeps expired values marked refresh-due instead of resetting to 100", () => {
    const a = quotaAccounts(present([provider()]))[0]!;
    const w = {
      ...quotaWindow(a, DEFAULT_QUOTA_PREFERENCES)!,
      resetsAt: new Date(now - 1).toISOString(),
    };
    expect(quotaState(a, w, now)).toEqual({ remaining: 62, state: "reset" });
  });
  it("keeps explicit empty pins and does not replace a temporarily missing pinned account", () => {
    const a = quotaAccounts(present([provider()]));
    expect(quotaPins({ ...DEFAULT_QUOTA_PREFERENCES, pins: [] }, a)).toEqual([]);
    expect(
      quotaPins({ ...DEFAULT_QUOTA_PREFERENCES, pins: ["gone", "gone", "a", "b", "c", "d"] }, a),
    ).toEqual(["gone", "a", "b", "c"]);
  });
  it("includes unreadable enabled channels and excludes disabled ones", () => {
    const accounts = quotaAccounts(
      present([
        provider({ usageLimits: undefined }),
        provider({ instanceId: ProviderInstanceId.make("disabled"), enabled: false }),
      ]),
    );
    expect(accounts).toHaveLength(1);
    expect(quotaState(accounts[0]!, null, now)).toEqual({ remaining: null, state: "unknown" });
  });
});
