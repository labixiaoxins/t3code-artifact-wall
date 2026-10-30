import { DEFAULT_SIDEBAR_APPEARANCE } from "../../sidebarAppearance";
import { uiText } from "~/i18n";
import type { ReactNode } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import {
  DEFAULT_UNIFIED_SETTINGS,
  MAX_CODE_FONT_SIZE,
  MAX_INTERFACE_FONT_SIZE,
  MAX_PROMPT_FONT_SIZE,
  MAX_TERMINAL_FONT_SIZE,
  MIN_CODE_FONT_SIZE,
  MIN_INTERFACE_FONT_SIZE,
  MIN_PROMPT_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from "@t3tools/contracts/settings";
import * as Schema from "effect/Schema";
import { useLocalStorage } from "../../hooks/useLocalStorage";
import { useScopedSettings, useUpdateScopedSettings } from "./useScopedSettings";
import { isMacPlatform } from "../../lib/utils";
import { Input } from "../ui/input";
import {
  DEFAULT_CODE_FONT_STACK,
  DEFAULT_SANS_FONT_STACK,
  isFontFamilyAvailable,
  isMonospaceFamily,
  resolveDefaultFamilyLabel,
  resolveTerminalFontPreference,
  resolveTerminalFontSizePreference,
  TYPOGRAPHY_ADVANCED_STORAGE_KEY,
} from "../../appearanceFonts";
import { AdvancedSettings } from "./AdvancedSettings";
import { CodeFontPreview, PromptFontPreview, TerminalFontPreview } from "./SettingsFontPreviews";
import { discoverInstalledFonts, FontFamilyPicker, useFontEnumeration } from "./FontFamilyPicker";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { Switch } from "../ui/switch";
import {
  SettingResetButton,
  SettingsRow,
  SettingsSection,
  useSettingsSearchTargetId,
} from "./settingsLayout";
import {
  isAdvancedTypographyTarget,
  revealSettingsSearchTarget,
  searchableSetting,
} from "./settingsSearch";
function useFontDefaultFamilies() {
  const settings = useScopedSettings();
  const [defaults] = useState(() => ({
    sans: resolveDefaultFamilyLabel(DEFAULT_SANS_FONT_STACK) ?? "System default",
    code: resolveDefaultFamilyLabel(DEFAULT_CODE_FONT_STACK) ?? "System monospace",
  }));
  return {
    sans: defaults.sans,
    code: defaults.code,
    interfaceFamily: settings.fontFamilySans.trim() || defaults.sans,
  };
}
function InterfaceFontRow({ preview }: { preview?: ReactNode }) {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("interface-font")}
      description={uiText("Everything outside code blocks and the terminal.")}
      defaultFamily={defaults.sans}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilySans}
      value={settings.fontFamilySans}
      onValueChange={(fontFamilySans) => updateSettings({ fontFamilySans })}
      onReset={() =>
        updateSettings({
          fontFamilySans: DEFAULT_UNIFIED_SETTINGS.fontFamilySans,
          fontSizeInterface: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
        })
      }
      size={{
        label: uiText("Interface font size"),
        min: MIN_INTERFACE_FONT_SIZE,
        max: MAX_INTERFACE_FONT_SIZE,
        value: settings.fontSizeInterface,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeInterface,
        onChange: (fontSizeInterface) => updateSettings({ fontSizeInterface }),
      }}
      {...(preview !== undefined ? { preview } : {})}
    />
  );
}
function PromptFontRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("prompt-font")}
      description={uiText("Only the box you write prompts in. Mono works well here.")}
      defaultFamily={defaults.interfaceFamily}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer}
      value={settings.fontFamilyComposer}
      onValueChange={(fontFamilyComposer) => updateSettings({ fontFamilyComposer })}
      onReset={() =>
        updateSettings({
          fontFamilyComposer: DEFAULT_UNIFIED_SETTINGS.fontFamilyComposer,
          fontSizePrompt: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
        })
      }
      size={{
        label: uiText("Prompt font size"),
        min: MIN_PROMPT_FONT_SIZE,
        max: MAX_PROMPT_FONT_SIZE,
        value: settings.fontSizePrompt,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizePrompt,
        onChange: (fontSizePrompt) => updateSettings({ fontSizePrompt }),
      }}
      preview={<PromptFontPreview />}
    />
  );
}
function CodeFontRow({
  title,
  description = "Code blocks, diffs, and file previews.",
  preview,
}: {
  title?: string;
  description?: string;
  preview?: ReactNode;
}) {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("code-font")}
      {...(title !== undefined ? { title } : {})}
      description={description}
      defaultFamily={defaults.code}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyCode}
      value={settings.fontFamilyCode}
      onValueChange={(fontFamilyCode) => updateSettings({ fontFamilyCode })}
      onReset={() =>
        updateSettings({
          fontFamilyCode: DEFAULT_UNIFIED_SETTINGS.fontFamilyCode,
          fontSizeCode: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
        })
      }
      requireMonospace
      size={{
        label: uiText("Code font size"),
        min: MIN_CODE_FONT_SIZE,
        max: MAX_CODE_FONT_SIZE,
        value: settings.fontSizeCode,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeCode,
        onChange: (fontSizeCode) => updateSettings({ fontSizeCode }),
      }}
      preview={preview ?? <CodeFontPreview />}
    />
  );
}
function TerminalFontRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <FontFamilySettingsRow
      {...searchableSetting("terminal-font")}
      description={uiText("Terminal output, independent from code blocks and diffs.")}
      defaultFamily={defaults.code}
      defaultValue={DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal}
      value={settings.fontFamilyTerminal}
      onValueChange={(fontFamilyTerminal) => updateSettings({ fontFamilyTerminal })}
      onReset={() =>
        updateSettings({
          fontFamilyTerminal: DEFAULT_UNIFIED_SETTINGS.fontFamilyTerminal,
          fontSizeTerminal: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
        })
      }
      requireMonospace
      size={{
        label: uiText("Terminal font size"),
        min: MIN_TERMINAL_FONT_SIZE,
        max: MAX_TERMINAL_FONT_SIZE,
        value: settings.fontSizeTerminal,
        defaultValue: DEFAULT_UNIFIED_SETTINGS.fontSizeTerminal,
        onChange: (fontSizeTerminal) => updateSettings({ fontSizeTerminal }),
      }}
      preview={
        <TerminalFontPreview
          family={resolveTerminalFontPreference({
            advanced: true,
            code: settings.fontFamilyCode,
            terminal: settings.fontFamilyTerminal,
          })}
          size={settings.fontSizeTerminal}
        />
      }
    />
  );
}
function FontSmoothingRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  if (!isMacPlatform(navigator.platform)) return null;
  return (
    <SettingsRow
      {...searchableSetting("font-smoothing")}
      description={uiText("Use thinner grayscale text smoothing instead of the macOS default.")}
      resetAction={
        settings.fontSmoothing !== DEFAULT_UNIFIED_SETTINGS.fontSmoothing ? (
          <SettingResetButton
            label={uiText("font smoothing")}
            onClick={() =>
              updateSettings({ fontSmoothing: DEFAULT_UNIFIED_SETTINGS.fontSmoothing })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.fontSmoothing}
          onCheckedChange={(checked) => updateSettings({ fontSmoothing: Boolean(checked) })}
          aria-label={uiText("Font smoothing")}
        />
      }
    />
  );
}
function WordWrapRow() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  return (
    <SettingsRow
      {...searchableSetting("word-wrap")}
      description={uiText(
        "Wrap long lines in code blocks, tables, diffs, and file previews by default.",
      )}
      resetAction={
        settings.wordWrap !== DEFAULT_UNIFIED_SETTINGS.wordWrap ? (
          <SettingResetButton
            label={uiText("word wrapping")}
            onClick={() => updateSettings({ wordWrap: DEFAULT_UNIFIED_SETTINGS.wordWrap })}
          />
        ) : null
      }
      control={
        <Switch
          checked={settings.wordWrap}
          onCheckedChange={(checked) => updateSettings({ wordWrap: Boolean(checked) })}
          aria-label={uiText("Wrap code, tables, diffs, and file previews by default")}
        />
      }
    />
  );
}
function FontSettingsGroup() {
  return (
    <>
      <InterfaceFontRow />
      <SidebarTypographyRows />
      <PromptFontRow />
      <CodeFontRow />
      <TerminalFontRow />
    </>
  );
}
function SeparateFontsRow({
  checked,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <SettingsRow
      {...searchableSetting("separate-fonts")}
      description={uiText(
        "Set the prompt, code, and terminal fonts separately instead of one monospace font.",
      )}
      control={
        <Switch
          checked={checked}
          onCheckedChange={(next) => onCheckedChange(Boolean(next))}
          aria-label={uiText("Separate fonts")}
        />
      }
    />
  );
}
function SimpleFontRows() {
  const settings = useScopedSettings();
  return (
    <>
      <InterfaceFontRow preview={<PromptFontPreview />} />
      <SidebarTypographyRows />
      <CodeFontRow
        title={uiText("Monospace font")}
        description={uiText("Code blocks, diffs, file previews, and the terminal.")}
        preview={
          <>
            <CodeFontPreview />
            <TerminalFontPreview
              family={resolveTerminalFontPreference({
                advanced: false,
                code: settings.fontFamilyCode,
                terminal: settings.fontFamilyTerminal,
              })}
              size={resolveTerminalFontSizePreference({
                advanced: false,
                code: settings.fontSizeCode,
                terminal: settings.fontSizeTerminal,
              })}
            />
          </>
        }
      />
    </>
  );
}
export function TypographySection() {
  const [advanced, setAdvanced] = useLocalStorage(
    TYPOGRAPHY_ADVANCED_STORAGE_KEY,
    false,
    Schema.Boolean,
  );
  // A deep link or history step must persist the flag too: the terminal reads it, so advanced
  // rows without it would make terminal font edits do nothing. The rows follow the target
  // directly so its row mounts in the first commit; the target clears once handled.
  const searchTargetId = useSettingsSearchTargetId();
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- writes the advanced typography flag to localStorage when a search target needs it
  useEffect(() => {
    if (searchTargetId !== null) revealSettingsSearchTarget(searchTargetId);
  }, [searchTargetId]);
  const showAdvanced =
    advanced || (searchTargetId !== null && isAdvancedTypographyTarget(searchTargetId));
  return (
    <SettingsSection id="typography" title={uiText("Typography")}>
      {showAdvanced ? <FontSettingsGroup /> : <SimpleFontRows />}
      <WordWrapRow />
      <AdvancedSettings
        targetIds={[searchableSetting("separate-fonts").id, searchableSetting("font-smoothing").id]}
      >
        <SeparateFontsRow checked={showAdvanced} onCheckedChange={setAdvanced} />
        <FontSmoothingRow />
      </AdvancedSettings>
    </SettingsSection>
  );
}
function FontFamilySettingsRow({
  id,
  title,
  description,
  defaultFamily,
  defaultValue,
  preview,
  value,
  onValueChange,
  onReset,
  requireMonospace = false,
  size,
}: {
  id?: string;
  title: string;
  description: string;
  defaultFamily: string;
  defaultValue: string;
  preview?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onReset: () => void;
  requireMonospace?: boolean;
  size: {
    label: string;
    min: number;
    max: number;
    value: number;
    defaultValue: number;
    onChange: (v: number) => void;
    followLabel?: string;
  };
}) {
  const trimmed = value.trim();
  const [draft, setDraft] = useState(value);
  const [draftSettled, setDraftSettled] = useState(true);
  // Each pending commit remembers the value it was typed against, so one that outlives
  // an external change (hydration, reset, picker selection) drops its stale draft.
  const commitTimerRef = useRef<{
    readonly id: number;
    readonly value: string;
  } | null>(null);
  const cancelPendingCommit = () => {
    if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current.id);
    commitTimerRef.current = null;
  };
  // Bumped on every external value change, so a pending commit typed before one never lands,
  // even if the value has since changed back to what it was typed against.
  const [adopted, setAdopted] = useState({ value, generation: 0 });
  if (adopted.value !== value) {
    setAdopted({ value, generation: adopted.generation + 1 });
    setDraft(value);
    setDraftSettled(true);
  }
  const readAdoptedGeneration = useEffectEvent(() => adopted.generation);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- clears the pending commit timer on unmount
  useEffect(
    () => () => {
      if (commitTimerRef.current !== null) window.clearTimeout(commitTimerRef.current.id);
    },
    [],
  );
  const acceptsFamily = (candidate: string) =>
    isFontFamilyAvailable(candidate) && (!requireMonospace || isMonospaceFamily(candidate));
  const commitDraft = (next: string) => {
    setDraftSettled(true);
    if (next.trim().length === 0 || acceptsFamily(next)) {
      onValueChange(next);
    }
  };
  const flushDraft = () => {
    const pending = commitTimerRef.current;
    cancelPendingCommit();
    if (pending !== null && pending.value === value) commitDraft(draft);
  };
  const draftTrimmed = draft.trim();
  const draftPending = draftSettled && draftTrimmed.length > 0 && draftTrimmed !== trimmed;
  const resetToDefault = () => {
    cancelPendingCommit();
    setDraft(defaultValue);
    setDraftSettled(true);
    onReset();
  };
  const resetAction =
    value !== defaultValue || size.value !== size.defaultValue ? (
      <SettingResetButton label={title.toLowerCase()} onClick={resetToDefault} />
    ) : null;
  const fontEnumeration = useFontEnumeration();
  const [inputFocused, setInputFocused] = useState(false);
  const familyControl =
    fontEnumeration.status === "granted" ? (
      <FontFamilyPicker
        ariaLabel={uiText("{0} family", { "0": title })}
        defaultFamily={defaultFamily}
        selectedFamily={trimmed}
        requireMonospace={requireMonospace}
        initialOpen={inputFocused}
        onSelect={onValueChange}
      />
    ) : (
      <Input
        size="sm"
        aria-label={uiText("{0} family", { "0": title })}
        aria-invalid={draftPending || undefined}
        autoCapitalize="off"
        autoComplete="off"
        className="min-w-0 flex-1"
        maxLength={200}
        onFocus={() => {
          setInputFocused(true);
          discoverInstalledFonts();
        }}
        onBlur={() => {
          setInputFocused(false);
          flushDraft();
        }}
        onChange={(event) => {
          const next = event.currentTarget.value;
          setDraft(next);
          setDraftSettled(false);
          cancelPendingCommit();
          const typedAgainst = value;
          const typedInGeneration = adopted.generation;
          commitTimerRef.current = {
            id: window.setTimeout(() => {
              commitTimerRef.current = null;
              if (readAdoptedGeneration() === typedInGeneration) commitDraft(next);
            }, 400),
            value: typedAgainst,
          };
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") flushDraft();
          if (event.key === "Escape") {
            // Discard uncommitted typing without closing the settings page,
            // which is what an unhandled Escape does.
            event.preventDefault();
            event.stopPropagation();
            cancelPendingCommit();
            setDraft(value);
            setDraftSettled(true);
          }
        }}
        placeholder={defaultFamily}
        spellCheck={false}
        value={draft}
      />
    );
  const control = (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">{familyControl}</div>
      <Select
        value={String(size.value)}
        onValueChange={(next) => {
          if (typeof next !== "string") return;
          const parsed = Number(next);
          if (
            (size.followLabel && parsed === 0) ||
            (Number.isInteger(parsed) && parsed >= size.min && parsed <= size.max)
          ) {
            size.onChange(parsed);
          }
        }}
      >
        <SelectTrigger
          size="sm"
          className={size.followLabel ? "w-36 shrink-0" : "w-22 shrink-0"}
          aria-label={size.label}
        >
          <SelectValue>
            {size.value === 0 && size.followLabel ? size.followLabel : `${size.value} px`}
          </SelectValue>
        </SelectTrigger>
        <SelectPopup align="end" alignItemWithTrigger={false}>
          {size.followLabel && <SelectItem value="0">{size.followLabel}</SelectItem>}
          {Array.from({ length: size.max - size.min + 1 }, (_, index) => size.min + index).map(
            (px) => (
              <SelectItem hideIndicator key={px} value={String(px)}>
                {px}
                {" px"}
              </SelectItem>
            ),
          )}
        </SelectPopup>
      </Select>
    </div>
  );
  return (
    <SettingsRow
      {...(id !== undefined ? { id } : {})}
      title={title}
      description={description}
      resetAction={resetAction}
      control={control}
    >
      {preview}
    </SettingsRow>
  );
}

