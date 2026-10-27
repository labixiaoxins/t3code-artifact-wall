import "~/index.css";
import { expect, it, vi } from "vite-plus/test";
import { page } from "vite-plus/test/browser";
import { render } from "../../../test/render";
import { CouncilRequestAction } from "./CouncilRequestAction";

it("requests a council only after explicit submission and preserves cancellation", async () => {
  const onRequest = vi.fn();
  await using screen = await render(
    <CouncilRequestAction providers={[]} disabled={false} onRequest={onRequest} />,
  );
  await screen.getByRole("button", { name: "发起三方会审" }).click();
  expect(onRequest).not.toHaveBeenCalled();
  expect(page.getByText("当前未配置，不会自动付费补齐", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  expect(onRequest).not.toHaveBeenCalled();
  await screen.getByRole("button", { name: "发起三方会审" }).click();
  await page.getByRole("button", { name: "发送会审请求" }).click();
  expect(onRequest).toHaveBeenCalledTimes(1);
});
