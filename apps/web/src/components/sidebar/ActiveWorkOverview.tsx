import { useState } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import type { SidebarThreadSummary } from "../../types";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { activeWorkStatus, collectActiveWork, activeWorkPreview } from "../../sidebarActiveWork";
import { subtaskThreadKey } from "../../sidebarSubtasks";
import { sidebarProviderLabel } from "../../sidebarProviderGrouping";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { Button } from "../ui/button";
import { Popover, PopoverTrigger, PopoverPopup, PopoverTitle } from "../ui/popover";

function activeWorkProjectNames(projects: readonly SidebarProjectSnapshot[]) {
  const result = new Map<string, string>();
  for (const project of projects)
    for (const key of project.providerThreadKeys ?? []) result.set(key, project.displayName);
  return result;
}

export function ActiveWorkOverview({
  threads,
  projects,
  activeKey,
  navigate,
  incomplete = false,
}: {
  threads: readonly SidebarThreadSummary[];
  projects: readonly SidebarProjectSnapshot[];
  activeKey: string | null;
  navigate: (ref: ScopedThreadRef) => void;
  incomplete?: boolean;
}) {
  const groups = collectActiveWork(threads);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [open, setOpen] = useState(false);
  const projectByThread = activeWorkProjectNames(projects);
  const childCount = groups.reduce((count, group) => count + group.children.length, 0);
  const preview = activeWorkPreview(groups);
  const truncated =
    preview.length < groups.length ||
    preview.some((group, index) => group.children.length < groups[index]!.children.length);
  const go = (thread: SidebarThreadSummary) => {
    navigate(scopeThreadRef(thread.environmentId, thread.id));
    setOpen(false);
  };
  const row = (thread: SidebarThreadSummary, fallback?: string) => {
    const key = subtaskThreadKey(thread);
    const status = activeWorkStatus(thread) ?? fallback;
    const attention = status === "待授权" || status === "待回答";
    const detail = [
      sidebarProviderLabel(thread.runtime?.providerInstanceId ?? thread.modelSelection.instanceId),
      projectByThread.get(key),
      status,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => go(thread)}
              aria-current={activeKey === key ? "page" : undefined}
              className="min-w-0 flex-1 rounded-md px-1.5 py-1 text-left outline-none hover:bg-accent focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring aria-[current=page]:bg-accent"
            >
              <span className="flex min-w-0 items-center gap-1.5 text-xs">
                <span
                  aria-hidden="true"
                  className={`size-1.5 shrink-0 rounded-full ${attention ? "bg-warning" : "bg-success"}`}
                />
                <span className="truncate">{thread.title || "未命名会话"}</span>
              </span>
              <span className="block truncate pl-3 text-3xs text-sidebar-muted-foreground">
                {detail}
              </span>
            </button>
          }
        />
        <TooltipPopup side="right">
          {thread.title || "未命名会话"}
          <br />
          {detail}
        </TooltipPopup>
      </Tooltip>
    );
  };
  const renderGroups = (all: boolean) => (
    <ul aria-label={all ? "全部正在进行的任务" : "正在进行的任务"} className="space-y-0.5">
      {(all ? groups : preview).map(({ root, children }) => {
        const key = subtaskThreadKey(root);
        const expanded = all || !collapsed.has(key);
        return (
          <li key={key}>
            <div className="flex min-w-0 items-center">
              {children.length && !all ? (
                <button
                  type="button"
                  aria-label={`${expanded ? "收起" : "展开"}${root.title}的子任务`}
                  aria-expanded={expanded}
                  onClick={() =>
                    setCollapsed((previous) => {
                      const next = new Set(previous);
                      if (next.has(key)) next.delete(key);
                      else next.add(key);
                      return next;
                    })
                  }
                  className="shrink-0 rounded p-0.5 text-sidebar-muted-foreground focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  {expanded ? (
                    <ChevronDownIcon className="size-3" />
                  ) : (
                    <ChevronRightIcon className="size-3" />
                  )}
                </button>
              ) : null}
              {row(root, children.length ? `等待 ${children.length} 个子任务` : undefined)}
            </div>
            {expanded && children.length ? (
              <ul
                className="ml-3 border-l border-sidebar-border pl-1"
                aria-label={`${root.title}的运行子任务`}
              >
                {children.map((child) => (
                  <li key={subtaskThreadKey(child)} className="flex min-w-0">
                    {row(child)}
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
  return (
    <section aria-label="跨模型运行概览" className="border-b border-sidebar-border pb-1.5">
      <div className="flex items-center justify-between gap-1 px-2 py-1 text-xs">
        <span className="font-medium">
          正在进行 <span className="text-sidebar-muted-foreground">{groups.length}</span>
        </span>
        {childCount ? (
          <span className="text-3xs text-sidebar-muted-foreground">含 {childCount} 个子任务</span>
        ) : null}
      </div>
      {incomplete ? (
        <p role="status" className="px-2 text-3xs text-sidebar-muted-foreground">
          连接未就绪，状态可能尚未更新。
        </p>
      ) : null}
      {groups.length === 0 ? (
        <p className="px-2 text-3xs text-sidebar-muted-foreground">暂无运行任务</p>
      ) : (
        renderGroups(false)
      )}
      {truncated ? (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger render={<Button variant="ghost" size="xs" />}>
            查看全部 {groups.length + childCount} 项
          </PopoverTrigger>
          <PopoverPopup side="right" align="start" width="lg" padding="compact">
            <PopoverTitle>
              正在进行 · {groups.length} 个主任务，{childCount} 个子任务
            </PopoverTitle>
            <div className="mt-2 max-h-[min(65vh,640px)] overflow-y-auto">{renderGroups(true)}</div>
          </PopoverPopup>
        </Popover>
      ) : null}
    </section>
  );
}
