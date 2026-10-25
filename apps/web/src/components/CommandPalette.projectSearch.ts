import { normalizeSearchText } from "../lib/utils";

export const PROJECT_SEARCH_LIMIT = 5;

const CJK = /[㐀-鿿]/u;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}]/gu;

export interface ProjectPinyin {
  readonly full: string;
  readonly initials: string;
}

export type ProjectPinyinConverter = (text: string) => ProjectPinyin | null;

// pinyin-pro ships a ~1MB dictionary, so it is only imported once the palette
// is open and a project name actually contains Chinese.
type PinyinProModule = typeof import("pinyin-pro");
let pinyinModulePromise: Promise<PinyinProModule> | null = null;

export function hasCjk(text: string): boolean {
  return CJK.test(text);
}

export function loadProjectPinyinConverter(): Promise<ProjectPinyinConverter> {
  pinyinModulePromise ??= import("pinyin-pro");
  return pinyinModulePromise.then(({ pinyin }) => {
    // The first conversion initialises pinyin-pro's lookup tables; pay for it before the first keystroke.
    pinyin("项目", { toneType: "none", type: "array", v: true });
    return createProjectPinyinConverter(pinyin);
  });
}

export function createProjectPinyinConverter(
  pinyin: (text: string, options: { toneType: "none"; type: "array"; v: true }) => string[],
): ProjectPinyinConverter {
  // Projects are few and titles rarely change, so convert each distinct text once.
  const cache = new Map<string, ProjectPinyin | null>();
  return (text) => {
    const cached = cache.get(text);
    if (cached !== undefined) return cached;
    let result: ProjectPinyin | null = null;
    if (hasCjk(text)) {
      const syllables = pinyin(text, { toneType: "none", type: "array", v: true })
        .map((syllable) => syllable.toLowerCase().replace(NON_ALPHANUMERIC, ""))
        .filter((syllable) => syllable.length > 0);
      result = {
        full: syllables.join(""),
        initials: syllables.map((syllable) => syllable[0]).join(""),
      };
    }
    cache.set(text, result);
    return result;
  };
}

export function lastPathSegment(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, "");
  return trimmed.slice(Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\")) + 1);
}

export interface ProjectSearchCandidate<TItem> {
  readonly item: TItem;
  readonly title: string;
  readonly displayName: string;
  readonly workspaceRoot: string;
  /** Epoch milliseconds of the project's latest thread activity. */
  readonly recency: number;
}

// Higher is better; 0 means no match.
export const PROJECT_MATCH_RANK = {
  none: 0,
  path: 1,
  contains: 2,
  pinyinContains: 3,
  pinyinInitials: 4,
  pinyinPrefix: 5,
  namePrefix: 6,
  nameExact: 7,
} as const;

function startsWithWord(field: string, token: string): boolean {
  for (let index = field.indexOf(token); index !== -1; index = field.indexOf(token, index + 1)) {
    if (index === 0 || !/[\p{L}\p{N}]/u.test(field[index - 1]!)) return true;
  }
  return false;
}

export function rankProjectSearchMatch(
  candidate: Pick<ProjectSearchCandidate<unknown>, "title" | "displayName" | "workspaceRoot">,
  normalizedQuery: string,
  toPinyin: ProjectPinyinConverter | null,
): number {
  if (normalizedQuery.length === 0) return PROJECT_MATCH_RANK.none;
  const compactQuery = normalizedQuery.replace(NON_ALPHANUMERIC, "");
  const names = [
    candidate.displayName,
    candidate.title,
    lastPathSegment(candidate.workspaceRoot),
  ].map(normalizeSearchText);
  let best: number = PROJECT_MATCH_RANK.none;

  for (const name of names) {
    if (name.length === 0) continue;
    if (name === normalizedQuery) return PROJECT_MATCH_RANK.nameExact;
    if (name.startsWith(normalizedQuery) || startsWithWord(name, normalizedQuery)) {
      best = Math.max(best, PROJECT_MATCH_RANK.namePrefix);
    } else if (name.includes(normalizedQuery)) {
      best = Math.max(best, PROJECT_MATCH_RANK.contains);
    }
  }
  if (best >= PROJECT_MATCH_RANK.namePrefix) return best;

  if (toPinyin && compactQuery.length > 0) {
    for (const name of new Set([candidate.displayName, candidate.title, ...names])) {
      const pinyin = toPinyin(name);
      if (!pinyin) continue;
      if (pinyin.initials === compactQuery) {
        best = Math.max(best, PROJECT_MATCH_RANK.pinyinInitials);
      } else if (pinyin.full.startsWith(compactQuery) || pinyin.initials.startsWith(compactQuery)) {
        best = Math.max(best, PROJECT_MATCH_RANK.pinyinPrefix);
      } else if (pinyin.full.includes(compactQuery) || pinyin.initials.includes(compactQuery)) {
        best = Math.max(best, PROJECT_MATCH_RANK.pinyinContains);
      }
    }
  }
  if (best > PROJECT_MATCH_RANK.none) return best;

  const tokens = normalizedQuery.split(" ");
  const path = normalizeSearchText(candidate.workspaceRoot);
  return tokens.every((token) => path.includes(token))
    ? PROJECT_MATCH_RANK.path
    : PROJECT_MATCH_RANK.none;
}

// Whole word / prefix > pinyin (initials exact, then prefix) > mid-word; same tier by latest activity.
export function rankProjectSearchItems<TItem>(input: {
  readonly candidates: ReadonlyArray<ProjectSearchCandidate<TItem>>;
  readonly query: string;
  readonly toPinyin: ProjectPinyinConverter | null;
  readonly limit?: number;
}): TItem[] {
  const normalizedQuery = normalizeSearchText(input.query);
  return input.candidates
    .map((candidate, index) => ({
      candidate,
      index,
      rank: rankProjectSearchMatch(candidate, normalizedQuery, input.toPinyin),
    }))
    .filter((entry) => entry.rank > PROJECT_MATCH_RANK.none)
    .toSorted(
      (left, right) =>
        right.rank - left.rank ||
        right.candidate.recency - left.candidate.recency ||
        left.index - right.index,
    )
    .slice(0, input.limit ?? PROJECT_SEARCH_LIMIT)
    .map((entry) => entry.candidate.item);
}
