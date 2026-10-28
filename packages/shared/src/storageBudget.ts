// @effect-diagnostics nodeBuiltinImport:off - synchronous preflight runs before build/update writes.
import * as NodeFS from "node:fs";
export function assertStorageBudget(directory: string, expectedGiB: number, reserveGiB = 40): void {
  if (
    !Number.isFinite(expectedGiB) ||
    expectedGiB < 0 ||
    !Number.isFinite(reserveGiB) ||
    reserveGiB < 0
  )
    throw new Error("Invalid storage budget");
  const stat = NodeFS.statfsSync(directory);
  const free = Number(stat.bavail) * Number(stat.bsize);
  if (free - expectedGiB * 1024 ** 3 < reserveGiB * 1024 ** 3) {
    throw new Error(
      `空间预算不足：剩余 ${(free / 1024 ** 3).toFixed(1)} GiB，预计新增 ${expectedGiB} GiB，需保留 ${reserveGiB} GiB。请先整理空间，操作尚未开始。`,
    );
  }
}
