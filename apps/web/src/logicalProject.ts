export {
  buildProjectGroups,
  deriveLogicalProjectKeyFromSettings,
  derivePhysicalProjectKey,
  derivePhysicalProjectKeyFromPath,
  deriveProjectGroupingOverrideKey,
  getProjectOrderKey,
  selectProjectGroupingSettings,
  type ProjectGroupingMode,
  type ProjectGroupingSettings,
  type ProjectGroup,
  type ProjectGroupMember,
} from "@t3tools/client-runtime/state/project-grouping";

import { deriveLogicalProjectKeyFromSettings as keyFromSettings } from "@t3tools/client-runtime/state/project-grouping";
export function deriveLogicalProjectKey(
  project: Parameters<typeof keyFromSettings>[0],
  options?: { readonly groupScratchProjects?: boolean },
) {
  return keyFromSettings(project, { sidebarProjectGroupingMode: "repository", sidebarProjectGroupingOverrides: {} }, options);
}
