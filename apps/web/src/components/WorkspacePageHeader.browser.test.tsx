import { describe, expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../test/render";
import "~/index.css";

vi.mock("./usage/QuotaTopbar", () => ({
  QuotaTopbar: () => <div data-testid="quota-topbar" />,
}));

import { WorkspacePageHeader } from "./WorkspacePageHeader";

describe("WorkspacePageHeader", () => {
  it("shows the quota pill by default", async () => {
    await using _screen = await render(<WorkspacePageHeader>Title</WorkspacePageHeader>);
    await expect.element(page.getByTestId("quota-topbar")).toBeInTheDocument();
  });

  it("omits the quota pill when showQuota is false (usage page)", async () => {
    await using screen = await render(
      <WorkspacePageHeader showQuota={false}>Usage</WorkspacePageHeader>,
    );
    await expect.element(page.getByText("Usage")).toBeInTheDocument();
    expect(screen.container.querySelector('[data-testid="quota-topbar"]')).toBeNull();
  });
});
