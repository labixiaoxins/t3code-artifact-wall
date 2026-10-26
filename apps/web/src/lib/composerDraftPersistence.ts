import { Debouncer } from "@tanstack/react-pacer";

export type DraftPersistenceStatus = "saved" | "pending" | "unavailable" | "corrupt";

/** Keeps failed writes in memory and never replaces an unreadable saved draft. */
export function createComposerDraftPersistence<T>(options: {
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem">;
  serialize: (value: T) => string;
  debounceMs?: number;
}) {
  let status: DraftPersistenceStatus = "saved";
  let pending: { name: string; value: T } | undefined;
  let unreadable: string | undefined;
  let readBlocked = false;
  const listeners = new Set<() => void>();
  const update = (next: DraftPersistenceStatus) => {
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  };
  const write = () => {
    if (!pending || unreadable !== undefined || readBlocked) return;
    try {
      options.storage().setItem(pending.name, options.serialize(pending.value));
      pending = undefined;
      update("saved");
    } catch {
      update("unavailable");
    }
  };
  const debouncer = new Debouncer(write, { wait: options.debounceMs ?? 300 });
  const flush = () => {
    debouncer.cancel();
    debouncer.reset();
    write();
  };
  return {
    getItem: (name: string) => {
      let raw: string | null = null;
      try {
        raw = options.storage().getItem(name);
        if (typeof raw !== "string") return null;
        const parsed: unknown = JSON.parse(raw);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          !("state" in parsed) ||
          typeof parsed.state !== "object" ||
          parsed.state === null
        ) {
          throw new Error("Invalid draft envelope");
        }
        return raw;
      } catch {
        if (typeof raw === "string") {
          unreadable = raw;
          update("corrupt");
          return null;
        }
        readBlocked = true;
        update("unavailable");
        return null;
      }
    },
    setItem: (name: string, value: T) => {
      pending = { name, value };
      if (status === "saved") update("pending");
      debouncer.maybeExecute();
    },
    removeItem: (name: string) => {
      debouncer.cancel();
      debouncer.reset();
      if (unreadable !== undefined || readBlocked) return;
      try {
        options.storage().removeItem(name);
        pending = undefined;
        update("saved");
      } catch {
        update("unavailable");
      }
    },
    flush,
    retry: flush,
    getStatus: () => status,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    recovery: () => ({
      savedRecord: unreadable ?? null,
      pendingRecord: pending ? options.serialize(pending.value) : null,
    }),
  };
}
