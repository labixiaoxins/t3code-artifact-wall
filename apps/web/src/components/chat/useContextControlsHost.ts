import { useLayoutEffect, useRef } from "react";

// Both composer layouts stay mounted during transitions. Publish only the visible host.
export function useContextControlsHost(
  collapsed: boolean,
  onChange?: (node: HTMLDivElement | null) => void,
) {
  const collapsedHostRef = useRef<HTMLDivElement>(null);
  const expandedHostRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    onChange?.(collapsed ? collapsedHostRef.current : expandedHostRef.current);
    return () => onChange?.(null);
  }, [collapsed, onChange]);
  return { collapsedHostRef, expandedHostRef };
}
