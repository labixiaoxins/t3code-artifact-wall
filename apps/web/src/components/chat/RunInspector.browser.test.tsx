import { expect, it } from "vite-plus/test";
import { render } from "../../../test/render";
import { RunQuota } from "./RunInspector";

it("shows unreadable quota without inventing 0 or available", async () => {
  await using screen = await render(<RunQuota limits={undefined} connected now={0} />);
  expect(screen.container.textContent).toContain("Temporarily unreadable");
  expect(screen.container.textContent).not.toContain("0%");
  expect(screen.container.textContent).not.toContain("available");
});
it("labels failed cached windows as last known", async () => {
  const limits = {
    checkedAt: "2026-10-26T00:00:00Z",
    unavailable: { reason: "probeFailed" as const },
    windows: [{ id: "weekly", label: "Weekly", kind: "weekly" as const, usedPercent: 60 }],
  };
  await using screen = await render(
    <RunQuota limits={limits} connected now={Date.parse(limits.checkedAt)} />,
  );
  expect(screen.container.textContent).toContain("Last known");
  expect(screen.container.textContent).toContain("40% remaining");
  expect(screen.container.textContent).toContain("Temporarily unreadable");
});
