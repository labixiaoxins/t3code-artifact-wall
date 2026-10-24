let value: string | null = null;
const listeners = new Set<() => void>();
export const manualClipboard = {
  getSnapshot: () => value,
  subscribe: (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  reveal: (text: string) => {
    value = text;
    for (const listener of listeners) listener();
  },
  clear: () => {
    value = null;
    for (const listener of listeners) listener();
  },
};
