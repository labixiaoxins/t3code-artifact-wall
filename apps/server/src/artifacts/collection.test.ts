// @effect-diagnostics nodeBuiltinImport:off - fictional local filesystem fixture.
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, describe, expect, it } from "vite-plus/test";
import {
  collectArtifactCandidates,
  artifactReferenceIsFresh,
  resolveArtifactCandidates,
  commandDirectories,
  artifactParentRoots,
  dedupeCandidates,
  excludedArtifactPath,
  referencedPaths,
  resolveArtifactReference,
  type ArtifactRecord,
} from "./collection.ts";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-collection-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
const htmlId = "fiction-11111111-1111-4111-8111-111111111111-html";
fs.writeFileSync(path.join(dir, htmlId + ".html"), "<p>fiction</p>");
const row = (
  payload: Record<string, unknown>,
  createdAt = "2026-10-06T01:00:00Z",
): ArtifactRecord => ({ threadId: "fiction", cwd: "/fiction/work", createdAt, payload });
describe("artifact collection", () => {
  it("associates each of four sources with its record's thread, including structured MCP envelopes", () => {
    const values = collectArtifactCandidates(
      [
        row({
          attachments: [
            {
              type: "image",
              id: "fiction-image",
              name: "cover.png",
              mimeType: "image/png",
              sizeBytes: 1,
            },
          ],
        }),
        row({
          type: "dynamic_tool",
          toolName: "mcp__t3_code__html_render",
          output: {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  htmlRender: { attachmentId: htmlId, title: "示例页面", height: 400 },
                }),
              },
            ],
          },
        }),
        row({
          type: "file_change",
          fileName: "layout.html",
          changes: [{ path: "slides.pptx", operation: "add" }],
        }),
        row({
          type: "command_execution",
          input: "build",
          output: "Saved `/fiction/work/角色 A.png`",
        }),
        row({
          type: "dynamic_tool",
          toolName: "imagegen",
          input: { prompt: "test" },
          output: { file: "./out.png" },
        }),
        row({ role: "assistant", text: "[交付](./final.pdf)" }),
      ],
      dir,
    );
    expect(new Set(values.map((v) => v.source))).toEqual(
      new Set(["attachment", "html", "file_change", "path_reference"]),
    );
    expect(values.every((v) => v.threadId === "fiction")).toBe(true);
    expect(values.map((v) => v.path)).toContain("/fiction/work/角色 A.png");
    expect(values.find((v) => v.source === "html")?.name).toBe("示例页面.html");
    expect(values.map((v) => v.path)).toContain("/fiction/work/slides.pptx");
    expect(
      collectArtifactCandidates(
        [
          row({
            attachments: [
              {
                type: "file",
                id: "fiction-sheet",
                name: "sheet.xls",
                mimeType: "application/vnd.ms-excel",
                sizeBytes: 1,
              },
            ],
          }),
        ],
        dir,
      )[0]?.name,
    ).toBe("sheet.xls");
  });
  it("ignores malformed attachments and unrelated/failed HTML tools", () => {
    const candidates = collectArtifactCandidates(
      [
        row({
          attachments: [{ type: "image", id: "../../oops", name: "a.png", mimeType: "image/png" }],
        }),
        row({
          type: "dynamic_tool",
          toolName: "html_preview",
          output: { htmlRender: { attachmentId: htmlId, title: "bad", height: 400 } },
        }),
        row({
          type: "dynamic_tool",
          toolName: "html_render",
          output: {
            isError: true,
            htmlRender: { attachmentId: htmlId, title: "bad", height: 400 },
          },
        }),
      ],
      dir,
    );
    expect(candidates).toEqual([]);
  });
  it("recognises absolute, cwd-relative, quoted, encoded and nested JSON paths without taking URLs or inline bytes", () => {
    expect(referencedPaths("[角色](</fiction/角色 A.png>)")).toEqual(["/fiction/角色 A.png"]);
    expect(referencedPaths('`/fiction/角色 A.png` "./page.html" /fiction/b.jpg')).toEqual([
      "/fiction/角色 A.png",
      "./page.html",
      "/fiction/b.jpg",
    ]);
    expect(
      referencedPaths(
        JSON.stringify({
          content: [{ text: "Saved `/fiction/out.webp`" }],
          data: "/fiction/bytes.png",
        }),
      ),
    ).toEqual(["/fiction/out.webp"]);
    expect(resolveArtifactReference("https://example.test/a.png", "/fiction")).toBeNull();
    expect(resolveArtifactReference("relative.png", "")).toBeNull();
    expect(resolveArtifactReference("a.exe", "/fiction")).toBeNull();
    expect(resolveArtifactReference("/fiction/a%20b.png", "/fiction")).toBe("/fiction/a b.png");
  });
  it("excludes tmp, cache, git, modules, browser screenshots and configured directories", () => {
    for (const value of [
      "/tmp/a.png",
      "/private/tmp/a.png",
      "/fiction/node_modules/a.png",
      "/fiction/.git/a.png",
      "/fiction/.cache/a.png",
      "/fiction/Library/Caches/a.png",
      "/fiction/browser-artifacts/a.png",
    ])
      expect(excludedArtifactPath(value)).toBe(true);
    expect(excludedArtifactPath("/fiction/outputs/a.png")).toBe(false);
    expect(excludedArtifactPath("/fiction/secret/a.png", ["/fiction/secret"])).toBe(true);
    expect(excludedArtifactPath("/fiction/secret-other/a.png", ["/fiction/secret"])).toBe(false);
  });
  it("dedupes canonical paths, retains first occurrence and structured source, sorts newest first", () => {
    const one = {
      threadId: "fiction",
      path: "/fiction/a.png",
      name: "a.png",
      source: "path_reference" as const,
      createdAt: "2026-10-05T01:00:00Z",
    };
    const result = dedupeCandidates([
      one,
      { ...one, createdAt: "2026-10-06T01:00:00Z", source: "attachment" },
      { ...one, path: "/fiction/b.png", createdAt: "2026-10-06T02:00:00Z" },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe("/fiction/b.png");
    expect(result[1]).toMatchObject({ createdAt: one.createdAt, source: "attachment" });
  });
});

