# Xiaoxin T3 Code · Community Edition

**Current recommended Mac release: C31.** Includes recovery for invisible replies in newly created threads, a stuck Run inspector and the false disconnection state of blank drafts, while retaining the customized workbench features.

[Download the recommended release · macOS Apple Silicon](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [C31 notes and known limitations](docs/community/c31/RELEASE.en.md) · [简体中文](README.md)

The default development branch is `main`. C31 is this community fork's release number; its embedded official version remains 0.1.5. It is not a new upstream T3 version.

<a id="feature-showcase"></a>

<!-- showcase:overview -->

![Mac workbench overview: allowances, image feedback and task progress](assets/community/showcase/01-workbench-overview.png)

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

- **Apple Silicon Mac:** download `Xiaoxin-T3-Code-C31-macOS-arm64.zip` from the recommended release and verify its SHA-256.
- **Windows x64:** [C31-W1 test release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows source and concepts](https://github.com/labixiaoxins/xiaoxin-t3code/tree/community/windows-c31-w1). Windows testing and the recommended Mac release are published separately.
- Finish tasks and quit T3 before replacing the Mac application. Retain the previous application for rollback and preserve chats, authentication and configuration. Users supply their own provider CLIs and authentication.
- The Mac application is ad-hoc signed and not Apple-notarized. See the release notes for supported platforms, installation and verification limits.

## Verification and known issues

The application's files match the maintainer's installed C31 byte for byte. That same application passed real Mac first/second-turn reply visibility without refresh and readback of a formerly failed thread. The distribution additionally passed isolated startup, signature, ZIP integrity and member-hash checks.

233 focused tests,20 React Compiler checks and typechecks for7 packages passed. Formatting, lint and knip findings remain documented in the C31 notes. Recommended release status does not establish every-provider, every-size or universal scenario coverage.

## History and upstream

Older releases remain available for history and rollback. Use the recommended download above for everyday use.

[All releases](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [C30 notes](docs/community/c30/RELEASE.en.md) · [C29 notes](docs/community/c29/RELEASE.en.md) · [C28 notes](docs/community/C28.en.md) · [Upstream T3 Code](https://github.com/pingdotgg/t3code)
