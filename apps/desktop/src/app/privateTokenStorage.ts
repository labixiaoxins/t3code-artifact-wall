// @effect-diagnostics nodeBuiltinImport:off -- Synchronous protection must precede Clerk's Electron startup lock.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";

interface TokenStorage {
  getItem: (key: string) => Promise<string | null> | string | null;
  setItem: (key: string, value: string) => Promise<void> | void;
  removeItem: (key: string) => Promise<void> | void;
}

/** electron-store can replace its file on every mutation, so protect each new inode. */
export function privateTokenStorage(storage: TokenStorage, stateDir: string): TokenStorage {
  NodeFS.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  NodeFS.chmodSync(stateDir, 0o700);
  const tokensPath = NodePath.join(stateDir, "clerk-tokens.json");
  const protect = () => {
    if (NodeFS.existsSync(tokensPath)) NodeFS.chmodSync(tokensPath, 0o600);
  };
  protect();
  return {
    async getItem(key) {
      try {
        return await storage.getItem(key);
      } finally {
        protect();
      }
    },
    async setItem(key, value) {
      try {
        await storage.setItem(key, value);
      } finally {
        protect();
      }
    },
    async removeItem(key) {
      try {
        await storage.removeItem(key);
      } finally {
        protect();
      }
    },
  };
}