describe("thread-local relative artifact resolution", () => {
  const home = path.join(dir, "fictional-home");
  const workspace = path.join(home, "Documents/content-library");
  const project = path.join(home, "Documents/story-project");
  const output = path.join(project, "02_video");
  const source = path.join(output, "_source-files/v6");
  const movie = path.join(output, "角色介绍_居民_v8_定格版.mp4");
  fs.mkdirSync(source, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });
  fs.writeFileSync(movie, "fictional video");
  const record = (payload: Record<string, unknown>, threadId = "fiction") => ({
    ...row(payload),
    cwd: workspace,
    threadId,
  });
  const options = {
    homeDir: home,
    isFile: async (p: string) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
  };
  it("resolves the real-shaped assistant relative mp4 from command cd ancestors even when message comes first", async () => {
    const result = await resolveArtifactCandidates(
      [
        record({ role: "assistant", text: "`02_video/角色介绍_居民_v8_定格版.mp4`" }),
        record({
          type: "command_execution",
          input: "cd ~/Documents/story-project/02_video/_source-files/v6 && python3 render.py",
        }),
      ],
      dir,
      options,
    );
    expect(result.map((a) => a.path)).toEqual([movie]);
    expect(result[0]?.source).toBe("path_reference");
  });
  it("supports quoted cd operands, tilde, relative chained cd and nested command input", () => {
    expect(
      commandDirectories(
        {
          cmd: `cd "~/Documents/story-project/02_video" && cd '_source-files/v6' && python3 render.py`,
        },
        workspace,
        home,
      ),
    ).toEqual([output, source]);
    expect(commandDirectories(`cd -- '${source}' && python3 render.py`, workspace, home)).toEqual([
      source,
    ]);
    expect(
      commandDirectories('cd "$HOME/private" && cd $(pwd) && cd `pwd`', workspace, home),
    ).toEqual([]);
    expect(commandDirectories('echo "cd /private/elsewhere"', workspace, home)).toEqual([]);
  });
  it("uses cwd before cd roots, and the first existing candidate directory before ancestors", async () => {
    fs.mkdirSync(path.join(workspace, "02_video"), { recursive: true });
    const local = path.join(workspace, "02_video/local.mp4");
    fs.writeFileSync(local, "local");
    fs.writeFileSync(path.join(output, "local.mp4"), "other");
    const result = await resolveArtifactCandidates(
      [
        record({
          type: "command_execution",
          input: `cd '${source}' && build`,
          output: "02_video/local.mp4",
        }),
      ],
      dir,
      options,
    );
    expect(result.map((a) => a.path)).toEqual([local]);
  });
  it("falls back to existing absolute artifact parents but not nonexistent absolute references", async () => {
    const result = await resolveArtifactCandidates(
      [
        record({ role: "assistant", text: "`02_video/角色介绍_居民_v8_定格版.mp4`" }),
        record({ role: "assistant", text: `\`${movie}\`` }),
      ],
      dir,
      options,
    );
    expect(result.map((a) => a.path)).toEqual([movie, movie]);
    const missing = await resolveArtifactCandidates(
      [
        record({ role: "assistant", text: "`02_video/角色介绍_居民_v8_定格版.mp4`" }),
        record({ role: "assistant", text: `\`${output}/absent.mp4\`` }),
      ],
      dir,
      options,
    );
    expect(missing).toEqual([]);
  });
  it("does not borrow another thread's cwd/command/absolute artifact roots", async () => {
    const result = await resolveArtifactCandidates(
      [
        record({ role: "assistant", text: "`02_video/角色介绍_居民_v8_定格版.mp4`" }),
        record({ type: "command_execution", input: `cd '${source}' && build` }, "other"),
        record({ role: "assistant", text: `\`${movie}\`` }, "other"),
      ],
      dir,
      options,
    );
    expect(result.map((a) => a.threadId)).toEqual(["other"]);
  });
  it("bounds inferred roots at home child and rejects outside-home hints", () => {
    expect(artifactParentRoots(source, home)).toEqual([
      source,
      path.dirname(source),
      output,
      project,
      path.join(home, "Documents"),
    ]);
    expect(artifactParentRoots(home, home)).toEqual([]);
    expect(artifactParentRoots(home + "-other/Documents", home)).toEqual([]);
    expect(artifactParentRoots("/outside/fiction", home)).toEqual([]);
  });
  it("dedupes and caps roots at 50, excludes missing files and unsupported extensions", async () => {
    const probes: string[] = [];
    const result = await resolveArtifactCandidates(
      [
        ...Array.from({ length: 80 }, (_, n) =>
          record({ type: "command_execution", input: `cd '${home}/folder${n}/deep' && run` }),
        ),
        record({ role: "assistant", text: "missing.mp4 unsupported.exe missing.mp4" }),
      ],
      dir,
      {
        homeDir: home,
        isFile: async (p) => {
          probes.push(p);
          return false;
        },
      },
    );
    expect(result).toEqual([]);
    expect(probes).toHaveLength(50);
    expect(new Set(probes).size).toBe(50);
  });
  it("honours validation/exclusions before choosing a fallback and cannot infer roots from denied absolute files", async () => {
    const result = await resolveArtifactCandidates(
      [
        record({
          role: "assistant",
          text: `\`${movie}\` \`02_video/角色介绍_居民_v8_定格版.mp4\``,
        }),
      ],
      dir,
      { homeDir: home, isFile: async () => false },
    );
    expect(result).toEqual([]);
  });
});

