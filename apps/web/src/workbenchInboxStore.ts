import { create } from "zustand";
const KEY = "t3code:workbench-inbox:v1";
type Records = Record<string, string>;
type SavedState = { saved: Records; visits: Records; acknowledgedErrors: Records };
function read(): SavedState {
  const empty = { saved: {}, visits: {}, acknowledgedErrors: {} };
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object") return empty;
    const record = (value: unknown): Records =>
      value && typeof value === "object" && !Array.isArray(value)
        ? Object.fromEntries(
            Object.entries(value).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string",
            ),
          )
        : {};
    return {
      saved: record("saved" in raw ? raw.saved : null),
      visits: record("visits" in raw ? raw.visits : null),
      acknowledgedErrors: record("acknowledgedErrors" in raw ? raw.acknowledgedErrors : null),
    };
  } catch {
    return empty;
  }
}
export const useWorkbenchInboxStore = create<
  SavedState & { update: (field: keyof SavedState, key: string, value: string | null) => boolean }
>((set, get) => ({
  ...read(),
  update: (field, key, value) => {
    const state = get();
    const records = { ...state[field] };
    if (value === null) delete records[key];
    else records[key] = value;
    const next = {
      saved: state.saved,
      visits: state.visits,
      acknowledgedErrors: state.acknowledgedErrors,
      [field]: records,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      return false;
    }
    set(next);
    return true;
  },
}));
if (typeof window !== "undefined")
  window.addEventListener("storage", (event) => {
    if (event.key === KEY || event.key === null) useWorkbenchInboxStore.setState(read());
  });
