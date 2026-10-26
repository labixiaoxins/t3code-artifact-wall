import { manualClipboard } from "../manualClipboard";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { COMPOSER_CONTEXT_CLIPBOARD_MIME } from "@t3tools/shared/composerContextClipboard";

import { writeTextToClipboard } from "./useCopyToClipboard";

describe("writeTextToClipboard", () => {
  afterEach(() => manualClipboard.clear());
  it("reveals the exact failed text for manual selection when HTTP copying is blocked", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("document", {});
    await expect(writeTextToClipboard("虚构手动复制内容")).rejects.toBeInstanceOf(
      ClipboardApiUnavailableError,
    );
    expect(manualClipboard.getSnapshot()).toBe("虚构手动复制内容");
    manualClipboard.clear();
    expect(manualClipboard.getSnapshot()).toBeNull();
  });
  it("reserves plain text even when an extra flavor attempts to replace it", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    await expect(
      writeTextToClipboard("original", "message", {
        "text/plain": "replacement",
        "text/html": "<b>original</b>",
      }),
    ).resolves.toBe(true);
    const items = write.mock.calls[0]![0] as Array<{
      data: Record<string, Blob>;
    }>;
    expect(await items[0]!.data["text/plain"]!.text()).toBe("original");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps caller-built rich HTML when attaching a context fragment", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", { clipboard: { write, writeText: vi.fn() } });
    vi.stubGlobal(
      "ClipboardItem",
      class {
        constructor(readonly data: Record<string, Blob>) {}
      },
    );
    const fragment = JSON.stringify({ version: 1, source: {}, records: [] });
    const rich = "<p><strong>Message</strong></p>";

    await expect(
      writeTextToClipboard("Message", "message", {
        [COMPOSER_CONTEXT_CLIPBOARD_MIME]: fragment,
        "text/html": rich,
      }),
    ).resolves.toBe(true);
    const items = write.mock.calls[0]![0] as Array<{
      data: Record<string, Blob>;
    }>;
    const html = await items[0]!.data["text/html"]!.text();
    expect(html).toContain(rich);
    expect(html).toContain("data-t3-context-fragment=");
  });
});
