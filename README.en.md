# Xiaoxin T3 Code · Community Edition

**Mac C31 prerelease:** [Download Apple Silicon build](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-20261031) · [Validation and limitations](docs/community/c31/RELEASE.en.md) · [Windows C31-W1](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031)

**Previous Mac release: C30.** [Download C30](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c30-20261030) · [Detailed notes](docs/community/c30/RELEASE.en.md)

**Source synchronization:** upstream `main` is actually merged through `97e35bcf23` (2026-10-30). [Changes and validation](docs/community/c30/SYNC.en.md). C31 inherits the C30 integration and adds thread subscription recovery, task progress and localization fixes. Its package matches the currently installed C31 application byte for byte; validation limits are documented in the C31 notes. The C29 information below is retained as history.

**Previous desktop release: C29 (official baseline 0.1.5)** · [Download](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c29-20261030) · [Detailed release notes](docs/community/c29/RELEASE.en.md) · [简体中文](README.md)

Repairs C28 engineering check failures and completes settings localization, search and dynamic copy. 772 related tests, 99 React Compiler checks and type checks across 36 packages pass. Post-install account, chat and configuration preservation was verified. Distributed as a community prerelease, not a claim of full CI or universal device validation.

![C29 English settings, isolated fixture runtime](docs/community/c29/settings-en.png)

## Existing features and historical C28 notes

[简体中文](README.md) · [Download C28 prerelease](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c28-20261030) · [Full release and usage guide](docs/community/C28.en.md) · [Upstream T3 Code](https://github.com/pingdotgg/t3code)

A community edition based on **official T3 Code 0.1.5**, retaining T3's bring-your-own-subscription workflow and improving everyday composition, long-conversation information, image review and local storage management. `C28` is this project's community build label, not an official version number.

This is a **cumulative C25 → C28 prerelease**, including the intervening interface and core upgrades. C28 is installed on the maintainer's Mac, with the running application, renderer entry, existing messages, projects, sidebar state, configuration and login-key preservation checks passed. **Idle CPU acceptance remains pending.** See the [validation record](docs/community/C28.en.md#validation-and-known-limitations) for the exact scope.

## What changes in daily use

| Problem                                                      | C28 behavior                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| The composer is too tall and the footer too crowded          | A three-line default text area; the built-in council entry is removed, so reviews can be requested when needed |
| New-task defaults take up space in the model picker          | Removes that footer and its extra entry points while retaining model search, favorites and selection           |
| The context popup contains too much detail                   | Shows key usage and continuation actions first, with runtime details available on demand                       |
| Cost and Tokens look like the same view                      | Cost uses currency and cost shares; Tokens uses token counts and token shares                                  |
| Disk space only reports sizes                                | Filter by disk, category and protection state, then preview an archive, eligible release or restore plan       |
| Portrait and landscape comparisons interfere with each other | Improved clipping and A / B whole-image viewing; image revision feedback is off by default and can be enabled  |
| A floating web preview drifts after growing and shrinking    | Corrected anchor and size-restoration behavior                                                                 |

Customized sidebar appearance is retained, with the upstream sidebar layout also available. This edition does not automatically enable multi-model reviews and includes no model subscription, account, private configuration or API key.

## Cost and tokens use distinct metrics

Open Usage and switch between Cost and Tokens. The Cost total, provider amounts, shares and chart now consistently use currency. Tokens uses token counts instead. The fix covers both Chinese and English interfaces.

![C28 Cost view with currency totals, cost shares and token details](assets/community/c28/01-cost.png)

_Actual C28 packaged application capture with isolated test data. Amounts are API usage estimates, not subscription invoices, confirmed charges or prepaid balances. Unpriced or unavailable data must not be interpreted as zero cost._

## Disk space with scoped actions

Usage → Disk space offers disk selection, on-demand size measurement, name/path search, and categories for items to organize, older backups, protected data, and archives/history. Inspect the source, path and available actions before confirming a specific plan.

![C28 disk management with categories, measurement and actions](assets/community/c28/02-storage.png)

_Actual C28 packaged application capture; directory contents use isolated test data. Displayed sizes do not promise a reclaimable amount._

- Separates workspace totals, dependencies, build outputs, logs and protected data. A workspace includes its children; overlapping sizes are not counted twice as reclaimable space.
- Retains external-drive archiving, release for reviewed eligible sources, operation history and restoration to a new directory. Archive-only keeps source files.
- Adds a preview for rotated logs older than 30 days: create and verify a compressed copy, register its recovery index, then process only confirmed files that have not changed. Current logs remain.
- Selecting an external disk hides the log-cleanup action belonging to the T3 data disk, keeping the operation's scope clear.

This is scoped T3 storage management, **not a whole-disk cleaner**. It does not automatically classify every AI application's files, cache, old backup or aging directory as disposable. Unknown references, unreviewed items and valid rollback data remain protected. The archive and cleanup worker currently supports macOS.

## Compact context and model selection

The context panel puts status and primary actions first. Runtime, speed and reporting details expand when needed. The model picker no longer includes the new-task-default footer; everyday search and selection remain.

![Compact context component preview](assets/community/c28/03-context.png)

![Model picker component preview without the default-settings footer](assets/community/c28/04-model-picker.png)

_These two images render the corresponding source components with fictional data. The surrounding composer is a preview frame, not a full application capture, and does not prove that a model turn ran._

## Image comparison for mixed aspect ratios

Image revision feedback is off by default and can be enabled when needed. Comparison clipping is improved on both sides. Viewing A or B alone hides the other image, preventing a landscape image from showing around a portrait image. Viewing modes do not alter the original files or dimensions.

![Mixed-aspect image comparison and whole-image viewing](assets/community/c28/05-image-comparison.png)

_Actual C26 packaged application capture of the mixed-aspect test, retained as part of this cumulative release. It uses test images and is not evidence of a new real-model revision run._

## Download, upgrade and recovery

Download `Xiaoxin-T3-Code-C28-macOS-arm64.zip` from the [C28 release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c28-20261030), and verify it against `SHA256SUMS.txt` on the same page. The current package targets Apple silicon Macs, is ad-hoc signed and is not Apple-notarized. See the release manifest for the minimum OS requirement.

Existing T3 users should finish tasks, quit normally, back up the matching application and complete data state at the same point in time, then replace the application. This edition uses T3's existing application identity and data locations. **Do not run official and community copies simultaneously.** Application rollback and database rollback are separate operations; never overwrite your only current data with an older database. See the [C28 installation and recovery guide](docs/community/C28.en.md#download-upgrade-and-recovery).

## Validation at a glance

- All 33 C28 feature tests and 48 installer tests passed. Web, server and contracts typechecks, targeted lint and builds passed.
- Isolated data checks covered metric switching, disk classification, volume-scoped actions, rotated-log archiving/cleanup and restoration. The UI was inspected at 1280px in light mode and 390px in dark mode.
- C28 is installed locally and its application/data-preservation readbacks passed; idle CPU acceptance remains pending.
- Full `check:changed` is not green: lint, knip, budget-test and React Compiler findings remain, and aggregate typechecking is blocked by missing Astro. Exact results, public-package comment normalization and uncovered scenarios are listed in the [detailed release record](docs/community/C28.en.md#validation-and-known-limitations).

Focused checks do not establish acceptance for every platform, model provider, remote connection or mobile client. Illustrations do not substitute for functional tests. Upstream MIT licensing and attribution are retained.

[C25 historical record](docs/community/C25.en.md) · [C13 → C23 history](docs/community/C13-TO-C23.en.md) · [Upstream README](README.upstream.md)
