// @effect-diagnostics nodeBuiltinImport:off - This compiler launcher runs before the application runtime.
import {
  HostProcessArchitecture,
  HostProcessArguments,
  HostProcessPlatform,
} from "@t3tools/shared/hostProcess";
import * as Effect from "effect/Effect";
import * as NodeChildProcess from "node:child_process";
import * as NodeURL from "node:url";

function runCompiler(relativePath: string, args: ReadonlyArray<string>) {
  const result = NodeChildProcess.spawnSync(
    process.execPath,
    [NodeURL.fileURLToPath(new URL(relativePath, import.meta.url)), ...args],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Typecheck terminated by ${result.signal}`);
  return result.status ?? 1;
}

const platform = Effect.runSync(HostProcessPlatform);
const architecture = Effect.runSync(HostProcessArchitecture);
const extraArgs = Effect.runSync(HostProcessArguments).slice(2);
const supportsRust =
  (platform === "darwin" && architecture === "arm64") ||
  (platform === "linux" && architecture === "x64");

if (supportsRust && extraArgs.length === 0) {
  const compilerStatus = runCompiler("../node_modules/tsc-rs/bin/tsc-rs", ["--noEmit"]);
  // tsc-rs does not include the Effect language service. Keep its full diagnostic
  // pass, including suggestions, and fail on warnings as the patched tsc does.
  // Run both passes even when the Rust compiler reports an error.
  const effectStatus = runCompiler("../node_modules/@effect/tsgo/dist/effect-tsgo.cjs", [
    "diagnostics",
    "--project",
    "tsconfig.json",
    "--strict",
    "--format",
    "text",
  ]);
  process.exitCode = compilerStatus || effectStatus;
} else {
  process.stderr.write(
    supportsRust
      ? "Custom compiler arguments use Effect-patched TypeScript.\n"
      : `tsc-rs preview has no ${platform}-${architecture} binary; using Effect-patched TypeScript.\n`,
  );
  process.exitCode = runCompiler("../node_modules/typescript/bin/tsc", ["--noEmit", ...extraArgs]);
}
