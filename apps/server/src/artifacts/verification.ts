// @effect-diagnostics nodeBuiltinImport:off - descriptor-bound versions and bounded private receipt files.
import * as NodeCrypto from "node:crypto";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import type * as NodeFS from "node:fs";
import type { WallArtifactVerification } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

const Receipt = Schema.Struct({
  revision: Schema.String,
  sha256: Schema.String,
  status: Schema.Literals(["passed", "failed"]),
  label: Schema.String.check(Schema.isMaxLength(160)),
  checkedAt: Schema.String,
  evidenceItemId: Schema.String,
});
export type ArtifactCheckReceipt = typeof Receipt.Type;
const decodeReceipt = Schema.decodeUnknownSync(Schema.fromJsonString(Receipt));
const encodeReceipt = Schema.encodeSync(Schema.fromJsonString(Receipt));

/** Metadata identity is cheap enough for the wall. A recorded check also hashes
 * the held descriptor; ctime prevents restoring mtime from reviving old checks. */
export function artifactRevision(stat: NodeFS.BigIntStats): string {
  return NodeCrypto.createHash("sha256")
    .update([stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(":"))
    .digest("hex");
}

function receiptPath(baseDir: string, threadId: string, path: string) {
  const key = NodeCrypto.createHash("sha256")
    .update(JSON.stringify([threadId, path]))
    .digest("hex");
  return NodePath.join(baseDir, "artifact-checks", `${key}.json`);
}

export async function readArtifactVerification(
  baseDir: string,
  threadId: string,
  path: string,
  revision: string,
): Promise<WallArtifactVerification> {
  let file: NodeFSP.FileHandle | undefined;
  try {
    file = await NodeFSP.open(receiptPath(baseDir, threadId, path), "r");
    const stat = await file.stat();
    if (!stat.isFile() || stat.size > 16_384) return { status: "unverified" };
    const buffer = new Uint8Array(16_385);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    if (bytesRead > 16_384) return { status: "unverified" };
    const receipt = decodeReceipt(new TextDecoder().decode(buffer.subarray(0, bytesRead)));
    return {
      status: receipt.revision === revision ? receipt.status : "stale",
      label: receipt.label,
      checkedAt: receipt.checkedAt,
      evidenceItemId: receipt.evidenceItemId,
    };
  } catch {
    // Missing, corrupt or inaccessible evidence must never look like a pass.
    return { status: "unverified" };
  } finally {
    await file?.close();
  }
}

export async function writeArtifactCheck(
  baseDir: string,
  threadId: string,
  path: string,
  receipt: ArtifactCheckReceipt,
) {
  const target = receiptPath(baseDir, threadId, path);
  await NodeFSP.mkdir(NodePath.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${NodeCrypto.randomUUID()}.tmp`;
  try {
    await NodeFSP.writeFile(temporary, encodeReceipt(receipt), { mode: 0o600, flag: "wx" });
    await NodeFSP.rename(temporary, target);
  } finally {
    await NodeFSP.unlink(temporary).catch(() => undefined);
  }
}
