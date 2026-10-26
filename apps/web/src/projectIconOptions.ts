import { uiText } from "~/i18n";
import { lucideIconNames } from "./lib/lucideIconByName";
export { PROJECT_ICON_COLORS, projectIconColorClassName } from "./projectIconColors";

const POPULAR_PROJECT_ICONS: ReadonlyArray<string> = [
  "folder-code",
  "code-2",
  "terminal",
  "globe-2",
  "server",
  "database",
  "bot",
  "sparkles",
  "smartphone",
  "monitor",
  "cloud-cog",
  "package",
  "book-open",
  "flask-conical",
  "shield-check",
  "rocket",
  "gamepad-2",
  "music",
  "image",
  "shopping-bag",
  "git-branch",
  "workflow",
  "wrench",
  "layers-3",
];

export const PROJECT_EMOJIS: ReadonlyArray<{ readonly emoji: string; readonly label: string }> = [
  { emoji: "💻", label: uiText("Computer") },
  { emoji: "🛠️", label: uiText("Tools") },
  { emoji: "🚀", label: uiText("Rocket") },
  { emoji: "🤖", label: uiText("Robot") },
  { emoji: "✨", label: uiText("Sparkles") },
  { emoji: "⚡", label: uiText("Lightning") },
  { emoji: "🌐", label: uiText("Web") },
  { emoji: "📱", label: uiText("Mobile") },
  { emoji: "🖥️", label: uiText("Desktop") },
  { emoji: "⌨️", label: uiText("Keyboard") },
  { emoji: "⚙️", label: uiText("Gear") },
  { emoji: "🗄️", label: uiText("Database") },
  { emoji: "☁️", label: uiText("Cloud") },
  { emoji: "📦", label: uiText("Package") },
  { emoji: "📚", label: uiText("Books") },
  { emoji: "🧪", label: uiText("Test tube") },
  { emoji: "🔒", label: uiText("Lock") },
  { emoji: "🎮", label: uiText("Game") },
  { emoji: "🎵", label: uiText("Music") },
  { emoji: "🎬", label: uiText("Movie") },
  { emoji: "🖼️", label: uiText("Picture") },
  { emoji: "🛍️", label: uiText("Shopping") },
  { emoji: "🔥", label: uiText("Fire") },
  { emoji: "💡", label: uiText("Idea") },
  { emoji: "🧩", label: uiText("Puzzle") },
  { emoji: "📊", label: uiText("Chart") },
  { emoji: "🧠", label: uiText("Brain") },
  { emoji: "🦄", label: uiText("Unicorn") },
  { emoji: "🐙", label: uiText("Octopus") },
  { emoji: "🌱", label: uiText("Seedling") },
];

export function filterProjectIconNames(query: string): ReadonlyArray<string> {
  const normalized = query.trim().toLowerCase().replaceAll(/\s+/g, "-");
  if (!normalized) return POPULAR_PROJECT_ICONS;
  return lucideIconNames.filter((name) => name.includes(normalized)).slice(0, 60);
}

export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const segments = new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(trimmed);
  const segment = segments[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? "");
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? "");
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}
