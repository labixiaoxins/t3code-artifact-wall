import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  type StickyProjectIdentity,
  addStickyProjectIdentity,
  removeStickyProjectIdentity,
  moveStickyProjectIdentity,
  moveStickyProjectGroup,
  isIdentityInList,
} from "./stickyProjects.logic";

export interface StickyProjectsStoreState {
  readonly identities: ReadonlyArray<StickyProjectIdentity>;
  readonly addStickyProject: (identity: StickyProjectIdentity) => void;
  readonly removeStickyProject: (identity: StickyProjectIdentity) => void;
  readonly toggleStickyProject: (identity: StickyProjectIdentity) => void;
  readonly moveGroup: (groupKeys: ReadonlyArray<string>, key: string, direction: "up" | "down") => void;
  readonly moveStickyProject: (index: number, direction: "up" | "down") => void;
}

function isValidIdentity(item: unknown): item is StickyProjectIdentity {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as Record<string, unknown>).environmentId === "string" &&
    typeof (item as Record<string, unknown>).projectId === "string" &&
    ((item as Record<string, string>).environmentId ?? "").trim().length > 0 &&
    ((item as Record<string, string>).projectId ?? "").trim().length > 0
  );
}

const memoryStorage = {
  getItem: (_key: string) => null,
  setItem: (_key: string, _value: string) => {},
  removeItem: (_key: string) => {},
};

export const useStickyProjectsStore = create<StickyProjectsStoreState>()(
  persist(
    (set) => ({
      identities: [],
      addStickyProject: (identity) => {
        set((state) => ({
          identities: addStickyProjectIdentity(state.identities, identity),
        }));
      },
      removeStickyProject: (identity) => {
        set((state) => ({
          identities: removeStickyProjectIdentity(state.identities, identity),
        }));
      },
      toggleStickyProject: (identity) => {
        set((state) => ({
          identities: isIdentityInList(state.identities, identity)
            ? removeStickyProjectIdentity(state.identities, identity)
            : addStickyProjectIdentity(state.identities, identity),
        }));
      },
      moveGroup: (groupKeys, key, direction) => {
        set((state) => ({ identities: moveStickyProjectGroup(state.identities, groupKeys, key, direction) }));
      },
      moveStickyProject: (index, direction) => {
        set((state) => ({
          identities: moveStickyProjectIdentity(state.identities, index, direction),
        }));
      },
    }),
    {
      name: "t3code:sticky-projects:v1",
      storage: createJSONStorage(() => {
        try {
          if (typeof window !== "undefined" && window.localStorage) {
            return window.localStorage;
          }
        } catch {
          // ignore error
        }
        return memoryStorage;
      }),
      version: 1,
      merge: (persisted, current) => {
        const raw = persisted && typeof persisted === "object" ? (persisted as { identities?: unknown }).identities : null;
        const identities = Array.isArray(raw) ? raw.filter(isValidIdentity) : [];
        return { ...current, identities: identities.reduce<ReadonlyArray<StickyProjectIdentity>>((list, item) => addStickyProjectIdentity(list, item), []) };
      },
      migrate: (persistedState: unknown) => {
        if (!persistedState || typeof persistedState !== "object") {
          return { identities: [] };
        }
        const state = persistedState as { identities?: unknown };
        if (!Array.isArray(state.identities)) {
          return { identities: [] };
        }
        return {
          identities: state.identities.filter(isValidIdentity),
        };
      },
    },
  ),
);
