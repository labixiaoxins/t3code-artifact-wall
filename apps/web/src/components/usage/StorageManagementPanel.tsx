import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { useState, useEffect, useRef } from "react";
import { useAtomValue, useAtomRefresh } from "@effect/atom-react";
import * as AsyncResult from "effect/reactivity/AsyncResult";
import * as Option from "effect/Option";
import type { EnvironmentId, StorageActionInput, StorageOperation } from "@t3tools/contracts";
import { Link } from "@tanstack/react-router";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { formatBytes } from "../../lib/formatBytes";
import { Button } from "../ui/button";

const phaseLabel: Record<string, string> = {
  planned: "等待确认",
  queued: "已提交，等待执行",
  started: "已开始",
  archiving: "正在归档",
  verifying: "正在校验",
  verified_source_kept: "已归档校验，原件仍保留",
  retirement_intent: "准备释放",
  releasing: "正在释放",
  restoring: "正在恢复",
  completed: "完成",
  cancelled: "已取消",
  failed: "失败，查看原因",
  locked: "状态待核对，已锁定",
  source_restored: "原路径已恢复，未继续释放",
};
const activePhases = new Set([
  "queued",
  "started",
  "archiving",
  "verifying",
  "retirement_intent",
  "releasing",
  "restoring",
]);

export function StorageManagementPanel({ environmentId }: { environmentId: EnvironmentId }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
          {open ? "收起整理工具" : "检查可整理项"}
        </Button>
        <Link to="/settings/storage" className="text-xs underline">
          存储规则与工作区位置
        </Link>
      </div>
      {!open ? (
        <p className="text-xs text-muted-foreground">
          检查只读。整理前显示具体范围；聊天、账号与有效回滚链继续保护。
        </p>
      ) : (
        <StorageManager environmentId={environmentId} />
      )}
    </div>
  );
}