describe("path reference creation-time gate", () => {
  const created = "2026-10-06T10:00:00Z";
  it("rejects an older file even if quoted by a new message", () => {
    expect(artifactReferenceIsFresh("path_reference", Date.parse("2026-09-24"), created)).toBe(
      false,
    );
  });
  it("accepts a newly changed file and exactly five minutes of clock tolerance", () => {
    const at = Date.parse(created);
    expect(artifactReferenceIsFresh("path_reference", at, created)).toBe(true);
    expect(artifactReferenceIsFresh("path_reference", at - 300000, created)).toBe(true);
    expect(artifactReferenceIsFresh("path_reference", at - 300001, created)).toBe(false);
  });
  it.each(["attachment", "html", "file_change"] as const)(
    "keeps explicit %s artifacts regardless of old mtime",
    (source) => {
      expect(artifactReferenceIsFresh(source, 0, created)).toBe(true);
    },
  );
  it("fails closed for missing/invalid thread creation timestamps on inferred references", () => {
    expect(artifactReferenceIsFresh("path_reference", Date.parse(created), "")).toBe(false);
    expect(artifactReferenceIsFresh("path_reference", NaN, created)).toBe(false);
  });
  it("collects user text references with the same inferred provenance", () => {
    expect(
      collectArtifactCandidates(
        [
          row({ role: "user", text: "参考 ./old.png" }),
          row({ type: "user_message", text: "查看 ./new.png" }),
        ],
        dir,
      ).map((candidate) => candidate.source),
    ).toEqual(["path_reference", "path_reference"]);
  });
});
