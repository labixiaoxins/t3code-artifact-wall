import { Toggle, ToggleGroup } from "../ui/toggle-group";
import type { InspectorTab } from "../../inspectorTabs";

export function InspectorTabBar({
  tabs,
  labels,
  value,
  onChange,
}: {
  tabs: readonly InspectorTab[];
  labels: Record<InspectorTab, string>;
  value: InspectorTab;
  onChange: (tab: InspectorTab) => void;
}) {
  return (
    <ToggleGroup
      aria-label={"检查器"}
      className={"mx-3 mt-3 mb-1 w-[calc(100%-1.5rem)] *:flex-1"}
      variant={"segmented"}
      value={[value]}
      onKeyDown={(event) => {
        if (event.altKey && event.key.toLowerCase() === "r" && tabs.includes("run")) {
          event.preventDefault();
          onChange("run");
        }
      }}
      onValueChange={(next) => {
        const tab = tabs.find((candidate) => candidate === next[0]);
        if (tab) onChange(tab);
      }}
    >
      {tabs.map((tab) => (
        <Toggle key={tab} value={tab} aria-keyshortcuts={tab === "run" ? "Alt+R" : undefined}>
          {labels[tab]}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
