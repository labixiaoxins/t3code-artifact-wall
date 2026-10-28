import type * as Electron from "electron";

const labels: Readonly<Record<string, string>> = {
  File: "文件", Edit: "编辑", View: "视图", Help: "帮助", Window: "窗口",
  "Check for Updates...": "检查更新…", "Settings...": "设置…", "Paste as Text": "粘贴为纯文本",
  Speech: "语音", Reload: "重新加载", "Force Reload": "强制重新加载",
  "Toggle Developer Tools": "切换开发者工具", "Actual Size": "实际大小",
  "Zoom In": "放大", "Zoom Out": "缩小",
};
const roleLabels: Readonly<Record<string, string>> = {
  services: "服务", hideOthers: "隐藏其他", unhide: "全部显示", close: "关闭窗口",
  quit: "退出", undo: "撤销", redo: "重做", cut: "剪切", copy: "复制", paste: "粘贴",
  delete: "删除", selectAll: "全选", startSpeaking: "开始朗读", stopSpeaking: "停止朗读",
  togglefullscreen: "切换全屏", windowMenu: "窗口", help: "帮助", minimize: "最小化",
  zoom: "缩放", front: "全部置于最前", about: "关于",
};

/** Preserve native roles, commands and accelerators; translate only application menu copy. */
export function localizeApplicationMenu(
  items: readonly Electron.MenuItemConstructorOptions[],
  locale: "zh-CN" | "en",
): Electron.MenuItemConstructorOptions[] {
  if (locale === "en") return [...items];
  return items.map((item) => {
    let label = item.label;
    if (label !== undefined) {
      label = labels[label] ?? label.replace(/^About /, "关于 ").replace(/^Hide /, "隐藏 ").replace(/^Quit /, "退出 ");
    } else if (item.role) {
      label = roleLabels[item.role];
    }
    return {
      ...item,
      ...(label === undefined ? {} : { label }),
      ...(Array.isArray(item.submenu) ? { submenu: localizeApplicationMenu(item.submenu, locale) } : {}),
    };
  });
}
