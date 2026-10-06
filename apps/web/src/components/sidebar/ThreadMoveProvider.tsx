import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarThreadSummary } from "../../types";
import { THREAD_PLACEMENT_DRAG_TYPE, useThreadPlacementStore } from "../../sidebarThreadPlacement";
import { providerExpansionKey } from "../../sidebarProviderGrouping";
import { useUiStateStore } from "../../uiStateStore";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
} from "../ui/dialog";
import { toastManager } from "../ui/toast";

type MoveContext = {
  workspacePath: (threadKey: string) => string | null;
  requestMove: (threadKey: string) => void;
  restore: (threadKey: string) => void;
  drop: (data: string, target: SidebarProjectSnapshot) => void;
};
const Context = createContext<MoveContext>({
  workspacePath: () => null,
  requestMove: () => {},
  restore: () => {},
  drop: () => {},
});
export const useThreadMove = () => useContext(Context);

export function ThreadMoveProvider({
  projects,
  groups,
  threads,
  children,
  revealProject,
}: {
  projects: readonly SidebarProjectSnapshot[];
  groups: readonly SidebarProjectSnapshot[];
  threads: readonly SidebarThreadSummary[];
  children: ReactNode;
  revealProject: (key: string) => void;
}) {
  const [movingKey, setMovingKey] = useState<string | null>(null);
  const threadByKey = useMemo(
    () =>
      new Map(
        threads.map((thread) => [
          scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
          thread,
        ]),
      ),
    [threads],
  );
  const [pendingReveal, setPendingReveal] = useState<{ threadKey: string } | null>(null);
  const revealed = useRef<typeof pendingReveal>(null);
  const workspaceByKey = useMemo(() => {
    const members = projects.flatMap((project) => project.memberProjects);
    return new Map(
      threads.map((thread) => [
        scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
        thread.worktreePath ??
          members.find(
            (project) =>
              project.id === thread.projectId && project.environmentId === thread.environmentId,
          )?.workspaceRoot ??
          null,
      ]),
    );
  }, [projects, threads]);
  useEffect(() => {
    if (!pendingReveal || revealed.current === pendingReveal) return;
    const group = groups.find((candidate) =>
      candidate.providerThreadKeys?.has(pendingReveal.threadKey),
    );
    if (!group?.providerLabel) return;
    useUiStateStore
      .getState()
      .setProjectExpanded([providerExpansionKey(group.providerLabel), group.projectKey], true);
    revealProject(group.projectKey);
    let attempts = 0;
    let animation: Animation | undefined;
    const locate = () => {
      const header = Array.from(
        document.querySelectorAll<HTMLElement>("[data-thread-project-key]"),
      ).find((element) => element.dataset.threadProjectKey === group.projectKey);
      const row = Array.from(
        header?.closest("li")?.querySelectorAll<HTMLElement>("[data-thread-key]") ?? [],
      ).find(
        (element) =>
          element.dataset.threadKey === pendingReveal.threadKey &&
          element.getClientRects().length > 0,
      );
      if (!row) {
        if (++attempts < 10) timer = window.setTimeout(locate, 100);
        return;
      }
      revealed.current = pendingReveal;
      row.scrollIntoView({ block: "nearest", behavior: "instant" });
      if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        animation = row.animate(
          [
            { outline: "2px solid var(--primary)", outlineOffset: "-2px" },
            { outline: "2px solid transparent", outlineOffset: "-2px" },
          ],
          { duration: 1600 },
        );
      }
    };
    // Let list expansion and auto-animate's outgoing rows settle before locating the new row.
    let timer = window.setTimeout(locate, 250);
    return () => {
      window.clearTimeout(timer);
      animation?.cancel();
    };
  }, [groups, pendingReveal, revealProject]);
  const moving = movingKey ? threadByKey.get(movingKey) : null;
  const context = useMemo<MoveContext>(() => {
    const save = (threadKey: string, target: SidebarProjectSnapshot | null) => {
      const thread = threadByKey.get(threadKey);
      if (!thread) {
        toastManager.add({
          type: "error",
          title: "会话已不可用",
          description: "请刷新侧栏后重试。",
        });
        return;
      }
      if (target && target.environmentId !== thread.environmentId) {
        toastManager.add({
          type: "error",
          title: "无法移到其他环境",
          description: "请选择同一环境中的项目。",
        });
        return;
      }
      const previous = useThreadPlacementStore.getState().placements[threadKey] ?? null;
      if (!useThreadPlacementStore.getState().move(threadKey, target?.projectKey ?? null)) {
        toastManager.add({
          type: "error",
          title: "移动未保存",
          description: "本机存储不可用，请稍后重试。",
        });
        return;
      }
      const provider = groups.find((group) =>
        group.providerThreadKeys?.has(threadKey),
      )?.providerLabel;
      const savedRevision = useThreadPlacementStore.getState().revisions[threadKey]!;
      setPendingReveal({ threadKey });
      setMovingKey(null);
      toastManager.add({
        type: "success",
        title: target
          ? `已移到 ${provider ?? "原模型"} → ${target.displayName}`
          : "已恢复原项目归类",
        description: "侧栏位置已保存在此设备；工作目录保持原样。",
        actionProps: {
          children: "撤销",
          onClick: () => {
            const result = useThreadPlacementStore
              .getState()
              .undo(threadKey, savedRevision, previous);
            if (result === "stale") {
              toastManager.add({
                type: "info",
                title: "此操作已过期",
                description: "会话位置已再次调整，保留最新位置。",
              });
            } else if (result === "failed") {
              toastManager.add({
                type: "error",
                title: "撤销未保存",
                description: "本机存储不可用，请稍后重试。",
              });
            } else {
              setPendingReveal({ threadKey });
              toastManager.add({ type: "success", title: "已撤销移动" });
            }
          },
        },
      });
    };
    return {
      workspacePath: (key) => workspaceByKey.get(key) ?? null,
      requestMove: setMovingKey,
      restore: (key) => save(key, null),
      drop: (threadKey, group) => {
        const target =
          projects.find(
            (project) => project.projectKey === (group.sourceProjectKey ?? group.projectKey),
          ) ??
          projects.find(
            (project) =>
              project.environmentId === group.environmentId &&
              project.displayName === group.displayName,
          );
        if (target) save(threadKey, target);
        else toastManager.add({ type: "error", title: "目标项目不可用" });
      },
    };
  }, [groups, projects, threadByKey, workspaceByKey]);

  return (
    <Context.Provider value={context}>
      {children}
      <Dialog
        open={!!moving}
        onOpenChange={(open) => {
          if (!open) setMovingKey(null);
        }}
      >
        <DialogPopup className="max-w-md">
          <DialogHeader>
            <DialogTitle>移动到项目</DialogTitle>
            <DialogDescription>
              为“{moving?.title}”选择侧栏项目。保留原工作目录与模型，位置仅保存在此设备。
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="grid max-h-72 gap-1 overflow-y-auto">
              {projects
                .filter((project) => project.environmentId === moving?.environmentId)
                .map((project) => (
                  <Button
                    key={project.projectKey}
                    variant="outline"
                    onClick={() => {
                      if (movingKey) context.drop(movingKey, project);
                    }}
                  >
                    {project.displayName}
                  </Button>
                ))}
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMovingKey(null)}>
              取消
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </Context.Provider>
  );
}

export function ThreadProjectDropTarget({
  project,
  children,
}: {
  project: SidebarProjectSnapshot;
  children: ReactNode;
}) {
  const { drop } = useThreadMove();
  const [over, setOver] = useState(false);
  return (
    <div
      data-thread-project-drop={project.displayName}
      data-thread-project-key={project.projectKey}
      className={
        over ? "rounded-md bg-sidebar-row-active ring-1 ring-inset ring-primary" : undefined
      }
      onDragOver={(event) => {
        if (!event.dataTransfer.types.includes(THREAD_PLACEMENT_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        if (!event.dataTransfer.types.includes(THREAD_PLACEMENT_DRAG_TYPE)) return;
        event.preventDefault();
        event.stopPropagation();
        drop(event.dataTransfer.getData(THREAD_PLACEMENT_DRAG_TYPE), project);
      }}
    >
      {children}
    </div>
  );
}
