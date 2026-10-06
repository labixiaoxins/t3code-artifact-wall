import { WallArtifactList, type EnvironmentId, type WallArtifact } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { readPreparedConnection } from "../state/session";
import { readDesktopPrimaryBearerToken } from "../environments/primary/desktopAuth";

class ArtifactWallError extends Error {}

async function listRequestInit(environmentId: EnvironmentId): Promise<RequestInit> {
  const connection = readPreparedConnection(environmentId);
  if (!connection) throw new ArtifactWallError("连接尚未就绪，请稍后重试");
  let token =
    connection.httpAuthorization?._tag === "Bearer" ? connection.httpAuthorization.token : null;
  // Primary HTTP calls use the same desktop bridge when the prepared session has no bearer.
  if (!token && connection.target._tag === "PrimaryConnectionTarget" && window.desktopBridge) {
    try {
      token = await readDesktopPrimaryBearerToken();
    } catch {
      throw new ArtifactWallError("无法读取本机授权，请重新连接后重试");
    }
    if (!token) throw new ArtifactWallError("本机连接未授权，请重新连接后重试");
  }
  return token
    ? { credentials: "omit", headers: { Authorization: `Bearer ${token}` } }
    : { credentials: "include" };
}

async function wallFetch(url: URL | string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (init.signal?.aborted) throw error;
    const crossOriginCookie =
      init.credentials === "include" &&
      new URL(url, window.location.href).origin !== window.location.origin;
    throw new ArtifactWallError(
      crossOriginCookie
        ? "此连接的登录状态无法跨来源读取，请使用本机连接后重试"
        : "暂时无法连接产物服务，请重试",
    );
  }
}

export function artifactWallOrigin(environmentId: EnvironmentId): string | null {
  const connection = readPreparedConnection(environmentId);
  if (!connection || connection.httpAuthorization?._tag === "Dpop") return null;
  const origin = new URL(connection.httpBaseUrl, window.location.href);
  return ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname) ? origin.href : null;
}
export function artifactFileUrl(environmentId: EnvironmentId, id: string): string | null {
  const origin = artifactWallOrigin(environmentId);
  return origin ? new URL(`/api/artifact-wall/file/${encodeURIComponent(id)}`, origin).href : null;
}
export async function loadWallArtifacts(
  environmentId: EnvironmentId,
  threadId: string,
  scope: "thread" | "project",
  signal: AbortSignal,
) {
  const origin = artifactWallOrigin(environmentId);
  if (!origin) throw new ArtifactWallError("产物墙仅在本机连接可用");
  const url = new URL("/api/artifact-wall/list", origin);
  url.searchParams.set("threadId", threadId);
  url.searchParams.set("scope", scope);
  const response = await wallFetch(url, { ...(await listRequestInit(environmentId)), signal });
  if (response.status === 401) throw new ArtifactWallError("连接授权已失效，请重新连接后重试");
  if (response.status === 403) throw new ArtifactWallError("此连接无权读取产物");
  if (!response.ok) throw new ArtifactWallError("暂时无法读取产物，请重试");
  try {
    return Schema.decodeUnknownSync(WallArtifactList)(await response.json()).artifacts;
  } catch {
    throw new ArtifactWallError("产物数据读取失败，请重试");
  }
}
export async function fileFromArtifact(
  environmentId: EnvironmentId,
  artifact: WallArtifact,
): Promise<File> {
  const url = artifactFileUrl(environmentId, artifact.id);
  if (!url) throw new Error("产物墙仅在本机连接可用");
  // This route authenticates the collected, expiring capability ID (as images do).
  const response = await wallFetch(url, { credentials: "omit" });
  if (!response.ok) throw new Error("文件已失效，请刷新产物墙");
  try {
    const blob = await response.blob();
    return new File([blob], artifact.name, { type: blob.type });
  } catch {
    throw new ArtifactWallError("文件读取失败，请重试");
  }
}
