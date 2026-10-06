import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, type WallArtifact } from "@t3tools/contracts";
import { artifactFileUrl, fileFromArtifact, loadWallArtifacts } from "./artifactWallClient";

const mocks = vi.hoisted(() => ({
  connection: vi.fn(),
  desktopToken: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../state/session", () => ({ readPreparedConnection: mocks.connection }));
vi.mock("../environments/primary/desktopAuth", () => ({
  readDesktopPrimaryBearerToken: mocks.desktopToken,
}));

const environment = EnvironmentId.make("fixture-environment");
const artifact: WallArtifact = {
  id: "fixture-capability",
  name: "示例.png",
  path: "/fixture/示例.png",
  threadId: "fixture-thread",
  kind: "image",
  source: "attachment",
  extension: "png",
  createdAt: "2026-10-06T00:00:00.000Z",
  sizeBytes: 3,
};
const connection = (
  authorization: unknown = { _tag: "Bearer", token: "fixture-bearer" },
  primary = true,
) => ({
  httpBaseUrl: "http://127.0.0.1:5747",
  httpAuthorization: authorization,
  target: { _tag: primary ? "PrimaryConnectionTarget" : "BearerConnectionTarget" },
});
const load = (signal = new AbortController().signal) =>
  loadWallArtifacts(environment, "fixture-thread", "thread", signal);
describe("artifact wall environment authentication", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("window", { location: { href: "t3code://app/", origin: "t3code://app" } });
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.connection.mockReturnValue(connection());
    mocks.fetch.mockResolvedValue(Response.json({ artifacts: [artifact] }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("reads cross-origin desktop lists with a bearer and no ambient cookies", async () => {
    await expect(load()).resolves.toEqual([artifact]);
    const [url, init] = mocks.fetch.mock.calls[0]!;
    expect(new URL(url).origin).toBe("http://127.0.0.1:5747");
    expect(new URL(url).searchParams.get("threadId")).toBe("fixture-thread");
    expect(init.credentials).toBe("omit");
    expect(init.headers.Authorization).toBe("Bearer fixture-bearer");
    expect(mocks.desktopToken).not.toHaveBeenCalled();
  });
  it("reuses primary desktop auth when the prepared connection has no bearer", async () => {
    mocks.connection.mockReturnValue(connection(null));
    window.desktopBridge = {} as NonNullable<typeof window.desktopBridge>;
    mocks.desktopToken.mockResolvedValue("fixture-desktop-token");
    await load();
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({
      credentials: "omit",
      headers: { Authorization: "Bearer fixture-desktop-token" },
    });
  });
  it("reports missing desktop authorization before any list request", async () => {
    mocks.connection.mockReturnValue(connection(null));
    window.desktopBridge = {} as NonNullable<typeof window.desktopBridge>;
    mocks.desktopToken.mockResolvedValue(null);
    await expect(load()).rejects.toThrow("本机连接未授权，请重新连接后重试");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("reports desktop bridge failures in Chinese", async () => {
    mocks.connection.mockReturnValue(connection(null));
    window.desktopBridge = {} as NonNullable<typeof window.desktopBridge>;
    mocks.desktopToken.mockRejectedValue(new Error("IPC failure"));
    await expect(load()).rejects.toThrow("无法读取本机授权，请重新连接后重试");
  });
  it("does not send a primary desktop token to a secondary connection", async () => {
    mocks.connection.mockReturnValue(connection(null, false));
    window.desktopBridge = {} as NonNullable<typeof window.desktopBridge>;
    await load();
    expect(mocks.desktopToken).not.toHaveBeenCalled();
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
  });
  it("keeps browser cookie/session auth for same-origin connections", async () => {
    mocks.connection.mockReturnValue(connection(null));
    vi.stubGlobal("window", {
      location: { href: "http://127.0.0.1:5747/", origin: "http://127.0.0.1:5747" },
    });
    await load();
    expect(mocks.fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: "include" });
    expect(mocks.fetch.mock.calls[0]?.[1].headers).toBeUndefined();
  });
  it("explains unsupported cross-origin cookie sessions without claiming an empty wall", async () => {
    mocks.connection.mockReturnValue(connection(null));
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(load()).rejects.toThrow("此连接的登录状态无法跨来源读取，请使用本机连接后重试");
  });
  it.each([
    [401, "连接授权已失效，请重新连接后重试"],
    [403, "此连接无权读取产物"],
    [500, "暂时无法读取产物，请重试"],
  ])("reports list HTTP %s in Chinese", async (status, message) => {
    mocks.fetch.mockResolvedValue(new Response(null, { status }));
    await expect(load()).rejects.toThrow(message);
  });
  it("translates transport failures", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(load()).rejects.toThrow("暂时无法连接产物服务，请重试");
  });
  it("rejects malformed data instead of treating it as no artifacts", async () => {
    mocks.fetch.mockResolvedValue(Response.json({ unexpected: [] }));
    await expect(load()).rejects.toThrow("产物数据读取失败，请重试");
  });
  it("preserves abort cancellation", async () => {
    const controller = new AbortController();
    const error = new DOMException("aborted", "AbortError");
    controller.abort();
    mocks.fetch.mockRejectedValue(error);
    await expect(load(controller.signal)).rejects.toBe(error);
  });
  it("blocks remote and DPoP origins without sending credentials", async () => {
    mocks.connection.mockReturnValue({ ...connection(), httpBaseUrl: "https://remote.test" });
    await expect(load()).rejects.toThrow("产物墙仅在本机连接可用");
    mocks.connection.mockReturnValue(connection({ _tag: "Dpop" }));
    expect(artifactFileUrl(environment, artifact.id)).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("downloads capability files without cookies or authorization, matching thumbnails", async () => {
    mocks.fetch.mockResolvedValue(
      new Response("png", { headers: { "Content-Type": "image/png" } }),
    );
    const file = await fileFromArtifact(environment, artifact);
    expect(file.name).toBe("示例.png");
    expect(file.type).toBe("image/png");
    expect(file.size).toBe(3);
    expect(mocks.fetch.mock.calls[0]).toEqual([
      artifactFileUrl(environment, artifact.id),
      { credentials: "omit" },
    ]);
  });
  it("reports expired file capabilities", async () => {
    mocks.fetch.mockResolvedValue(new Response(null, { status: 403 }));
    await expect(fileFromArtifact(environment, artifact)).rejects.toThrow(
      "文件已失效，请刷新产物墙",
    );
  });
  it("translates file network and body failures", async () => {
    mocks.fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(fileFromArtifact(environment, artifact)).rejects.toThrow(
      "暂时无法连接产物服务，请重试",
    );
    mocks.fetch.mockResolvedValue({
      ok: true,
      blob: () => Promise.reject(new Error("stream failed")),
    });
    await expect(fileFromArtifact(environment, artifact)).rejects.toThrow("文件读取失败，请重试");
  });
});
