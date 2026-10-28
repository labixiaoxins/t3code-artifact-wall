// @effect-diagnostics globalConsole:off - standalone preflight reports rejection before starting the build runtime.
import { assertStorageBudget } from "@t3tools/shared/storageBudget";
const expected = Number(process.argv[2]);
try {
  assertStorageBudget(process.cwd(), expected);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
