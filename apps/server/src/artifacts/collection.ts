// @effect-diagnostics nodeBuiltinImport:off - pure platform path parsing, shared by the collector tests.
import * as NodePath from "node:path";
import type { ChatAttachment, WallArtifact } from "@t3tools/contracts";
import { htmlRenderFromToolItem } from "@t3tools/shared/toolOutput";
import { resolveAttachmentPath, resolveAttachmentPathById } from "../attachmentStore.ts";

export interface ArtifactRecord {
  threadId: string;
  cwd: string;
  createdAt: string;
  payload: Record<string, unknown>;
}
interface ReferenceCandidate extends ArtifactCandidate {
  reference: string;
  cwd: string;
}
export interface ArtifactCandidate {
  threadId: string;
  path: string;
  name: string;
  source: WallArtifact["source"];
  createdAt: string;
}
const EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "html", "pdf", "pptx", "mp4"]);
export function artifactKind(extension: string): WallArtifact["kind"] {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(extension)
    ? "image"
    : extension === "html"
      ? "page"
      : "document";
}
export function excludedArtifactPath(path: string, extraRoots: readonly string[] = []): boolean {
  return (
    /(?:^|\/)(?:node_modules|\.git|\.cache|caches?|browser-artifacts)(?:\/|$)/i.test(path) ||
    path === "/tmp" ||
    path.startsWith("/tmp/") ||
    path === "/private/tmp" ||
    path.startsWith("/private/tmp/") ||
    extraRoots.some((root) => path === root || path.startsWith(root.replace(/\/$/, "") + "/"))
  );
}
export function resolveArtifactReference(value: string, cwd: string): string | null {
  let decoded = value.trim();
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    /* Plain filenames can contain percent. */
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(decoded) || decoded.includes("\0")) return null;
  if (!NodePath.isAbsolute(decoded) && !NodePath.isAbsolute(cwd)) return null;
  const path = NodePath.resolve(cwd, decoded);
  const extension = NodePath.extname(path).slice(1).toLowerCase();
  return EXTENSIONS.has(extension) ? path : null;
}
/** Quoted/Markdown paths retain spaces; bare paths are intentionally conservative. */
export function referencedPaths(value: unknown): string[] {
  const paths: string[] = [];
  const visit = (item: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof item === "string") {
      // Providers occasionally store JSON envelopes as text. Unwrap before scanning.
      if (/^\s*[\[{]/.test(item)) {
        try {
          const parsed: unknown = JSON.parse(item);
          visit(parsed, depth + 1);
          return;
        } catch {
          /* prose */
        }
      }
      const pattern =
        /\]\(<?([^\n]*?\.(?:png|jpe?g|webp|gif|html|pdf|pptx|mp4))(?:\:\d+)?>?\)|[`"']([^\n`"']*?\.(?:png|jpe?g|webp|gif|html|pdf|pptx|mp4))[`"']|(?:^|[\s=(])((?:\/|\.\.?\/)?[^\s<>`"'()[\]{}:,;]+\.(?:png|jpe?g|webp|gif|html|pdf|pptx|mp4))(?=$|[\s)\],;:.])/gim;
      for (const match of item.matchAll(pattern)) {
        const path = (match[1] ?? match[2] ?? match[3])?.replace(/^<|>$/g, "");
        if (path) paths.push(path);
      }
    } else if (Array.isArray(item)) item.forEach((entry) => visit(entry, depth + 1));
    else if (typeof item === "object" && item !== null) {
      for (const [key, entry] of Object.entries(item)) {
        // Inline image bytes never belong in path scanning.
        if (!["data", "base64", "diffStr", "oldStr", "newStr"].includes(key))
          visit(entry, depth + 1);
      }
    }
  };
  visit(value, 0);
  return paths;
}
export function collectArtifactCandidates(
  records: readonly ArtifactRecord[],
  attachmentsDir: string,
): ReferenceCandidate[] {
  const candidates: ReferenceCandidate[] = [];
  const add = (
    row: ArtifactRecord,
    value: string,
    source: WallArtifact["source"],
    name?: string,
  ) => {
    const path =
      source === "attachment" && NodePath.isAbsolute(value)
        ? NodePath.normalize(value)
        : resolveArtifactReference(value, row.cwd);
    if (path)
      candidates.push({
        threadId: row.threadId,
        reference: value,
        cwd: row.cwd,
        path,
        name: name ?? NodePath.basename(path),
        source,
        createdAt: row.createdAt,
      });
  };
  for (const row of records) {
    const p = row.payload;
    if (Array.isArray(p.attachments)) {
      for (const value of p.attachments) {
        const a = value as Partial<ChatAttachment>;
        if (
          (a.type !== "image" && a.type !== "file") ||
          typeof a.id !== "string" ||
          typeof a.name !== "string" ||
          typeof a.mimeType !== "string"
        )
          continue;
        const path = resolveAttachmentPath({ attachmentsDir, attachment: a as ChatAttachment });
        if (path) add(row, path, "attachment", a.name);
      }
    }
    if (p.type === "dynamic_tool") {
      const html = htmlRenderFromToolItem({
        toolName: typeof p.toolName === "string" ? p.toolName : null,
        output: p.output,
      });
      if (html) {
        const path = resolveAttachmentPathById({ attachmentsDir, attachmentId: html.attachmentId });
        if (path) add(row, path, "html", html.title + ".html");
      }
    }
    if (p.type === "file_change") {
      const changes = Array.isArray(p.changes) ? p.changes : [];
      if (typeof p.fileName === "string") add(row, p.fileName, "file_change");
      for (const change of changes) {
        if (
          typeof change === "object" &&
          change !== null &&
          "path" in change &&
          typeof change.path === "string"
        )
          add(row, change.path, "file_change");
      }
    }
    if (
      p.type === "command_execution" ||
      p.type === "dynamic_tool" ||
      p.type === "assistant_message" ||
      p.type === "user_message" ||
      p.role === "assistant" ||
      p.role === "user"
    ) {
      const texts =
        p.type === "command_execution" || p.type === "dynamic_tool"
          ? [p.input, p.output]
          : [p.text];
      for (const value of texts)
        for (const path of referencedPaths(value)) add(row, path, "path_reference");
    }
  }
  return candidates;
}
/** Parse literal cd operands only; never execute shell text or expand variables/substitutions. */
export function commandDirectories(input: unknown, cwd: string, homeDir: string): string[] {
  const directories: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 12) return;
    if (typeof value === "string") {
      if (/^\s*[\[{]/.test(value)) {
        try {
          visit(JSON.parse(value), depth + 1);
          return;
        } catch {
          /* shell text */
        }
      }
      let current = cwd;
      // Recognise command boundaries, && chains and quoted/escaped spaces.
      const cd = /(?:^|&&|\|\||[;\n])\s*cd\s+(?:--\s+)?("[^"\n]*"|'[^'\n]*'|(?:\\.|[^\s;&|])+)/g;
      for (const match of value.matchAll(cd)) {
        let operand = match[1]!;
        if (/[$`]/.test(operand)) continue;
        operand = operand.replace(/^(["'])(.*)\1$/, "$2").replace(/\\([\s\\"'])/g, "$1");
        if (operand === "~" || operand.startsWith("~/")) operand = homeDir + operand.slice(1);
        if (!NodePath.isAbsolute(operand) && !NodePath.isAbsolute(current)) continue;
        current = NodePath.resolve(current, operand);
        directories.push(current);
      }
    } else if (Array.isArray(value)) value.forEach((v) => visit(v, depth + 1));
    else if (typeof value === "object" && value !== null)
      for (const [key, entry] of Object.entries(value))
        if (!["data", "base64", "output", "diffStr", "oldStr", "newStr"].includes(key))
          visit(entry, depth + 1);
  };
  visit(input, 0);
  return directories;
}
/** Stay inside home, stopping at its immediate child. Never add home itself as a search root. */
export function artifactParentRoots(directory: string, homeDir: string): string[] {
  const home = NodePath.resolve(homeDir);
  let current = NodePath.resolve(directory);
  const roots: string[] = [];
  while (current.startsWith(home + NodePath.sep) && roots.length < 50) {
    roots.push(current);
    current = NodePath.dirname(current);
  }
  return roots;
}
/** Two passes keep inferred roots thread-local and independent of message traversal order. */
export async function resolveArtifactCandidates(
  records: readonly ArtifactRecord[],
  attachmentsDir: string,
  options: { homeDir: string; isFile: (path: string) => Promise<boolean> },
): Promise<ArtifactCandidate[]> {
  const raw = collectArtifactCandidates(records, attachmentsDir);
  const roots = new Map<string, Set<string>>();
  const rootsFor = (threadId: string) => {
    let set = roots.get(threadId);
    if (!set) {
      set = new Set();
      roots.set(threadId, set);
    }
    return set;
  };
  const addRoots = (threadId: string, directory: string) => {
    const set = rootsFor(threadId);
    for (const root of artifactParentRoots(directory, options.homeDir)) {
      if (set.size >= 50) break;
      set.add(root);
    }
  };
  // Reserve cwd first, then command roots, then validated absolute artifact roots.
  for (const row of records)
    if (NodePath.isAbsolute(row.cwd) && rootsFor(row.threadId).size < 50)
      rootsFor(row.threadId).add(NodePath.resolve(row.cwd));
  for (const row of records)
    if (row.payload.type === "command_execution" || row.payload.type === "dynamic_tool")
      for (const directory of commandDirectories(row.payload.input, row.cwd, options.homeDir))
        addRoots(row.threadId, directory);
  const checked = new Map<string, Promise<boolean>>();
  const exists = (path: string) => {
    let check = checked.get(path);
    if (!check) {
      check = options.isFile(path);
      checked.set(path, check);
    }
    return check;
  };
  const expanded = (value: string) => {
    let decoded = value.trim();
    try {
      decoded = decodeURIComponent(decoded);
    } catch {
      /* literal percent */
    }
    return decoded.startsWith("~/") ? options.homeDir + decoded.slice(1) : decoded;
  };
  for (const candidate of raw) {
    const reference = expanded(candidate.reference);
    const path =
      candidate.source === "attachment"
        ? candidate.path
        : resolveArtifactReference(reference, candidate.cwd);
    if (NodePath.isAbsolute(reference) && path && (await exists(path)))
      addRoots(candidate.threadId, NodePath.dirname(path));
  }
  const resolved: ArtifactCandidate[] = [];
  for (const { reference: value, cwd, ...candidate } of raw) {
    const reference = expanded(value);
    const bases = NodePath.isAbsolute(reference)
      ? [cwd]
      : [...rootsFor(candidate.threadId)].slice(0, 50);
    for (const base of bases) {
      // Structured attachments retain their existing extension policy.
      const path =
        candidate.source === "attachment" && NodePath.isAbsolute(reference)
          ? candidate.path
          : resolveArtifactReference(reference, base);
      if (path && (await exists(path))) {
        resolved.push({ ...candidate, path });
        break;
      }
    }
  }
  return resolved;
}

/** Dedupe after canonicalisation/existence checks; keep the first timestamp and strongest provenance. */
export function dedupeCandidates(candidates: readonly ArtifactCandidate[]): ArtifactCandidate[] {
  const priority = { attachment: 0, html: 1, file_change: 2, path_reference: 3 };
  const byPath = new Map<string, ArtifactCandidate>();
  for (const c of [...candidates].sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.threadId.localeCompare(b.threadId),
  )) {
    const previous = byPath.get(c.path);
    if (!previous) byPath.set(c.path, c);
    else if (priority[c.source] < priority[previous.source])
      byPath.set(c.path, { ...previous, source: c.source, name: c.name });
  }
  return [...byPath.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.path.localeCompare(b.path),
  );
}

/** Only inferred references need proof that the file was made/changed during this thread. */
export function artifactReferenceIsFresh(
  source: WallArtifact["source"],
  mtimeMs: number,
  threadCreatedAt: string,
): boolean {
  if (source !== "path_reference") return true;
  const createdAt = Date.parse(threadCreatedAt);
  return (
    Number.isFinite(createdAt) && Number.isFinite(mtimeMs) && mtimeMs >= createdAt - 5 * 60_000
  );
}