function StorageManager({ environmentId }: { environmentId: EnvironmentId }) {
  const [objectId, setObjectId] = useState<string | undefined>();
  const [volumeId, setVolumeId] = useState("");
  const [plan, setPlan] = useState<StorageOperation | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [measureSizes, setMeasureSizes] = useState(false);
  const atom = serverEnvironment.inspectStorage({
    environmentId,
    input: { ...(objectId ? { objectId } : {}), measureSizes },
  });
  const result = useAtomValue(atom);
  const data = Option.getOrNull(AsyncResult.value(result));
  const refresh = useAtomRefresh(atom);
  const allowed = useAtomValue(serverEnvironment.manageStorage.permissionAtom(environmentId));
  const run = useAtomCommand(serverEnvironment.manageStorage, { reportFailure: false });
  const statusAtom = serverEnvironment.inspectStorage({
    environmentId,
    input: { statusOnly: true },
  });
  const statusResult = useAtomValue(statusAtom);
  const statusData = Option.getOrNull(AsyncResult.value(statusResult));
  const refreshStatus = useAtomRefresh(statusAtom);
  const operations = statusData?.operations ?? data?.operations ?? [];
  const submitted = submittedId !== null && !operations.some((op) => op.id === submittedId && op.phase !== "planned");
  const running = submitted || operations.some((op) => activePhases.has(op.phase));
  const finishedKey = operations
    .filter((op) => !activePhases.has(op.phase) && op.phase !== "planned")
    .map((op) => op.id + op.phase)
    .join("|");
  const previousFinished = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (previousFinished.current !== undefined && previousFinished.current !== finishedKey)
      refresh();
    previousFinished.current = finishedKey;
  }, [finishedKey, refresh, previousFinished]);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(refreshStatus, 3000);
    return () => window.clearInterval(timer);
  }, [running, refreshStatus]);
  const act = async (input: StorageActionInput) => {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const result = await run({ environmentId, input });
      if (result._tag === "Success") {
        if (input.action === "plan" || input.action === "restore-plan") setPlan(result.value);
        if (input.action === "execute") {
          setSubmittedId(result.value.id);
          setPlan(result.value);
        }
        if (input.action === "cancel") {
          setPlan(null);
          setSubmittedId(null);
        }
        refreshStatus();
      } else
        setError(
          "操作未被接受，请检查权限、空间或连接：" + String(squashAtomCommandFailure(result)),
        );
    } finally {
      setPending(false);
    }
  };
  if (data === null)
    return (
      <p role="status" className="text-sm">
        {result._tag === "Failure"
          ? "检查未完成：该环境暂不支持或连接失败，未执行清理。"
          : "正在只读检查…"}
      </p>
    );
  return (
    <section className="space-y-4 rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setObjectId(undefined);
            refreshStatus();
          }}
        >
          返回全部目录
        </Button>
        <Button size="sm" variant="ghost" onClick={refresh}>
          重新检查
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!!running}
          onClick={() => {
            setMeasureSizes(true);
            refresh();
          }}
        >
          测量本层大小
        </Button>
        <span className="text-xs text-muted-foreground">
          检查时间：{new Date(data.checkedAt).toLocaleString()} · 当前所选环境的磁盘
        </span>
      </div>
      {!allowed ? <p className="text-xs">当前连接只有查看权限，不能提交归档或恢复。</p> : null}
      <label className="block text-sm">
        归档/恢复目标卷{" "}
        <select
          value={volumeId}
          onChange={(event) => setVolumeId(event.target.value)}
          className="rounded-md border bg-background p-2"
        >
          <option value="">选择已挂载外置卷（HFS+/APFS）</option>
          {data.volumes.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name} · 剩余{formatBytes(v.freeBytes)}
            </option>
          ))}
        </select>
      </label>
      <p className="text-xs text-muted-foreground">
        “只归档”保留原件，不会腾出源占用。释放必须有完整的独有内容、运行状态和恢复引用审查；未知项继续保护。
      </p>
      <div className="max-h-80 overflow-auto">
        {data.entries.map((item) => (
          <div key={item.id} className="space-y-1 border-t py-3">
            <div className="text-sm font-medium">
              {item.name}
              {item.bytes != null ? " · " + formatBytes(item.bytes) : ""}
            </div>
            <div className="break-all text-xs text-muted-foreground">{item.path}</div>
            <p className="text-xs text-muted-foreground">{item.reason}</p>
            <div className="flex flex-wrap gap-2">
              <Button size="xs" variant="ghost" onClick={() => setObjectId(item.id)}>
                展开目录
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!allowed || pending || !volumeId || !!running}
                onClick={() =>
                  void act({ action: "plan", objectId: item.id, volumeId, mode: "archive-only" })
                }
              >
                预览归档副本计划
              </Button>
              {item.canRelease ? (
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!allowed || pending || !volumeId || !!running}
                  onClick={() =>
                    void act({
                      action: "plan",
                      objectId: item.id,
                      volumeId,
                      mode: "archive-and-release",
                    })
                  }
                >
                  预览归档并释放
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {data.entries.length === 0 ? (
          <p className="text-sm">本层没有可展开的任务目录；未生成释放候选。</p>
        ) : null}
      </div>
      {plan?.phase === "planned" ? (
        <div className="space-y-2 rounded-md border p-3" role="region" aria-label="确认整理计划">
          <h4 className="text-sm font-medium">确认具体计划</h4>
          {plan.warnings?.map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}
          <p className="break-all text-xs">
            {plan.source ? "源：" + plan.source : "归档恢复至：" + plan.destination}
          </p>
          {plan.archive ? <p className="break-all text-xs">归档：{plan.archive}</p> : null}
          <p className="text-xs">
            展开预算：{formatBytes(plan.sourceBytes)}。
            {plan.release
              ? "内容校验及索引落盘后释放所选源。"
              : plan.type === "restore"
                ? "仅写新目录，不覆盖现有资料；按目标卷核验恢复容量。"
                : "仅归档，原件保持不变。"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={pending || !allowed}
              onClick={() => void act({ action: "execute", planId: plan.id })}
            >
              {plan.type === "restore"
                ? "确认恢复至新目录"
                : plan.release
                  ? "确认归档并释放"
                  : "确认只归档"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void act({ action: "cancel", planId: plan.id })}
            >
              取消计划
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="break-all text-sm">
          {error}
        </p>
      ) : null}
      <details>
        <summary className="cursor-pointer text-sm">
          本机归档索引与恢复（{data.archives.length}项）
        </summary>
        <input
          aria-label="筛选归档"
          placeholder="按名称或原路径筛选"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="my-2 w-full rounded-md border bg-background p-2 text-sm"
        />
        <div className="max-h-80 overflow-auto">
          {data.archives
            .filter((a) =>
              (a.name + " " + a.source).toLocaleLowerCase().includes(filter.toLocaleLowerCase()),
            )
            .map((a) => (
              <div key={a.id} className="space-y-1 border-t py-3">
                <div className="text-sm">
                  {a.name} · {a.online ? "归档在线" : "外盘离线"}
                </div>
                <p className="break-all text-xs text-muted-foreground">{a.path}</p>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={!a.online || !a.restorable || pending || !allowed || !!running}
                  onClick={() =>
                    void act({
                      action: "restore-plan",
                      objectId: a.id,
                      ...(volumeId ? { volumeId } : {}),
                    })
                  }
                >
                  {a.restorable ? "预览恢复至新目录" : "原路径链接，按索引读取"}
                </Button>
              </div>
            ))}
        </div>
      </details>
      <details open={!!running}>
        <summary className="cursor-pointer text-sm">操作记录（{operations.length}）</summary>
        {operations.map((op) => (
          <div key={op.id} className="space-y-1 border-t py-3 text-xs">
            <p>
              {phaseLabel[op.phase] ?? op.phase} · {op.createdAt}
              {op.cancelRequested ? " · 已请求停止后续步骤" : ""}
            </p>
            <p className="break-all">{op.source ?? op.destination ?? op.archive}</p>
            {op.held ? <p className="break-all">保全目录：{op.held}</p> : null}
            {op.error ? <p role="alert">{op.error}</p> : null}
            {op.freeAfter !== undefined && op.freeBefore !== undefined ? (
              <p>
                观察到内盘余量净变化：{op.freeAfter >= op.freeBefore ? "+" : "−"}
                {formatBytes(Math.abs(op.freeAfter - op.freeBefore))}（包含其他应用写入影响）
              </p>
            ) : null}
            {op.phase === "locked" ? (
              <Button
                size="xs"
                variant="outline"
                disabled={!allowed || pending}
                onClick={() => void act({ action: "reconcile", planId: op.id })}
              >
                核对中断并恢复完整原路径（不覆盖）
              </Button>
            ) : null}
            {activePhases.has(op.phase) ? (
              <Button
                size="xs"
                variant="outline"
                disabled={!allowed || pending}
                onClick={() => void act({ action: "cancel", planId: op.id })}
              >
                请求停止后续步骤
              </Button>
            ) : null}
          </div>
        ))}
      </details>
    </section>
  );
}
