import { useState } from "react";
import { CommandId } from "@t3tools/contracts";
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
    let completed = 0;
    let skipped = 0;
    try {
      const result = await scan({ environmentId, input: {} });
      if (result._tag !== "Success") throw new Error("历史扫描未完成，请重试。");
      for (const [index, candidate] of result.value.candidates.entries()) {
        setProgress(`${index + 1}/${result.value.candidates.length}`);
        const existing = readProjects().find(
          (project) =>
            project.environmentId === environmentId && project.workspaceRoot === candidate.path,
        );
        const projectId = existing?.id ?? newProjectId();
        if (!existing) {
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
            skipped += candidate.threadCount;
            continue;
          }
        }
        let previousCount = -1;
        for (let batch = 0; batch < 50; batch++) {
          const imported = await importHistory({
            environmentId,
            input: { projectId, expectedWorkspaceRoot: candidate.path },
          });
          if (imported._tag !== "Success") {
            skipped += candidate.threadCount;
            break;
          }
          const { importedCount, skippedCount } = imported.value;
          if (skippedCount === 0 || importedCount <= previousCount || batch === 49) {
            completed += importedCount;
            skipped += skippedCount;
            break;
          }
          previousCount = importedCount;
        }
      }
      toastManager.add({
        type: skipped || result.value.truncated ? "warning" : "success",
        title: "历史同步完成",
        description: `已核对 ${completed} 个会话${skipped ? `，${skipped} 个未能导入` : ""}${result.value.truncated ? "；扫描达到上限，结果尚不完整" : ""}。已有会话不会重复创建。`,
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
    >
      {progress ?? "同步历史"}
    </Button>
  );
}
