# Xiaoxin T3 Code · Community Edition

**Current Windows test build: C31-W1.** Retains the official minimal layout with pinned allowances, task progress, artifact feedback and Chinese workbench controls. The recommended Mac release is maintained on `main`.

[Download Windows test build](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows notes and limitations](docs/community/windows-c31-w1/RELEASE.zh.md) · [Recommended Mac release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [简体中文](README.md)

C31-W1 is a community test build number; its embedded official version remains 0.1.5. This branch maintains the Windows test interface.

<a id="feature-showcase"></a>

<!-- showcase:overview -->

![Windows workbench overview: allowances and task progress](assets/community/showcase/03-task-progress.png)

_Feature-layout concept with fictional content; not an acceptance screenshot._

## See the workbench features

Images are visible directly and can be opened at full size. Overview, allowance, task and artifact images are layout concepts; context and model menus are component previews; usage, storage and settings images are previously published isolated-runtime screenshots. Earlier screenshots illustrate retained features; provenance is stated below each image.

<!-- showcase:allowances -->

### Pinned cross-provider allowances

Keep remaining allowances in the header and expand account, window and reset details. Each provider retains its own reporting window.

![Pinned allowances and expanded window details](assets/community/showcase/02-allowances.png)

_Windows layout concept with fictional values; actual windows depend on provider data._

<!-- showcase:progress -->

### Task steps and sidebar progress

See completion counts and the current stage in the sidebar, then open the full step list in Run. Running, waiting for confirmation and completed states remain distinct.

![Task steps and sidebar progress](assets/community/showcase/03-task-progress.png)

_Windows layout concept with synthetic tasks. The Mac build retains its macOS appearance._

<!-- showcase:artifacts -->

### Artifact previews, image comparison and feedback

Review outputs, compare an original with a proposed revision and compose feedback before sending it for another turn.

![Artifact preview, version comparison and feedback draft](assets/community/showcase/04-artifacts-feedback.png)

_Windows feature-layout concept using synthetic illustrations; it does not prove a real revision was executed._

<!-- showcase:context -->

### Long-conversation context

Keep context usage and continuation actions compact, with runtime details available when needed.

![Compact context panel and continuation actions](assets/community/c28/03-context.png)

_Existing source-component preview with fixture data and a surrounding preview frame._

<!-- showcase:models -->

### A compact model picker

Search, favorite and switch models without a permanent default-settings footer.

![Model search, favorites and compact selection](assets/community/c28/04-model-picker.png)

_Existing source-component preview; available models depend on the configured provider._

<!-- showcase:usage -->

### Usage, cost and tokens

Inspect time ranges and model breakdowns with separate cost and token metrics.

![Cost, model shares and token breakdown](assets/community/c28/01-cost.png)

_C28 isolated-runtime screenshot with synthetic usage. Costs are API estimates, not a subscription bill or payment record._

<!-- showcase:storage -->

### Scoped storage management

Inspect workspaces, dependencies, builds and logs by volume and category. Preview a specific plan before acting on eligible items.

![Storage categories, occupancy and planned actions](assets/community/c28/02-storage.png)

_C28 isolated-runtime screenshot with fixture directories. Occupancy is not reclaimable space; the archive worker currently supports macOS._

<!-- showcase:settings -->

### Chinese and English settings

Localized categories, search and dynamic guidance accompany the retained appearance and typography controls.

![English settings and feature categories](docs/community/c30/settings-en.png)

_Previously published C30 isolated-runtime settings screenshot._

## Download and use

- Extract `Xiaoxin-T3-C31-W1-win-x64.zip` into a fixed folder and start with `Start-Xiaoxin-T3.cmd`. Application and window state use an independent test directory.
- Codex CLI requires at least 0.159.0. Validation used an isolated official 0.166.0 without replacing the global CLI. Other providers require the user's own CLI and authentication.
- [Windows download and full notes](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Recommended Mac release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest).

## Verification and known issues

The native Windows executable, SQLite and server started on Windows 11 x64. A browser connected to the Windows backend displayed real first- and second-turn replies without refresh. Interactive window appearance, scaling and all-provider coverage remain incomplete.

The macOS archive/restore worker and notch utility have not been ported to Windows. Storage and settings screenshots show the previously published isolated Mac environment. See the Windows release notes for actual platform coverage.

## History and upstream

[All releases](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [Mac mainline](https://github.com/labixiaoxins/xiaoxin-t3code/tree/main) · [Upstream T3 Code](https://github.com/pingdotgg/t3code)
