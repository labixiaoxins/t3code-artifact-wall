import { DEFAULT_UNIFIED_SETTINGS, type UnifiedSettings } from "@t3tools/contracts";
import { expect, it, vi } from "vite-plus/test";
import { render } from "../../../test/render";
const state = vi.hoisted(() => ({ update: vi.fn(), artifactRevisionEnabled: true }));
vi.mock(import("./useScopedSettings"), async (original) => ({
  ...(await original()),
  useScopedSettings: <T = UnifiedSettings,>(selector?: (settings: UnifiedSettings) => T): T => {
    const settings = {
      ...DEFAULT_UNIFIED_SETTINGS,
      composerRichTextEnabled: !DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
      artifactRevisionEnabled: state.artifactRevisionEnabled,
    };
    return selector ? selector(settings) : (settings as T);
  },
  useUpdateScopedSettings: () => state.update,
}));
vi.mock(import("./settingsLayout"), async (original) => ({
  ...(await original()),
  SettingsRow: ({ title, control, resetAction, children }) => (
    <div>
      <h3>{title}</h3>
      {control}
      {resetAction}
      {children}
    </div>
  ),
}));
import { ChatSettingsPanel } from "./SettingsPanels";
it("restores only the rich text setting and retains image revision preferences", async () => {
  state.artifactRevisionEnabled = true;
  state.update.mockReset();
  await using screen = await render(<ChatSettingsPanel />);
  await screen.getByRole("button", { name: "Reset rich text composer to default" }).click();
  expect(state.update).toHaveBeenCalledExactlyOnceWith({
    composerRichTextEnabled: DEFAULT_UNIFIED_SETTINGS.composerRichTextEnabled,
  });
});
