import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vite-plus/test";
import { act, fakeTimers, render } from "../../test/render";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";
import { CommandPalette } from "./CommandPalette";
import { loadProjectPinyinConverter } from "./CommandPalette.projectSearch";
import { useUiStateStore } from "../uiStateStore";
import type { Project } from "../types";
import { openCommandPalette } from "../commandPaletteBus";
import { primaryServerKeybindingsAtom } from "../state/server";

const navigateMock = vi.hoisted(() => vi.fn(async () => undefined));
const newThreadMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigateMock,
  useParams: () => null,
  useLocation: () => "/settings",
}));
const PROJECTS = vi.hoisted(() => {
  const make = (id: string, title: string, workspaceRoot: string) => ({
    id,
    environmentId: "environment-local",
    title,
    workspaceRoot,
    defaultModelSelection: null,
    scripts: [],
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
  });
  return [
    make("p-batch", "批量设计工具", "/work/batch-tool"),
    make("p-design", "Design System", "/work/design"),
    make("p-notes", "读书笔记", "/work/notes"),
  ] as unknown as Project[];
});

// Lets a test hold the lazy pinyin chunk back to reproduce typing before it has loaded.
const pinyinGate = vi.hoisted(() => ({ current: null as Promise<unknown> | null }));
vi.mock("./CommandPalette.projectSearch", async (importOriginal) => {
  const original = await importOriginal<typeof import("./CommandPalette.projectSearch")>();
  return {
    ...original,
    loadProjectPinyinConverter: () => pinyinGate.current ?? original.loadProjectPinyinConverter(),
  };
});

vi.mock("@effect/atom-react", async (importOriginal) => {
  const original = await importOriginal<typeof import("@effect/atom-react")>();
  return {
    ...original,
    useAtomValue: (atom: unknown) =>
      atom === primaryServerKeybindingsAtom ? DEFAULT_RESOLVED_KEYBINDINGS : [],
  };
});
vi.mock("../hooks/useTheme", () => ({
  useRenderedAppearance: () => "light",
  useTheme: () => ({ theme: "default", resolvedTheme: "light", appearanceMode: "light" }),
}));
vi.mock("../hooks/useCustomThemes", () => ({ useCustomThemes: () => [] }));
vi.mock("../hooks/useEnvironmentTheme", () => ({ useEnvironmentThemeDefinitions: () => [] }));
vi.mock("../hooks/useSettings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hooks/useSettings")>()),
  useClientSettings: () => ({}),
}));
vi.mock("../hooks/useScratchProject", () => ({
  useScratchProject: () => ({
    scratchEnvironmentId: () => null,
    scratchWorkspaceRootFor: () => null,
    startScratchThread: vi.fn(),
  }),
}));
vi.mock("../hooks/useNewProject", () => ({ useNewProject: () => vi.fn() }));
vi.mock("../hooks/useHandleNewThread", () => ({
  useHandleNewThread: () => ({ activeDraftThread: null, activeThread: null, defaultProjectRef: null, handleNewThread: newThreadMock }),
  useNewThreadHandler: () => newThreadMock,
}));
vi.mock("../hooks/useOpenPanelPullRequestUrl", () => ({ useOpenPanelPullRequestUrl: () => null }));
vi.mock("../connection/useDesktopLocalBootstraps", () => ({ useDesktopLocalBootstraps: () => [] }));
vi.mock("../state/use-atom-command", () => ({ useAtomCommand: () => vi.fn() }));
vi.mock("../state/use-atom-query-runner", () => ({ useAtomQueryRunner: () => vi.fn() }));
vi.mock("../state/environments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/environments")>()),
  useEnvironments: () => ({ environments: [] }),
  usePrimaryEnvironmentId: () => null,
}));
vi.mock("../state/entities", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/entities")>()),
  useProjects: () => PROJECTS,
  useThreadShells: () => [],
  useServerConfigs: () => new Map(),
}));
vi.mock("../state/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/queries")>()),
  useThreadSearch: () => ({ matches: [], query: "", isLoading: false, error: null }),
}));
vi.mock("../state/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/session")>()),
  useEnvironmentScope: () => false,
}));
vi.mock("../state/query", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../state/query")>()),
  useEnvironmentQuery: () => ({}),
}));
vi.mock("./ProjectFavicon", () => ({ ProjectFavicon: () => null }));
vi.mock("./settings/useAvailableSettingsSearchItems", () => ({
  useAvailableSettingsSearchItems: () => [],
}));

