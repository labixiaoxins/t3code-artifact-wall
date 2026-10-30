import { Fragment, type ReactNode } from "react";
import { uiText, type UiLocale } from ".";

/** Translate only the template; embedded commands, names and links keep their original nodes. */
export function uiTextNodes(
  source: string,
  values: Readonly<Record<string, ReactNode>>,
  locale?: UiLocale,
): ReactNode {
  const occurrences = new Map<string, number>();
  return uiText(source, undefined, locale)
    .split(/(\{[A-Za-z0-9_]+\})/g)
    .map((part) => {
      const occurrence = occurrences.get(part) ?? 0;
      occurrences.set(part, occurrence + 1);
      return (
        <Fragment key={`${part}:${occurrence}`}>
          {part.startsWith("{") && Object.hasOwn(values, part.slice(1, -1))
            ? values[part.slice(1, -1)]
            : part}
        </Fragment>
      );
    });
}
