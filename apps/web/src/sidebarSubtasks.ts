import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { SidebarThreadSummary } from "./types";
import type { SidebarProjectSnapshot } from "./sidebarProjectGrouping";
import type { ThreadPlacements } from "./sidebarThreadPlacement";
import { groupSidebarByProvider } from "./sidebarProviderGrouping";

type SubtaskThread = Pick<
  SidebarThreadSummary,
  "id" | "environmentId" | "lineage" | "archivedAt" | "deletedAt"
>;
export const subtaskThreadKey = (thread: Pick<SubtaskThread, "id" | "environmentId">) =>
  scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
export function buildSubtaskTree<T extends SubtaskThread>(threads: readonly T[]) {
  const byKey = new Map(threads.filter((t) => !t.deletedAt).map((t) => [subtaskThreadKey(t), t]));
  const parentByKey = new Map<string, T>();
  // A corrupt/self/cyclic lineage must never hide a conversation.
  for (const thread of byKey.values()) {
    if (thread.lineage.relationshipToParent !== "subagent" || !thread.lineage.parentThreadId)
      continue;
    const seen = new Set([subtaskThreadKey(thread)]);
    let cursor: T | undefined = thread;
    let valid = true;
    while (cursor?.lineage.relationshipToParent === "subagent" && cursor.lineage.parentThreadId) {
      const key = scopedThreadKey(
        scopeThreadRef(cursor.environmentId, cursor.lineage.parentThreadId),
      );
      if (seen.has(key)) {
        valid = false;
        break;
      }
      seen.add(key);
      cursor = byKey.get(key);
    }
    const parent = byKey.get(
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.lineage.parentThreadId)),
    );
    if (valid && parent) parentByKey.set(subtaskThreadKey(thread), parent);
  }
  const children = new Map<string, T[]>();
  for (const thread of byKey.values()) {
    const parent = parentByKey.get(subtaskThreadKey(thread));
    if (parent) {
      const key = subtaskThreadKey(parent);
      const list = children.get(key) ?? [];
      list.push(thread);
      children.set(key, list);
    }
  }
  const rootFor = (thread: T): T => {
    let root = thread;
    while (parentByKey.has(subtaskThreadKey(root))) root = parentByKey.get(subtaskThreadKey(root))!;
    return root;
  };
  const needed = new Set<string>();
  for (const thread of byKey.values())
    if (!thread.archivedAt) {
      let cursor: T | undefined = thread;
      while (cursor) {
        needed.add(subtaskThreadKey(cursor));
        cursor = parentByKey.get(subtaskThreadKey(cursor));
      }
    }
  const roots = [...byKey.values()].filter(
    (t) => !parentByKey.has(subtaskThreadKey(t)) && needed.has(subtaskThreadKey(t)),
  );
  const descendants = (parent: Pick<SubtaskThread, "id" | "environmentId">, archived: boolean) => {
    const result: T[] = [];
    const visit = (key: string) => {
      for (const child of children.get(key) ?? []) {
        if (Boolean(child.archivedAt) === archived) result.push(child);
        visit(subtaskThreadKey(child));
      }
    };
    visit(subtaskThreadKey(parent));
    return result;
  };
  return { byKey, parentByKey, children, roots, needed, rootFor, descendants };
}
export function subtaskDescendants<T extends SubtaskThread>(
  threads: readonly T[],
  parent: Pick<SubtaskThread, "id" | "environmentId">,
  archived: boolean,
): T[] {
  return buildSubtaskTree(threads).descendants(parent, archived);
}
/** Calls each existing mutation sequentially; failures do not skip the remaining children. */
export async function mutateSubtasks<T, R>(
  threads: readonly T[],
  mutate: (thread: T) => Promise<R>,
  failed: (result: R) => boolean,
) {
  const failures: { thread: T; result: R | unknown }[] = [];
  for (const thread of threads) {
    try {
      const result = await mutate(thread);
      if (failed(result)) failures.push({ thread, result });
    } catch (result) {
      failures.push({ thread, result });
    }
  }
  return failures;
}
export function groupSidebarWithSubtasks(
  projects: readonly SidebarProjectSnapshot[],
  threads: readonly SidebarThreadSummary[],
  configs: Parameters<typeof groupSidebarByProvider>[2],
  placements: ThreadPlacements,
) {
  const tree = buildSubtaskTree(threads);
  return groupSidebarByProvider(projects, tree.roots, configs, placements).map((project) => {
    const keys = new Set(project.providerThreadKeys);
    for (const thread of threads)
      if (
        !thread.archivedAt &&
        !thread.deletedAt &&
        keys.has(subtaskThreadKey(tree.rootFor(thread)))
      )
        keys.add(subtaskThreadKey(thread));
    return { ...project, providerThreadKeys: keys };
  });
}
