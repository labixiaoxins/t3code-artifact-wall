import { uiText } from "~/i18n";
import type { ProjectIconColor } from "@t3tools/contracts";

export const PROJECT_ICON_COLORS: ReadonlyArray<{
  readonly value: ProjectIconColor;
  readonly label: string;
  readonly className: string;
  readonly swatchClassName: string;
}> = [
  {
    value: "gray",
    label: uiText("Gray"),
    className: "text-gray-600 dark:text-gray-400",
    swatchClassName: "bg-gray-500",
  },
  {
    value: "red",
    label: uiText("Red"),
    className: "text-red-600 dark:text-red-400",
    swatchClassName: "bg-red-500",
  },
  {
    value: "orange",
    label: uiText("Orange"),
    className: "text-orange-600 dark:text-orange-400",
    swatchClassName: "bg-orange-500",
  },
  {
    value: "amber",
    label: uiText("Amber"),
    className: "text-amber-600 dark:text-amber-400",
    swatchClassName: "bg-amber-500",
  },
  {
    value: "yellow",
    label: uiText("Yellow"),
    className: "text-yellow-600 dark:text-yellow-400",
    swatchClassName: "bg-yellow-500",
  },
  {
    value: "lime",
    label: uiText("Lime"),
    className: "text-lime-600 dark:text-lime-400",
    swatchClassName: "bg-lime-500",
  },
  {
    value: "green",
    label: uiText("Green"),
    className: "text-green-600 dark:text-green-400",
    swatchClassName: "bg-green-500",
  },
  {
    value: "emerald",
    label: uiText("Emerald"),
    className: "text-emerald-600 dark:text-emerald-400",
    swatchClassName: "bg-emerald-500",
  },
  {
    value: "teal",
    label: uiText("Teal"),
    className: "text-teal-600 dark:text-teal-400",
    swatchClassName: "bg-teal-500",
  },
  {
    value: "cyan",
    label: uiText("Cyan"),
    className: "text-cyan-600 dark:text-cyan-400",
    swatchClassName: "bg-cyan-500",
  },
  {
    value: "sky",
    label: uiText("Sky"),
    className: "text-sky-600 dark:text-sky-400",
    swatchClassName: "bg-sky-500",
  },
  {
    value: "blue",
    label: uiText("Blue"),
    className: "text-blue-600 dark:text-blue-400",
    swatchClassName: "bg-blue-500",
  },
  {
    value: "indigo",
    label: uiText("Indigo"),
    className: "text-indigo-600 dark:text-indigo-400",
    swatchClassName: "bg-indigo-500",
  },
  {
    value: "violet",
    label: uiText("Violet"),
    className: "text-violet-600 dark:text-violet-400",
    swatchClassName: "bg-violet-500",
  },
  {
    value: "purple",
    label: uiText("Purple"),
    className: "text-purple-600 dark:text-purple-400",
    swatchClassName: "bg-purple-500",
  },
  {
    value: "fuchsia",
    label: uiText("Fuchsia"),
    className: "text-fuchsia-600 dark:text-fuchsia-400",
    swatchClassName: "bg-fuchsia-500",
  },
  {
    value: "pink",
    label: uiText("Pink"),
    className: "text-pink-600 dark:text-pink-400",
    swatchClassName: "bg-pink-500",
  },
  {
    value: "rose",
    label: uiText("Rose"),
    className: "text-rose-600 dark:text-rose-400",
    swatchClassName: "bg-rose-500",
  },
];

const PROJECT_ICON_COLOR_CLASSES = Object.fromEntries(
  PROJECT_ICON_COLORS.map(({ value, className }) => [value, className]),
) as Record<ProjectIconColor, string>;

export function projectIconColorClassName(color: ProjectIconColor): string {
  return PROJECT_ICON_COLOR_CLASSES[color];
}
