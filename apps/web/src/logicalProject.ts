export {
  buildProjectGroups,
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  getProjectOrderKey,
  selectProjectGroupingSettings,
  type ProjectGroupingMode,
  type ProjectGroupingSettings,
  type ProjectGroup,
  type ProjectGroupMember,
} from "@t3tools/client-runtime/state/project-grouping";

import {
  deriveLogicalProjectKeyFromSettings as keyFromSettings,
  derivePhysicalProjectKey as physicalProjectKey,
} from "@t3tools/client-runtime/state/project-grouping";

export function deriveProjectGroupingOverrideKey(
  project: Parameters<typeof physicalProjectKey>[0],
): string {
  return physicalProjectKey(project);
}

export function deriveLogicalProjectKey(
  project: Parameters<typeof keyFromSettings>[0],
  options?: { readonly groupScratchProjects?: boolean },
) {
  return keyFromSettings(
    project,
    { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} },
    options,
  );
}
