import { createContext } from "react";
import type { SidebarThreadSummary } from "./types";
import { buildSubtaskTree } from "./sidebarSubtasks";
export const SidebarSubtasksContext = createContext(buildSubtaskTree<SidebarThreadSummary>([]));
