import { useState } from "react";
import type {
  EnvironmentId,
  ThreadId,
  ServerProvider,
  OrchestrationV2Subagent,
} from "@t3tools/contracts";
import { deriveThreadTurnSubagents } from "@t3tools/client-runtime/state/thread-subagents";
import { collectProviderUsageLimits, remainingPercent } from "@t3tools/shared/usageLimits";
import { useQuietThreadProjection, useThreadShell } from "../../state/entities";
import { taskProgressSnapshot } from "../../taskProgress";
import { TaskProgressSteps } from "./TaskProgressSteps";
import { useEnvironment, useEnvironmentProviders } from "../../state/environments";
import { uiText } from "~/i18n";
import { accountAlias, executionSnapshot, quotaSnapshot } from "./runInspectorModel";
import { Button } from "../ui/button";
import { useNowMinute } from "../../hooks/useNowMinute";

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
      {quota.windows.map((window) => (
        <p key={window.id ?? `${window.kind}:${window.label}`}>
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
    useQuietThreadProjection(
      task.childThreadId ? { environmentId, threadId: task.childThreadId } : null,
    )?.projection ?? null;
  const actual = executionSnapshot(child);
  const provider = providers.find(
    (provider) => provider.instanceId === (actual?.instanceId ?? task.providerInstanceId),
  );
  return (
    <li className="space-y-1 border-b border-border/60 py-2.5 last:border-b-0">
      <p className="wrap-anywhere font-medium">{task.title || task.id}</p>
      <p>
        {uiText(task.status)} ·{" "}
        {task.origin === "app_owned" ? uiText("Delegated task") : uiText("Native subtask")}
      </p>
      <details className="text-muted-foreground">
        <summary className="cursor-pointer rounded-sm text-3xs outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {uiText("Model and account")}
        </summary>
        <div className="mt-1.5 space-y-1">
          <p>
            {uiText("Account alias")}:{" "}
            {accountAlias(provider?.displayName) ?? uiText("Not reported")}
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
        </div>
      </details>
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
  const structure = useQuietThreadProjection({ environmentId, threadId })?.projection ?? null;
  const shell = useThreadShell({ environmentId, threadId });
  const environment = useEnvironment(environmentId);
  const progress = taskProgressSnapshot(
    structure,
    shell,
    environment?.connection.phase === "connected",
  );
  const providers = useEnvironmentProviders().get(environmentId) ?? [];
  const actual = executionSnapshot(structure);
  const provider = providers.find((provider) => provider.instanceId === actual?.instanceId);
  const minute = useNowMinute();
  const now = Date.parse(`${minute}:00.000Z`);
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
  const turnSubagents = structure ? deriveThreadTurnSubagents(structure) : null;
  const tasks = turnSubagents?.subagents ?? [];
  const effort = actual?.options.filter((option) =>
    ["reasoningEffort", "effort", "reasoning", "variant", "reasoning_effort"].includes(option.id),
  );
  return (
    <section aria-label={uiText("Run")} className="space-y-4 p-4 text-xs">
      <TaskProgressSteps key={`${environmentId}:${threadId}`} progress={progress} />
      {tasks.length > 0 ? (
        <div className="space-y-2">
          <h3 className="font-medium">
            {uiText("Subtasks")} ({tasks.length})
          </h3>
          {turnSubagents ? (
            <p className="text-3xs text-muted-foreground">
              {!turnSubagents.latestTurn ? `${uiText("Includes earlier turns")} · ` : ""}
              {uiText("{running} active · {settled} ended", {
                running: turnSubagents.liveCount,
                settled: turnSubagents.settledCount,
              })}
            </p>
          ) : null}
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
          {tasks.length > visible ? (
            <Button variant="ghost" size="sm" onClick={() => setVisible(visible + 30)}>
              {uiText("Show more")}
            </Button>
          ) : null}
        </div>
      ) : null}
      <details className="group border-t border-border pt-3">
        <summary className="cursor-pointer rounded-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          {uiText("Execution details")}
        </summary>
        <div className="mt-3 space-y-4">
          <div className="space-y-2">
            <h3 className="font-medium">{uiText("Current execution")}</h3>
            <p>
              {uiText("Account alias")}:{" "}
              {accountAlias(provider?.displayName) ?? uiText("Not reported")}
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
        </div>
      </details>
    </section>
  );
}
