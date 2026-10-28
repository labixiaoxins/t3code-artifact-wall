import { uiText } from "~/i18n";
import type { PullRequestInvolvement, PullRequestListState } from "@t3tools/contracts";
import {
  CalendarArrowDownIcon,
  CalendarArrowUpIcon,
  ClockIcon,
  EyeIcon,
  LayersIcon,
  ListChecksIcon,
  Maximize2Icon,
  Minimize2Icon,
  PenLineIcon,
  UserLockIcon,
} from "lucide-react";

import type { PullRequestFilterOption } from "./PullRequestListFilters";
import type { PullRequestListSort } from "./pullRequestListPreferences";
import { PullRequestGlyph } from "./pullRequestIcons";

export const INVOLVEMENT_TABS = [
  { value: "all", label: uiText("All"), Icon: LayersIcon },
  { value: "reviewing", label: uiText("Reviewing"), Icon: EyeIcon },
  { value: "authored", label: uiText("Authored"), Icon: PenLineIcon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestInvolvement>>;

export const STATE_TABS = [
  { value: "all", label: uiText("All"), Icon: LayersIcon },
  { value: "open", label: uiText("Open"), Icon: PullRequestGlyph.pullRequest },
  { value: "closed", label: uiText("Closed"), Icon: PullRequestGlyph.closed },
  { value: "merged", label: uiText("Merged"), Icon: PullRequestGlyph.merged },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListState>>;

export const SORT_OPTIONS = [
  { value: "ready", label: uiText("Merge readiness"), Icon: ListChecksIcon },
  { value: "blocked", label: uiText("Blocked on me"), Icon: UserLockIcon },
  { value: "updated", label: uiText("Recently updated"), Icon: ClockIcon },
  { value: "newest", label: uiText("Newest shown"), Icon: CalendarArrowDownIcon },
  { value: "oldest", label: uiText("Oldest shown"), Icon: CalendarArrowUpIcon },
  { value: "largest", label: uiText("Largest shown"), Icon: Maximize2Icon },
  { value: "smallest", label: uiText("Smallest shown"), Icon: Minimize2Icon },
] as const satisfies ReadonlyArray<PullRequestFilterOption<PullRequestListSort>>;
