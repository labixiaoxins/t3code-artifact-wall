// @effect-diagnostics nodeBuiltinImport:off -- Verifies the synchronous Node storage boundary using temporary files.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { expect, it } from "vite-plus/test";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { privateTokenStorage } from "./privateTokenStorage.ts";

it.skipIf(HostProcess.Platform.defaultValue() === "win32")(
  "protects existing storage and every replacement without changing its contents",
  async () => {
    const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-private-storage-"));
    const file = NodePath.join(directory, "clerk-tokens.json");
    const replace = () => {
      if (NodeFS.existsSync(file)) NodeFS.unlinkSync(file);
      NodeFS.writeFileSync(file, "synthetic encrypted value");
      NodeFS.chmodSync(file, 0o666);
    };
    try {
      replace();
      NodeFS.chmodSync(directory, 0o755);
      const storage = privateTokenStorage(
        {
          getItem: async () => {
            replace();
            return "synthetic value";
          },
          setItem: async () => {
            replace();
          },
          removeItem: () => {
            replace();
          },
        },
        directory,
      );
      const check = () => {
        expect(NodeFS.statSync(directory).mode & 0o777).toBe(0o700);
        expect(NodeFS.statSync(file).mode & 0o777).toBe(0o600);
        expect(NodeFS.readFileSync(file, "utf8")).toBe("synthetic encrypted value");
      };
      check();
      expect(await storage.getItem("test")).toBe("synthetic value");
      check();
      await storage.setItem("test", "synthetic value");
      check();
      await storage.removeItem("test");
      check();
    } finally {
      NodeFS.rmSync(directory, { recursive: true, force: true });
    }
  },
);