function SidebarTypographyRows() {
  const settings = useScopedSettings();
  const updateSettings = useUpdateScopedSettings();
  const defaults = useFontDefaultFamilies();
  return (
    <>
      <FontFamilySettingsRow
        {...searchableSetting("sidebar-font")}
        description="只调整侧边栏。留空跟随界面字体；字号按现有文字层级等比调整。"
        defaultFamily={defaults.interfaceFamily}
        defaultValue=""
        value={settings.fontFamilySidebar}
        onValueChange={(fontFamilySidebar) => updateSettings({ fontFamilySidebar })}
        onReset={() => updateSettings(DEFAULT_SIDEBAR_APPEARANCE)}
        size={{
          label: "侧边栏字号",
          min: MIN_INTERFACE_FONT_SIZE,
          max: MAX_INTERFACE_FONT_SIZE,
          value: settings.fontSizeSidebar,
          defaultValue: 0,
          followLabel: "跟随界面字号",
          onChange: (fontSizeSidebar) => updateSettings({ fontSizeSidebar }),
        }}
      />
      {(["light", "dark"] as const).map((theme) => {
        const key = theme === "light" ? "sidebarTextColorLight" : "sidebarTextColorDark";
        const label = theme === "light" ? "侧边栏文字颜色（浅色）" : "侧边栏文字颜色（深色）";
        return (
          <SettingsRow
            key={theme}
            id={`sidebar-colors-${theme}`}
            title={label}
            description="默认保留现有颜色；高对比预设增强标题与次要文字。"
            control={
              <div className="flex items-center gap-2">
                <Select
                  value={settings[key]}
                  onValueChange={(value) => {
                    if (value === "default" || value === "high-contrast")
                      updateSettings({ [key]: value });
                  }}
                >
                  <SelectTrigger aria-label={label}>
                    <SelectValue>{settings[key] === "default" ? "默认颜色" : "高对比"}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="default">默认颜色</SelectItem>
                    <SelectItem value="high-contrast">高对比</SelectItem>
                  </SelectPopup>
                </Select>
                <SettingResetButton
                  label={label}
                  onClick={() => updateSettings({ [key]: "default" })}
                />
              </div>
            }
          />
        );
      })}
      <SettingsRow
        title="恢复侧边栏默认"
        description="恢复字体、字号和浅色/深色文字颜色。"
        control={
          <SettingResetButton
            label="侧边栏"
            onClick={() => updateSettings(DEFAULT_SIDEBAR_APPEARANCE)}
          />
        }
      />
    </>
  );
}