// Navigation hooks are mocked above, and the test router would load on the fake clock too.
async function renderPalette(children: ReactNode) {
  await using stack = new AsyncDisposableStack();
  stack.use(fakeTimers());
  stack.defer(async () => {
    await act(() => vi.runOnlyPendingTimersAsync());
  });
  const screen = stack.use(
    await render(<CommandPalette>{children}</CommandPalette>, { router: false }),
  );
  const environment = stack.move();
  return Object.assign(screen, { [Symbol.asyncDispose]: () => environment.disposeAsync() });
}

async function settle() {
  await act(() => vi.advanceTimersByTimeAsync(50));
  await act(() => vi.advanceTimersToNextFrame());
}

async function typeQuery(value: string) {
  const input = document.querySelector<HTMLInputElement>("[data-command-palette] input")!;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await settle();
}

function groupHeadings() {
  return [
    ...document.querySelectorAll("[data-command-palette] [data-slot=command-group-label]"),
  ].map((node) => node.textContent ?? "");
}

describe("command palette project search", () => {
  it("recomputes the current pinyin query once the lazy pinyin chunk finishes loading", async () => {
    const converter = await loadProjectPinyinConverter();
    let resolveGate!: (value: typeof converter) => void;
    pinyinGate.current = new Promise((resolve) => (resolveGate = resolve));
    using _release = { [Symbol.dispose]: () => (pinyinGate.current = null) };
    await using _screen = await renderPalette(<input aria-label="Settings field" />);
    await act(() => openCommandPalette());
    await typeQuery("plsj");
    expect(
      document.querySelector("[data-command-palette] [role=option]")?.textContent ?? "",
    ).not.toContain("批量设计工具");
    await act(async () => resolveGate(converter));
    // Assert the eventual virtualized row rather than a fixed number of layout frames.
    await vi.waitFor(() =>
      expect(document.querySelector("[data-command-palette] [role=option]")?.textContent).toContain(
        "批量设计工具",
      ),
    );
  });

  it("finds a Chinese project by pinyin initials, lists projects first, and Enter scopes and opens it", async () => {
    await loadProjectPinyinConverter();
    navigateMock.mockClear();
    newThreadMock.mockClear();
    useUiStateStore.getState().setSidebarProjectScopeKeys([]);
    await using _screen = await renderPalette(<input aria-label="Settings field" />);
    await act(() => openCommandPalette());
    await settle();
    await typeQuery("plsj");
    await settle();
    await vi.waitFor(() => {
      expect(document.querySelector("[data-command-palette] [role=option]")?.textContent).toContain(
        "批量设计工具",
      );
      expect(groupHeadings()[0]).toContain("Projects");
    });

    await act(async () => {
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
      );
    });
    await settle();
    expect(useUiStateStore.getState().sidebarProjectScopeKeys).not.toHaveLength(0);
    // No threads in the fixture, so the project opens its new-thread draft.
    expect(newThreadMock).toHaveBeenCalledTimes(1);
  });

  it("matches by full pinyin and by English name", async () => {
    await loadProjectPinyinConverter();
    await using _screen = await renderPalette(<input aria-label="Settings field" />);
    await act(() => openCommandPalette());
    await settle();
    await typeQuery("piliang");
    await vi.waitFor(() =>
      expect(document.querySelector("[data-command-palette] [role=option]")?.textContent).toContain(
        "批量设计工具",
      ),
    );
    await typeQuery("design");
    await vi.waitFor(() =>
      expect(document.querySelector("[data-command-palette] [role=option]")?.textContent).toContain(
        "Design System",
      ),
    );
  });
});
