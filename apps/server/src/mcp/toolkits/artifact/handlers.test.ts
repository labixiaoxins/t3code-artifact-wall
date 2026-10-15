// @effect-diagnostics preferSchemaOverJson:off - inspecting the MCP failure envelope in tests.
import { expect, it } from "@effect/vitest";
import { EnvironmentId, ProviderInstanceId, ThreadId, type WallArtifact } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { McpSchema, McpServer } from "effect/ai";
import * as ArtifactWall from "../../../artifacts/ArtifactWall.ts";
import * as Threads from "../../../orchestration-v2/ThreadManagementService.ts";
import * as McpHttpServer from "../../McpHttpServer.ts";
import * as Invocation from "../../McpInvocationContext.ts";
import { liveThreadShell } from "../../McpToolAccess.testkit.ts";

const threadId = ThreadId.make("artifact-caller");
const scope: Invocation.McpInvocationScope = {
  environmentId: EnvironmentId.make("artifact-test"),
  requestNamespace: "test",
  thread: {
    threadId,
    providerSessionId: "test",
    providerInstanceId: ProviderInstanceId.make("codex"),
  },
  client: undefined,
  issuedAt: 0,
  capabilities: new Set(["orchestration"]),
};
const client = McpSchema.McpServerClient.of({
  clientId: 1,
  protocolVersion: "2025-06-18",
  clientCapabilities: {},
  clientInfo: { name: "artifact-test", version: "1" },
  initializePayload: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "artifact-test", version: "1" },
  },
  getClient: Effect.die("unused"),
});
const artifacts: WallArtifact[] = Array.from({ length: 45 }, (_, n) => ({
  id: `file:${n}`,
  threadId,
  path: `/fixture/result-${n}.pdf`,
  name: `result-${n}.pdf`,
  kind: "document",
  source: "file_change",
  extension: "pdf",
  sizeBytes: 1,
  createdAt: "2026-10-12T00:00:00Z",
}));

it.effect.each([true, false])(
  "artifact records require the caller's active thread: active=%s",
  (active) => {
    const recorded: string[] = [];
    const services = Layer.mergeAll(
      Layer.mock(Threads.ThreadManagementService)({
        getThreadShell: (id) =>
          Effect.succeed(liveThreadShell(id, active ? {} : { activeRunId: null })),
      }),
      Layer.mock(ArtifactWall.ArtifactWall)({
        list: (id) =>
          Effect.sync(() => {
            expect(id).toBe(threadId);
            return artifacts;
          }),
        recordCheck: (input) =>
          Effect.sync(() => {
            recorded.push(input.threadId);
            return { status: "passed" as const };
          }),
      }),
    );
    return Effect.gen(function* () {
      const server = yield* McpServer.McpServer;
      const call = (name: string, args: Record<string, unknown>) =>
        server
          .callTool({ name, arguments: args })
          .pipe(
            Effect.provideService(Invocation.McpInvocationContext, scope),
            Effect.provideService(McpSchema.McpServerClient, client),
          );
      if (active) {
        const page = yield* call("artifact_list", { offset: 40, limit: 10 });
        expect(page.isError).not.toBe(true);
        expect(page.structuredContent).toMatchObject({
          artifacts: artifacts.slice(40),
          nextOffset: null,
        });
      }
      const result = yield* call("artifact_record_check", {
        path: "/fixture/result-0.pdf",
        revision: "current",
        label: "pages verified",
        evidenceItemId: "command:check",
      });
      if (active) {
        expect(result.isError).not.toBe(true);
        expect(recorded).toEqual([threadId]);
      } else {
        expect(result.isError).toBe(true);
        expect(recorded).toEqual([]);
        const text = result.content[0];
        expect(text?.type === "text" ? JSON.parse(text.text).code : undefined).toBe(
          "parent_not_active",
        );
      }
    }).pipe(
      Effect.provide(
        McpHttpServer.layerArtifactToolkit.pipe(
          Layer.provideMerge(McpServer.McpServer.layer),
          Layer.provide(services),
        ),
      ),
    );
  },
);
