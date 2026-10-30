# Xiaoxin T3 Code C30: upstream core updates and a Chinese workbench

[简体中文](RELEASE.zh.md) · 2026-10-30 · macOS Apple silicon (arm64) community prerelease

C30 brings the merged upstream main changes into the Xiaoxin desktop build while retaining Chinese settings, sidebar organization, the composer and image-artifact workflows. **C30 is a community build number, not a new official release number.** The source starts from upstream 0.1.5 and actually integrates 126 subsequent upstream commits through the frozen target `97e35bcf23e4dcf34c2dcffadd37c08db0e01e52`. The community integration commit is [`a1edc7703f`](https://github.com/labixiaoxins/xiaoxin-t3code/commit/a1edc7703f8050cedd7b5afc97bba8bef5d5617d).

Source checks, package verification and post-install readback are separate validations. Package and installation status are recorded below; updated source alone does not establish that a desktop application has been replaced.

## Changes in everyday use

- **More complete stopping behavior.** Integrates upstream Stop transitions and the Force stop path for unresponsive agents, retaining permission and capability checks and stale-`runId` protection. Customized recursive delegated-task stopping and usage protection remain. Restart continuation, retry after stopping and held-queue fixes are included.
- **Explicit compaction progress.** Preserves failure reporting when Claude explicitly refuses compaction. A narrowed timeline deduplication filter retains valid compact-on-return progress while continuing to suppress duplicate generic working indicators.
- **Updated background queries and recovery.** Includes targeted recovery reads, background queries, task preparation, Git status probes and large-checkpoint transport improvements. Paginated file lists retain total file counts and access to the full diff instead of presenting the first returned prefix as the complete set.
- **Continued settings localization.** Retains Chinese categories, search and dynamic descriptions; translates new application copy and corrects model-count plurals and idle-compaction options. Brands, commands, user content, secret references and unknown external diagnostics remain unchanged.

The three-line composer, sidebar organization, context/usage/storage controls, image revision toggle, comparison rules and preview-window anchor behavior remain. Upstream file-tree improvements do not replace the customized preview window's positioning logic.

## Database, performance and data preservation

- SQLite uses up to four lazy WAL reader workers. A transaction remains bound to its acquired reader, with fallback retained when reader startup fails.
- SQL migration 073 adds two partial indexes for active turn items. It does not rewrite chat bodies or delete history. Initial index creation can still consume time, space and a writer lock.
- `temp_store = MEMORY` can reduce some disk waits and increase peak memory for large queries. Speedup figures in upstream commit titles are not performance guarantees for this build.
- Temporary V1 imports use conservative cleanup: only matching directories containing an exited PID are automatically removed. Live-PID and ownerless legacy directories are retained. An unknown owner's copy is not deleted solely because of its name or age; some leftovers therefore require manual verification before cleanup.

The new index SQL was exercised on an isolated cold-backup clone. Complete thread, message and item row fingerprints stayed unchanged and SQLite `quick_check` passed; that clone was removed. The live chat database was not written by this test.

## Secret-source support and security fixes

C30 includes backend Secrets contracts and `string | SecretReference` support for environment variables. **The server advertises these capabilities, while the web Secrets entry remains behind its default-disabled feature flag.** This does not configure or enable a password vault. No credentials were imported and no real 1Password content was read during this work.

The source also includes query-credential redaction in clone errors, logging protection for signed resource paths, compound and underscored credential-key redaction, pairing scope/code handling fixes, and rejection of unknown arguments by the thread-organization tool.

## Completed source validation

| Check | Result |
| --- | --- |
| Related automated tests | 200 files passed and one platform-only file skipped; 3,953 tests passed and seven skipped |
| React Compiler | 96 checks passed; 2,257 other cases were outside this pass |
| Package type checks | 39 packages passed |
| Formatting, lint, both knip stages, GraphQL and dependency patch checks | Passed |
| Server and web builds | Passed |
| Isolated UI and free Replay | Stop returned the UI to idle and the run ledger reached `interrupted`; Chinese navigation/search and a narrower viewport were checked |

A real compaction-progress filtering defect was fixed without changing its original assertions; all 90 tests in the timeline file passed. Other test fixtures were adapted for macOS path aliases and case-insensitive filesystems while retaining their behavior assertions, rather than changing production behavior to satisfy those assumptions.

These results do not establish completion of every repository CI, native Rust, mobile, real paid-model or external-vault validation. Replay does not prove real-provider behavior under every interruption condition. Performance also requires a valid idle sampling window after the final installation.

## Package verification

The desktop shell, server and web were rebuilt. Signatures, ZIP integrity and all 159 files/14 symlinks were verified. Privacy scanning of 3,069 text/map/native-extension entries found no matches. The packaged Electron loaded node-pty and successfully spawned a fixture shell. The public copy only strips local-build debug symbols from one node-pty member; every Mach-O section byte, architecture and export remains unchanged, and the other 95 native members are byte-identical. The original local candidate is unchanged. Full desktop launch, old-fixture migration, existing-message rendering and Chinese/English switching passed.

The target is **macOS Apple silicon (arm64)**. The community build is ad-hoc signed and is not Apple-notarized. Verify the ZIP against the release's `SHA256SUMS.txt` and `release-manifest.json`; a source commit ID is not an archive checksum.

## Post-install readback

At publication, the local C30 installer has started and is waiting for all tasks to become idle; the running app remains C29. Post-install chat, login, configuration, SQL073-index and CPU readbacks are pending and are not claimed as passed. C30→C29 startup on the same migrated synthetic fixture preserved existing message fingerprints; this is synthetic compatibility evidence, not acceptance for every real workload.

An installation receipt should distinguish staged, waiting for idle, replaced and readback-verified states. A CPU window needs at least 65 valid samples, a median of at most 5% and P95 of at most 10%. Task or input activity makes a window invalid rather than a performance failure. A pass on one device in an idle scenario is not a guarantee for every device or generation workload.

## Final-package screenshots

These actual screenshots were captured from the final C30 package with isolated synthetic data and visually inspected. Unauthenticated status in the images belongs to that isolated fixture.

![C30 Chinese settings and workbench](settings-zh.png)

![C30 English settings and language selection](settings-en.png)

## Upgrade and recovery

1. Finish active tasks and quit the old T3 application. Keep the existing app and a same-time backup of chat data, configuration and desktop state.
2. Download the Apple-silicon ZIP, verify its SHA-256 and replace the app. Run only one copy so different instances do not manage the same data simultaneously.
3. After startup, verify account access, chats, projects, settings and the current build. A running migration or background task is not completed installation acceptance.
4. To roll back, restore a known usable application first. **Do not overwrite chats created after the upgrade with an old database.** For data recovery, preserve the matching database, WAL and SHM group and verify the recovery plan first.

The [C29 release and previous notes](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c29-20261030) remain available for comparison and access to the older installer.

## Upstream, CI and license

The upstream project is [pingdotgg/t3code](https://github.com/pingdotgg/t3code); its MIT license and attribution are retained. Upstream changes are integrated as actual code while keeping community customizations; commit counts do not substitute for feature or quality validation. Existing community Actions workflows remain: the current GitHub login lacks the `workflow` scope needed to update them, and no account permissions were expanded.
