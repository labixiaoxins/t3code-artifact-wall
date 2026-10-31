import { expect, it } from "vite-plus/test";
import { userEvent } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import type { TaskProgressSnapshot } from "../../taskProgress";
import { TaskProgressSteps } from "./TaskProgressSteps";

function progress(current: number): TaskProgressSnapshot {
  return {
    steps: Array.from({ length: 9 }, (_, index) => ({
      id: String(index),
      text: `Step ${index + 1}`,
      status: index < current ? "completed" : index === current ? "running" : "pending",
    })),
    completed: current,
    total: 9,
    remaining: 9 - current,
    state: "running",
    stale: false,
  };
}

it("keeps the current step visible in a compact window as progress advances", async () => {
  await using screen = await render(<TaskProgressSteps progress={progress(2)} compact />);
  await expect.element(screen.getByText("Step 3", { exact: true })).toBeVisible();
  await screen.rerender(<TaskProgressSteps progress={progress(7)} compact />);
  await expect.element(screen.getByText("Step 8", { exact: true })).toBeVisible();
  expect(screen.container.querySelector('[aria-current="step"]')?.textContent).toContain("Step 8");
  expect(
    screen.container.querySelectorAll("ol li[aria-current], ol li:has([dir=auto])"),
  ).toHaveLength(5);
  await expect.element(screen.getByText("4 earlier steps")).toBeVisible();
});

it("collapses with the keyboard while keeping live completion counts visible", async () => {
  await using screen = await render(<TaskProgressSteps progress={progress(2)} />);
  await userEvent.tab();
  await userEvent.keyboard("{Enter}");
  await expect
    .element(screen.getByRole("button", { name: "Task steps 2/9 completed" }))
    .toHaveAttribute("aria-expanded", "false");
  await expect.element(screen.container.querySelector("ol")!).not.toBeVisible();
  await screen.rerender(<TaskProgressSteps progress={{ ...progress(3), state: "approval" }} />);
  await expect
    .element(screen.getByRole("button", { name: "Task steps 3/9 completed" }))
    .toBeVisible();
  await expect
    .element(screen.getByText("Waiting for approval", { exact: true }).first())
    .toBeVisible();
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByText("Step 4", { exact: true })).toBeVisible();
});
