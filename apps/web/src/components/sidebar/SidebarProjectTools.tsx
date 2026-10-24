import { useState, type ReactNode } from "react";
import { Button } from "../ui/button";
import { Popover, PopoverPopup, PopoverTitle, PopoverTrigger } from "../ui/popover";
import { HistorySyncButton } from "./HistorySyncButton";

export function SidebarProjectTools({
  openArchivedHistory,
  stickyProjects,
}: {
  openArchivedHistory: () => void;
  stickyProjects: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1 flex items-center gap-1 px-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger render={<Button size="xs" variant="ghost-muted" />}>
          历史与归档
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" width="sm" padding="compact">
          <PopoverTitle>历史与归档</PopoverTitle>
          <div className="mt-2 flex flex-col items-start gap-1">
            <Button
              size="xs"
              variant="ghost-muted"
              onClick={() => {
                setOpen(false);
                openArchivedHistory();
              }}
            >
              已归档会话
            </Button>
            <HistorySyncButton />
          </div>
        </PopoverPopup>
      </Popover>
      <Popover>
        <PopoverTrigger render={<Button size="xs" variant="ghost-muted" />}>
          项目工具
        </PopoverTrigger>
        <PopoverPopup side="right" align="start" width="sm" padding="compact">
          <PopoverTitle>项目工具</PopoverTitle>
          <div className="mt-2">{stickyProjects}</div>
        </PopoverPopup>
      </Popover>
    </div>
  );
}
