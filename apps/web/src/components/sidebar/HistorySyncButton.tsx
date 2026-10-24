import { useState } from "react";
import { CommandId } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { usePrimaryEnvironmentId } from "../../state/environments";
import { readProjects } from "../../state/entities";
import { projectEnvironment } from "../../state/projects";
import { agentSessionImport, agentSessionRescan } from "../../state/agentSessions";
import { useAtomCommand } from "../../state/use-atom-command";
import { newProjectId } from "../../lib/utils";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";

/** Reuses the onboarding services so retries preserve the original session identity. */
export function HistorySyncButton() {
  const environmentId = usePrimaryEnvironmentId();
  const scan = useAtomCommand(agentSessionRescan);
  const createProject = useAtomCommand(projectEnvironment.create);
  const importHistory = useAtomCommand(agentSessionImport);
  const [progress, setProgress] = useState<string | null>(null);

  const sync = async () => {
    if (!environmentId || progress !== null) return;
    setProgress("扫描中…");
    let totalReconciled = 0;
    let totalSkipped = 0;
    let totalFailed = 0;
    let newProjectsCount = 0;
    const failureReasons: string[] = [];

    try {
      const result = await scan({ environmentId, input: {} });
      if (result._tag !== "Success") {
        throw new Error("历史会话扫描未完成，请重试。");
      }

      const candidates = result.value.candidates;
      for (const [index, candidate] of candidates.entries()) {
        setProgress(`${index + 1}/${candidates.length}`);
        const existing = readProjects().find(
          (project) =>
            project.environmentId === environmentId && project.workspaceRoot === candidate.path,
        );
        let projectId = candidate.projectId ?? existing?.id;
        if (!projectId) {
          projectId = newProjectId();
          const created = await createProject({
            environmentId,
            input: {
              projectId,
              commandId: CommandId.make(`history:project:create:${projectId}`),
              title: candidate.title,
              workspaceRoot: candidate.path,
              createWorkspaceRootIfMissing: false,
              defaultModelSelection: null,
            },
          });
          if (created._tag !== "Success") {
            const err = squashAtomCommandFailure(created);
            const msg = err instanceof Error ? err.message : String(err ?? "项目创建失败");
            failureReasons.push(`${candidate.title}: ${msg}`);
            totalFailed += candidate.threadCount;
            continue;
          }
          newProjectsCount++;
        }

        // Run single import per candidate without artificial retry loops
        const imported = await importHistory({
          environmentId,
          input: { projectId: projectId!, expectedWorkspaceRoot: candidate.path },
        });

        if (imported._tag !== "Success") {
          const err = squashAtomCommandFailure(imported);
          const msg = err instanceof Error ? err.message : String(err ?? "会话导入失败");
          failureReasons.push(`${candidate.title}: ${msg}`);
          totalFailed += candidate.threadCount;
          continue;
        }

        const { importedCount, skippedCount } = imported.value;
        totalReconciled += importedCount;
        totalSkipped += skippedCount;
      }

      const hasFailures = failureReasons.length > 0;
      const isTruncated = Boolean(result.value.truncated);

      let desc = `已扫描 ${candidates.length} 个项目目录${newProjectsCount > 0 ? `（其中新建 ${newProjectsCount} 个）` : ""}，核对处理 ${totalReconciled} 个已有/导入会话。`;
      if (totalSkipped > 0) desc += ` 已跳过 ${totalSkipped} 个。`;
      if (totalFailed > 0) desc += ` 导入失败 ${totalFailed} 个。`;
      if (isTruncated) {
        desc += " 扫描达到上限，结果尚不完整。";
      }
      if (failureReasons.length > 0) {
        desc += ` 失败原因: ${failureReasons.slice(0, 3).join("; ")}${failureReasons.length > 3 ? " 等" : ""}。`;
      }

      toastManager.add({
        type: hasFailures || isTruncated ? "warning" : "success",
        title: hasFailures && totalReconciled === 0 ? "历史同步未成功"
          : isTruncated ? "历史同步部分完成（扫描达到上限）"
          : hasFailures ? "历史同步部分完成（存在失败）" : "历史同步完成",
        description: desc,
      });
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "历史同步未完成",
        description: error instanceof Error ? error.message : "请重试。",
      });
    } finally {
      setProgress(null);
    }
  };

  return (
    <Button
      size="xs"
      variant="ghost-muted"
      disabled={!environmentId || progress !== null}
      onClick={() => void sync()}
      title="手动扫描导入外部历史会话"
    >
      {progress ?? "同步历史"}
    </Button>
  );
}
