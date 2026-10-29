import { memo, useState } from "react";
import {
  PinIcon,
  PinOffIcon,
  ChevronRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  PlusIcon,
  XIcon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { cn } from "~/lib/utils";
import { formatRelativeTimeLabel } from "../../timestampFormat";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { Sheet, SheetTrigger, SheetPopup, SheetTitle } from "../ui/sheet";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { ProjectFavicon } from "../ProjectFavicon";
import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import type { SidebarThreadSummary } from "../../types";
import { resolveStickyProjects, isProjectSticky } from "./stickyProjects.logic";
import { useStickyProjectsStore } from "./stickyProjectsStore";

export interface StickyProjectsPanelProps {
  sidebarProjects: ReadonlyArray<SidebarProjectSnapshot>;
  threadsByProjectKey: Map<string, SidebarThreadSummary[]>;
  activeProjectKey?: string | null;
  onSelectThread: (threadRef: ScopedThreadRef) => void;
  onLocateProject: (projectKey: string, expandAllThreads?: boolean) => void;
  onClose: () => void;
}

export const StickyProjectsPanel = memo(function StickyProjectsPanel({
  sidebarProjects,
  threadsByProjectKey,
  activeProjectKey = null,
  onSelectThread,
  onLocateProject,
  onClose,
}: StickyProjectsPanelProps) {
  const { identities, addStickyProject, removeStickyProject, moveGroup } = useStickyProjectsStore();

  const resolvedItems = (() =>
    resolveStickyProjects({
      identities,
      sidebarProjects,
      threadsByProjectKey,
      activeProjectKey,
    }))();

  const groupKeys = identities.map(
    (identity) =>
      resolvedItems.find((item) =>
        item.snapshot ? isProjectSticky([identity], item.snapshot) : item.identity === identity,
      )!.key,
  );

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of resolvedItems) {
      if (item.isDefaultExpanded) {
        initial.add(item.key);
      }
    }
    return initial;
  });

  const toggleExpanded = (key: string) => {
    setExpandedKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const nonStickyProjects = (() =>
    sidebarProjects.filter((project) => !isProjectSticky(identities, project)))();

  return (
    <div
      className="flex flex-col w-full max-h-[80vh] sm:max-h-[500px] text-popover-foreground bg-popover"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2 bg-muted/30">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          <PinIcon className="size-3.5 text-primary" />
          <span>常驻项目</span>
          <span className="text-2xs text-muted-foreground">({resolvedItems.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {nonStickyProjects.length > 0 && (
            <Menu>
              <MenuTrigger
                render={
                  <Button size="xs" variant="ghost">
                    <PlusIcon className="size-3 mr-1" />
                    添加
                  </Button>
                }
              />
              <MenuPopup side="bottom" align="end" className="w-56 max-h-60 overflow-y-auto">
                {nonStickyProjects.map((project) => (
                  <MenuItem
                    key={project.projectKey}
                    onClick={() =>
                      addStickyProject({
                        environmentId: project.environmentId,
                        projectId: project.id,
                      })
                    }
                  >
                    <div className="flex items-center gap-2 truncate">
                      <ProjectFavicon project={project} className="size-3.5 shrink-0" />
                      <span className="truncate">{project.displayName || project.title}</span>
                    </div>
                  </MenuItem>
                ))}
              </MenuPopup>
            </Menu>
          )}
          <Button size="icon-xs" variant="ghost" onClick={onClose} aria-label="关闭常驻项目面板">
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-border/40 p-1">
        {resolvedItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-muted-foreground gap-1.5">
            <PinIcon className="size-6 text-muted-foreground/40 mb-1" />
            <p className="text-xs font-medium text-foreground">暂无常驻项目</p>
            <p className="text-2xs text-muted-foreground/80 leading-relaxed max-w-[220px]">
              可在侧边栏右键点击项目设为常驻，或点击上方“添加”置顶常用项目。
            </p>
          </div>
        ) : (
          resolvedItems.map((item, index) => {
            const isExpanded = expandedKeys.has(item.key);

            if (!item.isAvailable) {
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between p-2 text-xs bg-muted/20 rounded"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <PinOffIcon className="size-3 text-muted-foreground shrink-0" />
                    <span className="truncate text-muted-foreground line-through">
                      不可用项目 ({item.identity.projectId.slice(0, 8)})
                    </span>
                    <span className="text-3xs px-1 py-0.5 rounded bg-muted text-muted-foreground border">
                      不可用
                    </span>
                  </div>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    onClick={() => {
                      for (const identity of identities) {
                        if (
                          item.snapshot
                            ? isProjectSticky([identity], item.snapshot)
                            : identity === item.identity
                        )
                          removeStickyProject(identity);
                      }
                    }}
                    title="从常驻列表中移除"
                    aria-label="移除不可用项目"
                  >
                    <Trash2Icon className="size-3 text-destructive" />
                  </Button>
                </div>
              );
            }

            const snapshot = item.snapshot!;
            return (
              <div key={item.key} className="py-1">
                {/* Project Header Row */}
                <div className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-accent/40 group">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.key)}
                      className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                      aria-label={isExpanded ? "收起最近会话" : "展开最近会话"}
                    >
                      <ChevronRightIcon
                        className={cn(
                          "size-3.5 transition-transform duration-150",
                          isExpanded && "rotate-90",
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onLocateProject(snapshot.projectKey);
                        onClose();
                      }}
                      className="flex items-center gap-1.5 truncate text-left text-xs font-medium text-foreground hover:text-primary transition-colors flex-1 min-w-0"
                      title="点击定位到侧边栏原项目"
                    >
                      <ProjectFavicon project={snapshot} className="size-3.5 shrink-0" />
                      <span className="truncate">{item.title}</span>
                    </button>
                  </div>

                  {/* Actions: Reorder & Remove (Keyboard accessible) */}
                  <div className="flex items-center gap-0.5 shrink-0 ml-1">
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => moveGroup(groupKeys, item.key, "up")}
                      aria-label={`将 ${item.title} 上移`}
                      title="上移"
                    >
                      <ArrowUpIcon className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === resolvedItems.length - 1}
                      onClick={() => moveGroup(groupKeys, item.key, "down")}
                      aria-label={`将 ${item.title} 下移`}
                      title="下移"
                    >
                      <ArrowDownIcon className="size-3" />
                    </Button>
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => {
                        for (const identity of identities) {
                          if (
                            item.snapshot
                              ? isProjectSticky([identity], item.snapshot)
                              : identity === item.identity
                          )
                            removeStickyProject(identity);
                        }
                      }}
                      aria-label={`取消常驻 ${item.title}`}
                      title="取消常驻"
                    >
                      <PinOffIcon className="size-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {/* Expanded Threads Section */}
                {isExpanded && (
                  <div className="pl-6 pr-2 pt-1 pb-1 space-y-0.5">
                    {item.recentThreads.length === 0 ? (
                      <div className="text-2xs text-muted-foreground/70 py-1 pl-1">
                        暂无未归档会话
                      </div>
                    ) : (
                      item.recentThreads.map((thread) => (
                        <button
                          key={thread.id}
                          type="button"
                          onClick={() => {
                            onSelectThread(scopeThreadRef(thread.environmentId, thread.id));
                            onClose();
                          }}
                          className="w-full flex items-center justify-between py-1 px-1.5 text-left text-xs rounded hover:bg-accent/60 group/thread text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <span className="truncate flex-1 font-normal group-hover/thread:text-foreground">
                            {thread.title || "未命名会话"}
                          </span>
                          <span className="text-3xs text-muted-foreground/70 ml-2 whitespace-nowrap">
                            {formatRelativeTimeLabel(thread.updatedAt ?? thread.createdAt)}
                          </span>
                        </button>
                      ))
                    )}
                    {item.totalThreadCount > 0 && (
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => {
                          onLocateProject(snapshot.projectKey, true);
                          onClose();
                        }}
                      >
                        <span>查看全部会话 ({item.totalThreadCount})</span>
                        <ExternalLinkIcon className="size-2.5 ml-1 opacity-60" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info */}
      <div className="px-3 py-1.5 border-t border-border/40 bg-muted/20 text-3xs text-muted-foreground flex items-center justify-between">
        <span>支持键盘操作 · 重命名自动同步</span>
        <button
          type="button"
          onClick={onClose}
          className="hover:underline text-3xs text-muted-foreground"
        >
          返回 (Esc)
        </button>
      </div>
    </div>
  );
});

export interface StickyProjectsTriggerProps {
  sidebarProjects: ReadonlyArray<SidebarProjectSnapshot>;
  threadsByProjectKey: Map<string, SidebarThreadSummary[]>;
  activeProjectKey?: string | null;
  onSelectThread: (threadRef: ScopedThreadRef) => void;
  onLocateProject: (projectKey: string, expandAllThreads?: boolean) => void;
  isMobile?: boolean;
}

export function StickyProjectsTrigger({
  sidebarProjects,
  threadsByProjectKey,
  activeProjectKey = null,
  onSelectThread,
  onLocateProject,
  isMobile = false,
}: StickyProjectsTriggerProps) {
  const [open, setOpen] = useState(false);
  const identities = useStickyProjectsStore((s) => s.identities);
  const stickyCount = (() =>
    resolveStickyProjects({ identities, sidebarProjects, threadsByProjectKey, activeProjectKey })
      .length)();

  const triggerButton = (
    <Button
      size="xs"
      variant={open ? "secondary" : "ghost-muted"}
      data-testid="sidebar-sticky-projects-trigger"
    >
      <PinIcon className="size-3" />
      <span>常驻项目</span>
      {stickyCount > 0 && (
        <span className="rounded-full bg-primary/10 px-1 text-3xs font-medium text-primary">
          {stickyCount}
        </span>
      )}
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={triggerButton} />
        <SheetPopup side="bottom" className="max-h-[85vh] overflow-hidden" showCloseButton={false}>
          <SheetTitle className="sr-only">常驻项目</SheetTitle>
          <StickyProjectsPanel
            sidebarProjects={sidebarProjects}
            threadsByProjectKey={threadsByProjectKey}
            activeProjectKey={activeProjectKey}
            onSelectThread={onSelectThread}
            onLocateProject={onLocateProject}
            onClose={() => setOpen(false)}
          />
        </SheetPopup>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={triggerButton} />
      <PopoverPopup side="bottom" align="start" sideOffset={6} width="md" padding="none">
        <StickyProjectsPanel
          sidebarProjects={sidebarProjects}
          threadsByProjectKey={threadsByProjectKey}
          activeProjectKey={activeProjectKey}
          onSelectThread={onSelectThread}
          onLocateProject={onLocateProject}
          onClose={() => setOpen(false)}
        />
      </PopoverPopup>
    </Popover>
  );
}
