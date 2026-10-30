# C30 source synchronization: a real upstream merge with C29 customizations

> This document records the earlier source-sync phase. The C30 desktop package was released afterward; see the [C30 release notes](RELEASE.en.md) for release and installation status.


[简体中文](SYNC.zh.md) · 2026-10-30

This update synchronizes GitHub source code. The installed desktop application and public download remain [C29](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c29-20261030), based on upstream 0.1.5. This source synchronization does not replace the installed application or publish a new C30 desktop installer.

## History repair followed by an actual merge

GitHub previously showed “412 commits behind”: 286 were a missing-ancestry accounting gap, and 126 were actual upstream commits not yet integrated. C29's actual runtime source already included upstream 0.1.5, but the public commit graph did not fully express that relationship.

History bridge `75f0e9b097` preserves the C29 file tree and restores the ancestry of the stable version already present. After that bridge, GitHub still showed 126 upstream commits to integrate. Those 126 commits are then merged against the frozen upstream main revision `97e35bcf23e4dcf34c2dcffadd37c08db0e01e52`, resolving core and UI conflicts while retaining both sides' behavior.

The bridge does not mark unmerged main code as integrated. Nor does this synchronization use an `ours` merge to attach main as a parent while discarding its code. The synchronization merge retains both the community branch and frozen upstream main as parents. The number 126 counts commits, not features; it includes fixes, tests, internal changes, and new capabilities.

## Main source changes

### Stop and recovery behavior

- Integrate upstream Stop state transitions and the Force stop path for unresponsive agents, retaining permission and capability checks and stale-`runId` protection so an old action cannot stop a new run.
- Integrate restart continuation, retry, and held-queue fixes while retaining customized recursive delegated-task Stop rules and usage protection.
- Preserve C29's compaction-refusal classification. Also narrow an over-broad timeline filter so compact-on-return and related cases retain an explicit compaction indicator without duplicating generic working indicators.

### Database and performance implementation

- Move from one SQLite reader to a lazy pool of up to four WAL reader workers. Transactions remain bound to their acquired reader, with fallback when reader startup fails.
- SQL migration 073 adds two partial indexes for active turn items. It does not rewrite chat content or delete history. Initial index creation can still consume time, storage, and a writer lock.
- Integrate targeted recovery reads, background-query improvements, prepare-run allocation changes, Git status probing, and large-checkpoint transport improvements. Full checkpoint totals and the full-diff entry remain available; a file prefix must not be mistaken for the complete file list.
- `temp_store = MEMORY` can reduce some disk waits while increasing peak memory for large queries. Speedup figures in upstream commit titles are not performance guarantees for this fork.

### Secret references and security fixes

- Integrate Secrets backend capabilities, provider contracts, and `string | SecretReference` environment values. The backend supports these capabilities, while the web Secrets UI feature flag remains disabled by default. This synchronization does not enroll an external vault, import credentials, or read real 1Password secrets.
- Retain upstream protections for query credentials in clone-error URLs, signed resource paths in instrumentation, compound and underscored credential keys, pairing scope and code handling, and unknown arguments to thread organization tools.
- Apply a conservative V1 import-temporary-copy cleanup rule: automatically remove only matching PID-bearing temporary directories whose owner PID has exited. Preserve live-PID copies and legacy directories without a PID. An ownerless legacy name alone cannot establish that a copy is unused; the tradeoff is retaining some old residue instead of automatically reclaiming it.

## Preserved Xiaoxin customizations

C29 Chinese settings and search, the three-line composer, context/usage/storage entry points, optional image revision feedback, image comparison behavior, preview mini-player anchoring, and sidebar grouping remain present. New application-authored UI copy receives Chinese translations; user content, secret references, commands, brands, and unknown external diagnostics remain unchanged.

Upstream file-explorer width and keyboard improvements are distinct from the customized preview mini-player anchor fix. Upstream added and then reverted a composer Markdown toggle within this range; the integration follows the final net result rather than restoring the reverted intermediate feature.

## Retained CI workflows

The current GitHub login lacks the `workflow` scope required to update Actions workflows. This merge retains the existing community `.github/workflows/` configuration rather than publishing the upstream workflow changes. Application source and upstream ancestry are merged. A zero-behind count describes commit ancestry, not byte-for-byte equality with every upstream file. No account permissions were expanded.

## Validation record

Final changed-source checks passed: 200 test files passed and one platform-only file was skipped; 3,953 tests passed and seven were skipped. All 96 selected React Compiler checks passed (2,257 other cases were outside this pass). Type checks across 39 packages, formatting, lint, both knip stages, GraphQL and dependency patch checks passed. Server and web builds passed.

Additional verification covered SQLite reader-pool behavior, Stop/Force stop contracts, and the exact index migration on a private cold-backup clone with unchanged complete row fingerprints; the clone was removed. In the actual isolated UI, the free Replay scenario stopped through the UI and reached interrupted in the run ledger. Chinese navigation/search and a narrower viewport were checked. No real paid model was invoked.

Read validation results together with their scope. This work does not constitute complete repository CI, native Rust, mobile, real paid-model, or real external-vault acceptance. Isolated data and Replay checks do not validate every platform, production workload, or third-party account. A source merge does not mean a new desktop application has been installed.

For the currently available desktop version, use the [C29 release page](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c29-20261030). A subsequent desktop release still requires its own build, packaging, installation, and post-install data/performance readback.
