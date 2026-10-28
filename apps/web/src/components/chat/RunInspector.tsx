import { useEffect, useState } from "react";
import type {
  EnvironmentId,
  ThreadId,
  ServerProvider,
  OrchestrationV2Subagent,
} from "@t3tools/contracts";
import { collectProviderUsageLimits, remainingPercent } from "@t3tools/shared/usageLimits";
import { useThreadProjection } from "../../state/entities";
import { useEnvironment, useEnvironmentProviders } from "../../state/environments";
import { uiText } from "~/i18n";
import { accountAlias, executionSnapshot, quotaSnapshot } from "./runInspectorModel";
import { Button } from "../ui/button";

export function RunQuota({
  limits,
  connected,
  now,
}: {
  limits: ServerProvider["usageLimits"];
  connected: boolean;
  now: number;
}) {
  const quota = quotaSnapshot(limits, connected, now);
  return (
    <div className="space-y-1">
      {quota.stale || quota.windows.length === 0 ? <p>{uiText("Temporarily unreadable")}</p> : null}
      {quota.checkedAt ? (
        <p className="text-muted-foreground">
          {uiText("Last checked")}: {new Date(quota.checkedAt).toLocaleString()}
        </p>
      ) : null}
      {quota.windows.map((window, index) => (
        <p key={index}>
          {quota.stale ? `${uiText("Last known")} · ` : ""}
          {window.label ?? window.id}:{" "}
          {uiText("{percent}% remaining", { percent: remainingPercent(window) })}
        </p>
      ))}
    </div>
  );
}

function Subtask({
  task,
  environmentId,
  providers,
}: {
  task: OrchestrationV2Subagent;
  environmentId: EnvironmentId;
  providers: readonly ServerProvider[];
}) {
  const child =
    useThreadProjection(task.childThreadId ? { environmentId, threadId: task.childThreadId } : null)
      ?.projection ?? null;
  const actual = executionSnapshot(child);
  const provider = providers.find(
    (provider) => provider.instanceId === (actual?.instanceId ?? task.providerInstanceId),
  );
  return (
    <li className="space-y-1 rounded-md border p-2">
      <p className="break-words font-medium">{task.title || task.id}</p>
      <p>
        {uiText(task.status)} ·{" "}
        {task.origin === "app_owned" ? uiText("Delegated task") : uiText("Native subtask")}
      </p>
      <p>
        {uiText("Account alias")}: {accountAlias(provider?.displayName) ?? uiText("Not reported")}
      </p>
      <p className="break-all">
        {uiText("Reported model")}:{" "}
        {actual?.model ??
          (task.origin === "provider_native" ? task.model : null) ??
          uiText("Not reported")}
      </p>
      {!actual?.model && task.modelSelection ? (
        <p className="break-all text-muted-foreground">
          {uiText("Requested model")}: {task.modelSelection.model}
        </p>
      ) : null}
    </li>
  );
}

export function RunInspector({
  environmentId,
  threadId,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
}) {
  const projection = useThreadProjection({ environmentId, threadId })?.projection ?? null;
  const environment = useEnvironment(environmentId);
  const providers = useEnvironmentProviders().get(environmentId) ?? [];
  const actual = executionSnapshot(projection);
  const provider = providers.find((provider) => provider.instanceId === actual?.instanceId);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const report = actual
    ? collectProviderUsageLimits(
        actual.instanceId,
        providers,
        environment?.serverConfig?.usageLimitSources ?? [],
        now,
      )
    : null;
  const limits =
    provider?.usageLimits ??
    report?.accounts.find((account) => account.instanceId === actual?.instanceId)?.limits;
  const [visible, setVisible] = useState(30);
  const tasks = projection?.subagents ?? [];
  const effort = actual?.options.filter((option) =>
    ["reasoningEffort", "effort", "reasoning", "variant", "reasoning_effort"].includes(option.id),
  );
  return (
    <section aria-label={uiText("Run")} className="space-y-4 p-4 text-xs">
      <div className="space-y-2">
        <h3 className="font-medium">{uiText("Current execution")}</h3>
        <p>
          {uiText("Account alias")}: {accountAlias(provider?.displayName) ?? uiText("Not reported")}
        </p>
        <p className="break-all">
          {uiText("Reported model")}: {actual?.model ?? uiText("Not reported")}
        </p>
        <p>
          {uiText("Reasoning level")}:{" "}
          {effort?.length
            ? effort.map((option) => String(option.value)).join(" / ")
            : uiText("Not reported")}
        </p>
        {actual?.requested ? (
          <p className="break-all text-muted-foreground">
            {uiText("Requested model")}: {actual.requested.model}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">{uiText("Usage limits")}</h3>
        <RunQuota
          limits={limits}
          connected={environment?.connection.phase === "connected"}
          now={now}
        />
      </div>
      <div className="space-y-2">
        <h3 className="font-medium">
          {uiText("Subtasks")} ({tasks.length})
        </h3>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground">{uiText("No subtasks reported")}</p>
        ) : (
          <ul className="space-y-2">
            {tasks.slice(0, visible).map((task) => (
              <Subtask
                key={task.id}
                task={task}
                environmentId={environmentId}
                providers={providers}
              />
            ))}
          </ul>
        )}
        {tasks.length > visible ? (
          <Button variant="ghost" size="sm" onClick={() => setVisible(visible + 30)}>
            {uiText("Show more")}
          </Button>
        ) : null}
      </div>
    </section>
  );
}
