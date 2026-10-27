import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
const EVENT = "t3:spotlight-match";
interface MatchTarget {
  thread: ScopedThreadRef;
  query: string;
  messageId: string;
}
let pending: (MatchTarget & { createdAt: number }) | null = null;
export function requestSpotlightMatch(target: MatchTarget): void {
  pending = { ...target, createdAt: Date.now() };
  window.dispatchEvent(new Event(EVENT));
}
export function consumeSpotlightMatch(thread: ScopedThreadRef): MatchTarget | null {
  if (!pending) return null;
  if (Date.now() - pending.createdAt > 30_000) {
    pending = null;
    return null;
  }
  if (scopedThreadKey(pending.thread) !== scopedThreadKey(thread)) return null;
  const result = pending;
  pending = null;
  return result;
}
export function subscribeSpotlightMatch(listener: () => void): () => void {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
