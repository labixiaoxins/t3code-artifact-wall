import { expect, it, vi } from "vite-plus/test";
import { act, render } from "../../../test/render";
import { useWorkPresets } from "./useWorkPresets";
import { CHANGE_MAX_AGE, WORKBENCH_KEY, type WorkbenchState } from "./workPresets";

function History() {
  const state = useWorkPresets();
  return (
    <output data-count={state.changes.length}>
      {state.changes.map((change) => change.id).join(",")}
    </output>
  );
}

it("filters retained history when writes fail and refreshes for new storage records", async () => {
  const now = 1_800_000_000_000;
  const change = (id: string, at: number) => ({
    id,
    at,
    environmentId: "environment",
    presetId: "preset",
    before: null,
    after: null,
    undone: false,
  });
  const fresh = Array.from({ length: 202 }, (_, index) => change(`record-${index}`, now - 1));
  let stored: WorkbenchState = {
    scopes: {},
    changes: [change("expired", now - CHANGE_MAX_AGE), ...fresh, change("future", now + 10_000)],
  };
  using clock = vi.spyOn(Date, "now").mockReturnValue(now);
  using _read = vi
    .spyOn(Storage.prototype, "getItem")
    .mockImplementation((key) => (key === WORKBENCH_KEY ? JSON.stringify(stored) : null));
  using _write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Read-only storage", "QuotaExceededError");
  });
  await using screen = await render(<History />);
  await expect.element(screen.getByRole("status")).toHaveTextContent(
    fresh
      .slice(-200)
      .map((entry) => entry.id)
      .join(","),
  );
  await expect.element(screen.getByRole("status")).toHaveAttribute("data-count", "200");
  await expect.element(screen.getByRole("status")).not.toHaveTextContent("expired");
  await expect.element(screen.getByRole("status")).not.toHaveTextContent("future");

  await act(() => {
    clock.mockReturnValue(now + 20_000);
    stored = { scopes: {}, changes: [change("new-record", now + 20_000)] };
    window.dispatchEvent(
      new CustomEvent("t3code:local_storage_change", { detail: { key: WORKBENCH_KEY } }),
    );
  });
  await expect.element(screen.getByRole("status")).toHaveTextContent("new-record");
});
