# Xiaoxin T3 Code · Community Edition

**Current recommended Mac release: C31.** Includes recovery for invisible replies in newly created threads, a stuck Run inspector and the false disconnection state of blank drafts, while retaining the customized workbench features.

[Download the recommended release · macOS Apple Silicon](https://github.com/labixiaoxins/xiaoxin-t3code/releases/latest) · [C31 notes and known limitations](docs/community/c31/RELEASE.en.md) · [简体中文](README.md)

The default development branch is `main`. C31 is this community fork's release number; its embedded official version remains 0.1.5. It is not a new upstream T3 version.

## Download and use

- **Apple Silicon Mac:** download `Xiaoxin-T3-Code-C31-macOS-arm64.zip` from the recommended release and verify its SHA-256.
- **Windows x64:** [C31-W1 test release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c31-windows-test-20261031) · [Windows source and concepts](https://github.com/labixiaoxins/xiaoxin-t3code/tree/community/windows-c31-w1). Windows testing and the recommended Mac release are published separately.
- Finish tasks and quit T3 before replacing the Mac application. Retain the previous application for rollback and preserve chats, authentication and configuration. Users supply their own provider CLIs and authentication.
- The Mac application is ad-hoc signed and not Apple-notarized. See the release notes for supported platforms, installation and verification limits.

## Included workbench features

Pinned cross-provider allowances, usage and cost views; artifact previews, image feedback and version comparison; task progress, approvals and Chinese status text; localization, search and typography controls; the existing macOS appearance, platform features and storage tools.

## Verification and known issues

The application's files match the maintainer's installed C31 byte for byte. That same application passed real Mac first/second-turn reply visibility without refresh and readback of a formerly failed thread. The distribution additionally passed isolated startup, signature, ZIP integrity and member-hash checks.

233 focused tests,20 React Compiler checks and typechecks for7 packages passed. Formatting, lint and knip findings remain documented in the C31 notes. Recommended release status does not establish every-provider, every-size or universal scenario coverage.

## History and upstream

Older releases remain available for history and rollback. Use the recommended download above for everyday use.

[All releases](https://github.com/labixiaoxins/xiaoxin-t3code/releases) · [C30 notes](docs/community/c30/RELEASE.en.md) · [C29 notes](docs/community/c29/RELEASE.en.md) · [C28 notes](docs/community/C28.en.md) · [Upstream T3 Code](https://github.com/pingdotgg/t3code)
