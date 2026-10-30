import { expect, it } from "vite-plus/test";
import { render } from "../../test/render";
import { uiTextNodes } from "./rich";

it("switches complete translated sentences without changing names, code or link destinations", async () => {
  const account = "Settings / 用户项目 {0} <script>";
  const content = (locale: "zh-CN" | "en") => (
    <p>
      {uiTextNodes(
        "{0} is not authenticated on this server. Sign in or configure credentials using the {1} tool on the server host to enable change request features.",
        {
          0: account,
          1: (
            <code>
              <a href="https://example.com/auth?next=%2F">glab auth login --host example.com</a>
            </code>
          ),
        },
        locale,
      )}
    </p>
  );
  await using screen = await render(content("zh-CN"));
  await expect.element(screen.getByText(/尚未在此服务器认证/)).toBeVisible();
  expect(screen.container.textContent).toContain(account);
  expect(screen.container.querySelector("script")).toBeNull();
  expect(screen.container.querySelector("code")?.textContent).toBe(
    "glab auth login --host example.com",
  );
  await screen.rerender(content("en"));
  await expect.element(screen.getByText(/is not authenticated on this server/)).toBeVisible();
  expect(screen.container.textContent).toContain(account);
  await expect
    .element(screen.getByRole("link"))
    .toHaveAttribute("href", "https://example.com/auth?next=%2F");
});
