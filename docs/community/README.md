# Community fork: artifact-wall workflow

An unofficial, independently maintained fork of [pingdotgg/t3code](https://github.com/pingdotgg/t3code), MIT licensed like upstream. It is not affiliated with or endorsed by T3 Tools.

Base: upstream `main` at commit `9bd1d8009` (2026-10-06). All changes are on the `community/artifact-wall-main` branch as a single commit, so the diff against that base is easy to review.

## Why

Written for people who run many projects at once and mix code with visual or content work (images, pages, documents). Chat history answers "what did we say". This fork tries to answer three other questions faster: **what is waiting for me, what did we produce, and where do I continue**.

The UI strings are currently Chinese. The logic is language-independent; PRs that add i18n are welcome.

## What changed

| Area                     | Behaviour                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Artifact wall**        | A per-thread and per-project panel that collects generated images, rendered pages, files written in the thread, and attachments. Preview, compare images side by side, and re-attach an artifact to the composer to keep iterating. Files that were only _mentioned_ in a thread are ignored unless they were modified after the thread was created (5-minute tolerance). Attachments, rendered HTML and file changes are always kept.                      |
| **Needs me**             | Sidebar entry listing threads that wait on you: approvals, questions, new results, failures. Per-group badges, `⌘⇧I` jumps to the next one.                                                                                                                                                                                                                                                                                                                 |
| **Subtask folding**      | Subagent threads no longer appear as separate sidebar rows. The parent shows `⑂ N` and expands to list them. Subagent approvals and questions still reach "Needs me" (labelled "子任务 · 待授权"); subagent results and failures do not, because the parent model consumes them. Archiving a parent archives its idle subtasks; running ones are skipped with a visible error. Un-archiving never auto-restores subtasks; use "恢复子任务" in the `⑂` menu. |
| **One-click new thread** | The category "new thread" button starts a thread in the remembered default workspace. `⌥`-click opens a short picker: recent first, `~/` paths, dated `~/Documents/Codex/YYYY-MM-DD/...` folders grouped under a submenu. Before the first message the composer shows "在 ~/… 中运行 · 更换".                                                                                                                                                               |
| **Sidebar grouping**     | Model (Codex / Claude / …) → category → thread, both levels collapsible; recent projects at the top; archived entry; history sync button.                                                                                                                                                                                                                                                                                                                   |
| **History scan**         | `AgentSessionScanner` scans all time ranges including archived sessions, with a memory budget, and keeps native session identity.                                                                                                                                                                                                                                                                                                                           |

## Opinionated defaults you will want to edit

- Category names and folder rules live in one file: [`apps/web/src/workspaceCollections.ts`](../../apps/web/src/workspaceCollections.ts). The defaults assume `~/Documents/<category>` folders (自媒体, 公司管理, 交易, …). Replace them with your own layout.
- Automation-thread title filter: `isAutomationThread` in `apps/web/src/sidebarProviderGrouping.ts`.
- Dated-folder grouping assumes Codex's `~/Documents/Codex/YYYY-MM-DD/<name>` scratch layout.

## Build

Requires Node `^24.13.1` and pnpm `11.10.0`, same as upstream.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test        # or run the targeted suites listed below
pnpm build
```

Targeted suites for this fork: `apps/server/src/artifacts/*.test.ts`, `apps/server/src/project/AgentSessionScanner.test.ts`, and in `apps/web/src`: `artifactWall`, `workbenchInbox`, `sidebarInboxPresentation`, `sidebarSubtasks`, `projectMemberSelection`, `workspaceCollections`, `sidebarProviderGrouping`, `sidebarThreadPlacement`.

## What is and is not verified

- Verified by the maintainer: typecheck and the targeted tests above, plus manual checks in a sandbox with fictional data, in light and dark themes at 1280 and 1024 px.
- Used daily by the maintainer on macOS for a few days. **No long-term stability data**, no Windows/Linux testing, no testing against large artifact folders, remote access or multiple devices.
- The phone apps are not modified. Cloud login and passkeys are not tested with this fork.
- The desktop packaging scripts the maintainer uses are not part of this branch; build from source or package it yourself.

## Using it next to the official app

Do not point two different builds at the same data directory at the same time. If you package this fork as an app, give it its own name and data directory.

## Upstreaming

Upstream asks for a discussion before new features. If you want one of these changes upstream, open an Ideas discussion first; the artifact wall and subtask folding are the most self-contained.

## Credits

All of T3 Code is by the T3 Tools team and contributors. This fork only adds the diff on this branch.
