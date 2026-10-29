import { useAtomValue } from "@effect/atom-react";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type EnvironmentId,
  type ThreadId,
} from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import * as ThreadUndo from "@t3tools/client-runtime/state/thread-undo";
import { showThreadUndoNotice } from "../../hooks/showThreadUndoNotice";
import { refreshArchivedThreadsForEnvironment } from "../../lib/archivedThreadsState";
import { serverEnvironment } from "../../state/server";
import { useEnvironmentScope } from "../../state/session";
import { threadEnvironment } from "../../state/threads";
import { useOrchestrationCommand } from "../../state/use-orchestration-command";
import { Button } from "../ui/button";

/** The continuation action intentionally archives one segment, never its descendants. */
export function ArchiveOriginalThreadButton({
  environmentId,
  threadId,
  disconnected,
}: {
  environmentId: EnvironmentId;
  threadId: ThreadId;
  disconnected: boolean;
}) {
  const config = useAtomValue(serverEnvironment.configValueAtom(environmentId));
  const permitted = useEnvironmentScope(environmentId, AuthOrchestrationOperateScope);
  const supported = config?.environment.capabilities.threadArchiveSafety === true;
  const archive = useOrchestrationCommand(threadEnvironment.archive, { reportFailure: false });
  const unarchive = useOrchestrationCommand(threadEnvironment.unarchive, { reportFailure: false });
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const target = scopeThreadRef(environmentId, threadId);
  const submit = async () => {
    if (inFlight.current || disconnected || !permitted || !supported) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    const claim = ThreadUndo.begin("archive", scopedThreadKey(target));
    try {
      const result = await archive({ environmentId, input: { threadId, requireIdle: true } });
      if (result._tag !== "Success") {
        claim.finish();
        const failure = squashAtomCommandFailure(result);
        setError(failure instanceof Error ? failure.message : "归档失败，请重试。");
        return;
      }
      refreshArchivedThreadsForEnvironment(environmentId);
      showThreadUndoNotice({
        action: "Archived",
        claim,
        failureTitle: "撤销归档失败",
        undo: async () => {
          ThreadUndo.invalidate("archive", scopedThreadKey(target));
          const result = await unarchive({ environmentId, input: { threadId } });
          if (result._tag === "Success") refreshArchivedThreadsForEnvironment(environmentId);
          return result;
        },
      });
    } catch {
      claim.finish();
      setError("归档结果暂未确认，请恢复连接后核对归档状态。");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return (
    <div>
      <Button
        size="xs"
        variant="ghost"
        disabled={busy || disconnected || !permitted || !supported}
        onClick={() => {
          void submit();
        }}
      >
        {busy ? "正在核实并归档…" : "一键归档原会话"}
      </Button>
      {!supported ? (
        <p className="text-2xs text-muted-foreground">此环境尚不支持安全归档，请更新服务端。</p>
      ) : null}
      {error ? (
        <div role="alert" className="text-xs">
          <p>{error}</p>
          {error.includes("绑定了已启用的定时任务") ? <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              void navigate({ to: "/settings/scheduled-tasks", search: { environmentId } });
            }}
          >
            管理定时任务
          </Button> : null}
        </div>
      ) : null}
    </div>
  );
}
