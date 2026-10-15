import { useSyncExternalStore } from "react";
import { manualClipboard } from "../manualClipboard";
import { Dialog, DialogPopup, DialogTitle, DialogDescription } from "./ui/dialog";

export function ManualClipboardDialog() {
  const value = useSyncExternalStore(
    manualClipboard.subscribe,
    manualClipboard.getSnapshot,
    () => null,
  );
  return (
    <Dialog
      open={value !== null}
      onOpenChange={(open) => {
        if (!open) manualClipboard.clear();
      }}
    >
      <DialogPopup>
        <DialogTitle>请手动复制</DialogTitle>
        <DialogDescription>
          浏览器未允许自动复制。长按或选中下面的文字，使用系统「复制」。
        </DialogDescription>
        <textarea
          aria-label="手动复制内容"
          readOnly
          value={value ?? ""}
          className="mt-3 max-h-[50dvh] min-h-32 w-full resize-none rounded-lg border bg-background p-3 text-base select-text"
          onFocus={(event) => event.currentTarget.select()}
        />
      </DialogPopup>
    </Dialog>
  );
}
