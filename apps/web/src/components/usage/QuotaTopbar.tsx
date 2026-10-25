import { useAtomValue } from "@effect/atom-react";
import { AuthProvidersManageScope } from "@t3tools/contracts";
import { refreshUsageLimits } from "@t3tools/client-runtime/state/usage";
import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  GaugeIcon,
  RefreshCwIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { readUiLocale } from "~/i18n";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { environmentPresentations } from "../../state/presentation";
import { serverEnvironment } from "../../state/server";
import { readEnvironmentScope } from "../../state/session";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  DEFAULT_QUOTA_PREFERENCES,
  QUOTA_PREFERENCES_KEY,
  QuotaPreferencesSchema,
  quotaAccounts,
  quotaPins,
  quotaState,
  quotaWindow,
  type QuotaAccount,
  type QuotaPreferences,
} from "./quotaTopbarModel";
import styles from "./quotaTopbar.module.css";

const text = (zh: string, en: string) => (readUiLocale() === "zh-CN" ? zh : en);
function windowName(window: NonNullable<ReturnType<typeof quotaWindow>>, compact = false) {
  if (window.id === "3p-weekly") return text("Claude/GPT 共享周", "Claude/GPT shared · wk");
  if (window.kind === "weekly" && /^(weekly|week)$/i.test(window.label))
    return text(compact ? "周" : "本周", compact ? "wk" : "Weekly");
  if (window.kind === "monthly" && /^(monthly|month)$/i.test(window.label))
    return text(compact ? "月" : "本月", compact ? "mo" : "Monthly");
  if (
    window.kind === "session" &&
    window.windowDurationMins &&
    /^(session|5h|5 hours?|five hour)$/i.test(window.label)
  )
    return `${window.windowDurationMins / 60}h`;
  return window.label;
}
function stateLabel(state: ReturnType<typeof quotaState>["state"]) {
  return state === "unknown"
    ? text("暂不可读", "Unavailable")
    : state === "reset"
      ? text("待刷新", "Refresh due")
      : state === "stale"
        ? text("上次", "Cached")
        : "";
}
function resetLabel(window: ReturnType<typeof quotaWindow>, now: number) {
  const reset = Date.parse(window?.resetsAt ?? "");
  if (!Number.isFinite(reset) || reset <= now) return "";
  const mins = Math.ceil((reset - now) / 60_000);
  const duration =
    mins >= 1440
      ? text(
          `${Math.floor(mins / 1440)}天${Math.floor((mins % 1440) / 60)}小时`,
          `${Math.floor(mins / 1440)}d ${Math.floor((mins % 1440) / 60)}h`,
        )
      : mins >= 60
        ? text(
            `${Math.floor(mins / 60)}小时${mins % 60}分`,
            `${Math.floor(mins / 60)}h ${mins % 60}m`,
          )
        : text(`${mins}分钟`, `${mins}m`);
  return text(`${duration}后重置`, `Resets in ${duration}`);
}
function QuotaIcon({
  account,
  remaining,
  dim = false,
  compact = false,
}: {
  readonly account: QuotaAccount;
  readonly remaining: number | null;
  readonly dim?: boolean;
  readonly compact?: boolean;
}) {
  return (
    <span
      className={styles["quota-ring"]}
      data-dim={dim || undefined}
      data-compact={compact || undefined}
      data-driver={account.driver}
      aria-hidden={compact || undefined}
      style={{ "--quota-progress": `${remaining ?? 0}%` } as CSSProperties}
    >
      {!compact ? (
        <ProviderInstanceIcon
          driverKind={account.driver}
          displayName={account.label}
          className="size-5"
          iconClassName="size-3.5"
        />
      ) : (
        <span />
      )}
    </span>
  );
}
export function QuotaTopbarView({
  accounts,
  now,
  preferences,
  onPreferences,
  onRefresh,
  refreshing = false,
  onUsage,
}: {
  readonly accounts: readonly QuotaAccount[];
  readonly now: number;
  readonly preferences: QuotaPreferences;
  readonly onPreferences: (preferences: QuotaPreferences) => void;
  readonly onRefresh: (automatic: boolean) => void;
  readonly refreshing?: boolean;
  readonly onUsage: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"overview" | "all" | "settings">("overview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const pins = quotaPins(preferences, accounts);
  const selected = pins.flatMap((id) => accounts.find((a) => a.id === id) ?? []);
  const update = (patch: Partial<QuotaPreferences>) =>
    onPreferences({ ...preferences, pins, ...patch });
  const choose = (id: string, checked: boolean) => {
    if (checked && pins.length >= 4) {
      setFeedback(text("最多常显四项，请先取消一项。", "Unpin an item before adding a fifth."));
      return;
    }
    setFeedback("");
    update({ pins: checked ? [...pins, id] : pins.filter((pin) => pin !== id) });
  };
  const move = (id: string, delta: number) => {
    const next = [...pins],
      index = next.indexOf(id),
      target = index + delta;
    if (index < 0 || target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    update({ pins: next });
  };
  const show = (id: string | null) => {
    setView("overview");
    setExpanded(id);
    setOpen(true);
    onRefresh(true);
  };
  const title = text("额度", "Quotas");
  const displayAccounts = view === "all" ? accounts : selected;
  const selectedWindows = selected.map((account) => quotaWindow(account, preferences));
  const windowLabels = [
    ...new Set(selectedWindows.flatMap((window) => (window ? [windowName(window)] : []))),
  ];
  const sharedWindow = windowLabels.length === 1 ? windowLabels[0] : null;
  const remainingLabel = sharedWindow
    ? text(`${sharedWindow}剩余`, `${sharedWindow} remaining`)
    : text("剩余额度", "Remaining quota");
  return (
    <div className={styles["quota-topbar"]} data-quota-topbar="" data-names={preferences.showNames}>
      <button type="button" className={styles["quota-summary"]} onClick={() => show(null)}>
        {remainingLabel}
      </button>
      <div className={styles["quota-chips"]}>
        {selected.map((account) => {
          const window = quotaWindow(account, preferences),
            status = quotaState(account, window, now);
          const checkedAt = Date.parse(account.limits?.checkedAt ?? "");
          const readTime =
            status.state === "stale" && Number.isFinite(checkedAt)
              ? ` ${new Date(checkedAt).toLocaleTimeString(readUiLocale(), { hour: "2-digit", minute: "2-digit" })}`
              : "";
          const label = `${account.label} · ${account.alias} · ${window ? windowName(window) : ""} · ${stateLabel(status.state)}${readTime} ${status.remaining === null ? "—" : `${status.remaining}%`}`;
          return (
            <Tooltip key={account.id}>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    className={styles["quota-chip"]}
                    data-quota-id={account.id}
                    data-low={
                      (status.state === "current" && (status.remaining ?? 100) <= 20) || undefined
                    }
                    data-stale={status.state !== "current" || undefined}
                    aria-label={label}
                    aria-expanded={open && expanded === account.id}
                    onClick={() => show(account.id)}
                  />
                }
              >
                <QuotaIcon
                  account={account}
                  remaining={status.remaining}
                  dim={status.state !== "current"}
                  compact
                />
                {preferences.showNames ? (
                  <span className={styles["quota-chip-name"]} data-quota-name="">
                    {account.label}
                  </span>
                ) : null}
                <span className={styles["quota-chip-value"]}>
                  {status.remaining === null ? "—" : `${status.remaining}%`}
                </span>
                {!sharedWindow && window ? (
                  <span className={styles["quota-chip-window"]}>{windowName(window, true)}</span>
                ) : null}
                {/* A cached reading is only dimmed here; its read time lives in the tooltip and panel. */}
                {status.state === "unknown" || status.state === "reset" ? (
                  <span className={styles["quota-chip-status"]}>{stateLabel(status.state)}</span>
                ) : null}
              </TooltipTrigger>
              <TooltipPopup side="bottom">{label}</TooltipPopup>
            </Tooltip>
          );
        })}
      </div>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setView("overview");
            setFeedback("");
            onRefresh(true);
          }
        }}
      >
        <PopoverTrigger
          render={
            <Button
              variant="ghost-muted"
              size="icon"
              aria-label={text("查看额度", "View quotas")}
            />
          }
        >
          {pins.length ? <ChevronDownIcon /> : <GaugeIcon />}
        </PopoverTrigger>
        <PopoverPopup
          data-liquid-quota-popup=""
          align="end"
          width="lg"
          padding="default"
          keepMounted
          touchBackdrop
        >
          <div className={styles["quota-panel"]}>
            <div className={styles["quota-panel-heading"]}>
              {view !== "overview" ? (
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  aria-label={text("返回额度", "Back to quotas")}
                  onClick={() => {
                    setView("overview");
                    setFeedback("");
                  }}
                >
                  <ArrowLeftIcon />
                </Button>
              ) : null}
              <div className={styles["quota-heading-copy"]}>
                <PopoverTitle>
                  {view === "settings"
                    ? text("常显设置", "Pinned quotas")
                    : view === "all"
                      ? text("全部额度", "All quotas")
                      : title}
                </PopoverTitle>
                <p>
                  {view === "settings"
                    ? text("选择账号、额度窗口与顺序", "Choose accounts, windows and order")
                    : text("百分比表示剩余 · 沿用现有数据源", "Percentages show remaining quota")}
                </p>
              </div>
              {view === "settings" ? (
                <span className={styles["quota-counter"]}>{pins.length} / 4</span>
              ) : (
                <Button
                  variant="ghost-muted"
                  size="icon-sm"
                  disabled={refreshing}
                  aria-label={text("刷新额度", "Refresh quotas")}
                  onClick={() => onRefresh(false)}
                >
                  <RefreshCwIcon />
                </Button>
              )}
            </div>
            {view === "settings" ? (
              <>
                <div className={styles["quota-list"]}>
                  {[...selected, ...accounts.filter((a) => !pins.includes(a.id))].map((account) => {
                    const checked = pins.includes(account.id),
                      index = pins.indexOf(account.id),
                      window = quotaWindow(account, preferences);
                    return (
                      <div className={styles["quota-pick"]} key={account.id}>
                        <Checkbox
                          id={`quota-pin-${account.id}`}
                          checked={checked}
                          onCheckedChange={(value) => choose(account.id, value)}
                        />
                        <div className={styles["quota-pick-content"]}>
                          <label htmlFor={`quota-pin-${account.id}`}>
                            <span className="sr-only">{text("常显 ", "Pin ")}</span>
                            <QuotaIcon account={account} remaining={null} />
                            <span>
                              <strong>{account.label}</strong>
                              <small>
                                {text("账号 ", "Account ")}
                                {account.alias}
                              </small>
                            </span>
                          </label>
                          {checked && account.limits?.windows.length ? (
                            <select
                              aria-label={
                                text("额度窗口 ", "Quota window ") +
                                account.label +
                                " · " +
                                account.alias
                              }
                              value={window ? `${window.kind}:${window.id}` : "missing"}
                              onChange={(event) =>
                                update({
                                  windows: {
                                    ...preferences.windows,
                                    [account.id]: event.target.value,
                                  },
                                })
                              }
                            >
                              {!window ? (
                                <option value="missing" disabled>
                                  {text("原窗口暂不可用", "Previous window unavailable")}
                                </option>
                              ) : null}
                              {account.limits.windows.map((w) => (
                                <option key={`${w.kind}:${w.id}`} value={`${w.kind}:${w.id}`}>
                                  {windowName(w)} · {Math.round(100 - w.usedPercent)}%
                                </option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                        {checked ? (
                          <div className={styles["quota-order"]}>
                            <Button
                              variant="ghost-muted"
                              size="icon-xs"
                              disabled={index === 0}
                              aria-label={
                                text("上移 ", "Move up ") + account.label + " · " + account.alias
                              }
                              onClick={() => move(account.id, -1)}
                            >
                              <ArrowUpIcon />
                            </Button>
                            <Button
                              variant="ghost-muted"
                              size="icon-xs"
                              disabled={index === pins.length - 1}
                              aria-label={
                                text("下移 ", "Move down ") + account.label + " · " + account.alias
                              }
                              onClick={() => move(account.id, 1)}
                            >
                              <ArrowDownIcon />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {pins
                    .filter((id) => !accounts.some((a) => a.id === id))
                    .map((id) => (
                      <div className={styles["quota-missing"]} key={id}>
                        <span>{text("已置顶的账号暂不可用", "Pinned account unavailable")}</span>
                        <Button variant="ghost-muted" size="xs" onClick={() => choose(id, false)}>
                          {text("取消常显", "Unpin")}
                        </Button>
                      </div>
                    ))}
                  {!accounts.length ? (
                    <p className={styles["quota-empty"]}>
                      {text(
                        "连接环境后，可选择已接入的账号。",
                        "Connect an environment to choose accounts.",
                      )}
                    </p>
                  ) : null}
                </div>
                <div className={styles["quota-name-setting"]}>
                  <label htmlFor="quota-show-names">
                    {text("显示软件名称", "Show provider names")}
                  </label>
                  <Switch
                    id="quota-show-names"
                    size="sm"
                    checked={preferences.showNames}
                    onCheckedChange={(value) => update({ showNames: value })}
                  />
                </div>
                <div className={styles["quota-panel-footer"]}>
                  <span>{text("仅保存到此设备", "Saved on this device")}</span>
                  <Button size="sm" onClick={() => setView("overview")}>
                    {text("完成", "Done")}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className={styles["quota-list"]}>
                  {displayAccounts.map((account) => {
                    const window = quotaWindow(account, preferences),
                      status = quotaState(account, window, now),
                      isExpanded = expanded === account.id;
                    const checked = Date.parse(account.limits?.checkedAt ?? "");
                    const stamp = Number.isFinite(checked)
                      ? new Date(checked).toLocaleString(readUiLocale(), {
                          month: "numeric",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : text("尚无快照", "No snapshot yet");
                    return (
                      <div className={styles["quota-account"]} key={account.id}>
                        <button
                          type="button"
                          className={styles["quota-account-row"]}
                          aria-expanded={isExpanded}
                          aria-label={`${account.label} · ${account.alias} ${text("额度详情", "quota details")}`}
                          onClick={() => setExpanded(isExpanded ? null : account.id)}
                        >
                          <QuotaIcon
                            account={account}
                            remaining={status.remaining}
                            dim={status.state !== "current"}
                          />
                          <span className={styles["quota-identity"]}>
                            <strong>{account.label}</strong>
                            <small>
                              {text("账号 ", "Account ")}
                              {account.alias}
                            </small>
                          </span>
                          <span
                            className={styles["quota-numbers"]}
                            data-low={
                              (status.state === "current" && (status.remaining ?? 100) <= 20) ||
                              undefined
                            }
                          >
                            <strong>
                              {status.remaining === null
                                ? stateLabel(status.state)
                                : `${status.remaining}%`}
                            </strong>
                            <small>
                              {status.state === "stale" ? text("上次读数 · ", "Cached · ") : ""}
                              {status.state === "reset"
                                ? stateLabel(status.state)
                                : window
                                  ? `${windowName(window)} · ${resetLabel(window, now)}`
                                  : account.limits?.unavailable?.reason === "unsupported"
                                    ? text(
                                        "此通道未提供额度接口",
                                        "No quota interface for this channel",
                                      )
                                    : text("没有可核验的额度", "No verified quota available")}
                            </small>
                          </span>
                        </button>
                        {isExpanded ? (
                          <div className={styles["quota-detail"]}>
                            {account.limits?.unavailable?.reason !== "unsupported"
                              ? account.limits?.windows.map((w) => (
                                  <div className={styles["quota-window"]} key={`${w.kind}:${w.id}`}>
                                    <span>{windowName(w)}</span>
                                    <span className={styles["quota-track"]}>
                                      <i
                                        style={{
                                          width: `${Math.max(0, Math.min(100, 100 - w.usedPercent))}%`,
                                        }}
                                      />
                                    </span>
                                    <b>{Math.round(100 - w.usedPercent)}%</b>
                                  </div>
                                ))
                              : null}
                            <p>
                              {text("更新于 ", "Updated ")}
                              {stamp}
                              {!account.connected
                                ? text(" · 环境离线", " · Offline")
                                : account.failed
                                  ? text(
                                      " · 本次读取失败，保留快照",
                                      " · Probe failed; showing cached data",
                                    )
                                  : ""}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                  {!displayAccounts.length ? (
                    <p className={styles["quota-empty"]}>
                      {accounts.length
                        ? text(
                            "还没有常显项，在设置中选择。",
                            "Choose pinned accounts in settings.",
                          )
                        : text(
                            "尚无可用额度来源。连接或刷新后再查看。",
                            "No quota sources yet. Connect or refresh to check.",
                          )}
                    </p>
                  ) : null}
                </div>
                <div className={styles["quota-panel-footer"]}>
                  <Button variant="ghost-muted" size="xs" onClick={() => setView("settings")}>
                    <SlidersHorizontalIcon />
                    {text("常显设置", "Customize")}
                  </Button>
                  <Button
                    variant="ghost-muted"
                    size="xs"
                    onClick={() => setView(view === "all" ? "overview" : "all")}
                  >
                    {view === "all"
                      ? text("返回常用", "Pinned")
                      : text(`全部 ${accounts.length} 个来源`, `All ${accounts.length} sources`)}
                  </Button>
                </div>
                <div className={styles["quota-usage-link"]}>
                  <Button
                    variant="ghost-muted"
                    size="xs"
                    onClick={() => {
                      setOpen(false);
                      onUsage();
                    }}
                  >
                    {text("完整用量与费用", "Full usage and costs")}
                  </Button>
                </div>
              </>
            )}
            {feedback ? (
              <p className={styles["quota-feedback"]} role="status">
                {feedback}
              </p>
            ) : null}
          </div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
export function QuotaTopbar() {
  const presentations = useAtomValue(environmentPresentations.presentationsWithProvidersAtom);
  const [preferences, setPreferences] = useLocalStorage(
    QUOTA_PREFERENCES_KEY,
    DEFAULT_QUOTA_PREFERENCES,
    QuotaPreferencesSchema,
  );
  const [now, setNow] = useState(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const navigate = useNavigate();
  useEffect(() => {
    // Only the age labels advance; the top bar never schedules provider probes.
    const advance = () => {
      if (!document.hidden) setNow(Date.now());
    };
    const timer = window.setInterval(advance, 60_000);
    document.addEventListener("visibilitychange", advance);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", advance);
    };
  }, []);
  const refresh = async (automatic: boolean) => {
    if (refreshing) return;
    setRefreshing(true);
    setFailed(false);
    try {
      const results = await Promise.all(
        [...presentations].map(([environmentId, p]) => {
          if (
            p.connection.phase !== "connected" ||
            !readEnvironmentScope(environmentId, AuthProvidersManageScope)
          )
            return;
          return refreshUsageLimits(
            environmentId,
            () => refreshProviders({ environmentId, input: {} }),
            automatic,
          );
        }),
      );
      if (results.some((result) => result?._tag === "Failure")) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setNow(Date.now());
      setRefreshing(false);
    }
  };
  return (
    <div className={styles["quota-topbar-host"]}>
      <QuotaTopbarView
        accounts={quotaAccounts(presentations)}
        now={now}
        preferences={preferences}
        onPreferences={setPreferences}
        onRefresh={(automatic) => void refresh(automatic)}
        refreshing={refreshing}
        onUsage={() => void navigate({ to: "/usage" })}
      />
      {failed ? (
        <span className="sr-only" role="status">
          {text("额度刷新失败，保留已有记录。", "Quota refresh failed; keeping previous data.")}
        </span>
      ) : null}
    </div>
  );
}
