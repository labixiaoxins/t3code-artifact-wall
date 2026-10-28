import { assertStorageBudget } from "../packages/shared/src/storageBudget.ts";
const expected = Number(process.argv[2]);
try {
  assertStorageBudget(process.cwd(), expected);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
