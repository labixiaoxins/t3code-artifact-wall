import { useState } from "react";
import { SettingsSection, SettingsRow } from "../components/settings/settingsLayout";
import { Button } from "../components/ui/button";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../components/ui/select";
import { persistClientSettingsUpdate } from "../hooks/useSettings";
import { readUiLocale, writeUiLocale, type UiLocale } from ".";

export function LanguageSettings() {
  const chinese = readUiLocale() === "zh-CN";
  const [locale, setLocale] = useState(readUiLocale);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const changeLocale = async (value: UiLocale | null) => {
    if (!value || value === locale || busy) return;
    setBusy(true);
    setError(false);
    try {
      await persistClientSettingsUpdate((current) => ({ ...current, appLocale: value }));
      writeUiLocale(value);
      setLocale(value);
      setSaved(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsSection id="interface-language" title={chinese ? "界面语言" : "Interface language"}>
      <SettingsRow
        title={chinese ? "语言" : "Language"}
        description={chinese ? "保存后重新加载界面以应用语言设置。聊天记录和已保存草稿保留。" : "Reload to apply the language. Chats and saved drafts are preserved."}
        control={
          <Select value={locale} onValueChange={changeLocale} disabled={busy}>
            <SelectTrigger aria-label="界面语言 / Interface language"><SelectValue>{locale === "zh-CN" ? "简体中文" : "English"}</SelectValue></SelectTrigger>
            <SelectPopup>
              <SelectItem value="zh-CN">简体中文</SelectItem>
              <SelectItem value="en">English</SelectItem>
            </SelectPopup>
          </Select>
        }
      />
      {saved ? (
        <div className="flex items-center gap-3 py-3">
          <span role="status" className="text-sm">{chinese ? "语言已保存" : "Language saved"}</span>
          <Button size="sm" onClick={() => window.location.reload()}>{chinese ? "重新加载" : "Reload"}</Button>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-destructive">{chinese ? "语言保存失败，请重试。" : "Could not save language. Please retry."}</p> : null}
    </SettingsSection>
  );
}
