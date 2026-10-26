import { uiText } from "~/i18n";
import { Button } from "../ui/button";
import {
  exportComposerDraftRecovery,
  retryComposerDraftPersistence,
  useComposerDraftPersistenceStatus,
} from "../../composerDraftStore";

export function DraftPersistenceNotice() {
  const status = useComposerDraftPersistenceStatus();
  if (status !== "unavailable" && status !== "corrupt") return null;
  return (
    <div
      role="alert"
      className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-foreground"
    >
      <span className="min-w-0 basis-full sm:basis-0 sm:flex-1">
        {status === "corrupt"
          ? uiText("Saved drafts could not be read. The original record is preserved. Export a recovery file before repairing storage.")
          : uiText("Draft changes are only in this window. Storage is full or unavailable; export them before closing.")}
      </span>
      {status === "unavailable" ? (
        <Button size="xs" variant="outline" onClick={retryComposerDraftPersistence}>
          {uiText("Retry saving")}</Button>
      ) : null}
      <Button
        size="xs"
        variant="outline"
        onClick={() => {
          const url = URL.createObjectURL(
            new Blob([exportComposerDraftRecovery()], { type: "application/json" }),
          );
          const link = document.createElement("a");
          link.href = url;
          link.download = "t3-draft-recovery.json";
          link.click();
          window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }}
      >
        {uiText("Export drafts")}</Button>
    </div>
  );
}
