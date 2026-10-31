# Xiaoxin T3 Code C31 · macOS Apple Silicon

[简体中文](RELEASE.zh.md) · 2026-10-31 · Community release · Recommended Mac build · arm64

<!-- community-showcase -->

[Full feature gallery](https://github.com/labixiaoxins/xiaoxin-t3code#feature-showcase)

![Workbench feature-layout concept](https://raw.githubusercontent.com/labixiaoxins/xiaoxin-t3code/main/assets/community/showcase/01-workbench-overview.png)

_Concept with fictional content. Runtime and component-preview provenance is stated in the full gallery._
<!-- /community-showcase -->

This release distributes an unchanged copy of the currently installed C31 Mac application. It retains the macOS appearance, pinned allowances, artifacts and image feedback, Chinese localization, task progress, typography and storage features. C31 is a community build number. The embedded official version remains 0.1.5; this is not a new official T3 release.

Changes include recovery from a temporary pre-creation thread 404, correction of the blank-draft disconnection state, sidebar task progress and additional Chinese approval/work-state text. It inherits the upstream integration already shipped in C30.

Download `Xiaoxin-T3-Code-C31-macOS-arm64.zip`. Quit all T3 instances and finish active tasks before replacing the application. Keep the previous app for rollback and retain your T3 data directory. Run only one application against the same data. Provider CLIs and authentication are supplied by the user. This is an Apple Silicon build, not an Intel or Windows build.

The app is ad-hoc signed and not Apple-notarized. No system security settings are changed by this release.

Validation: all 159 regular files and 14 symbolic links, including permissions, match the installed bundle. ASAR bytes are unchanged. Signature, ZIP CRC and member hashes passed. The same installed ASAR previously passed real Mac first/second-turn reply visibility without refresh and readback of a formerly failed thread. This does not establish all-provider coverage or fix independent Antigravity initialization failures. This release additionally starts the copied server in isolated empty state and checks its descriptor and web entry, without model calls or production data.

Source checks: 233 focused tests, 20 React Compiler checks and typechecks for 7 packages passed. Formatting still reports 2 files, lint 3 findings and knip 3 unused replay exports. The complete check is not green. Existing installed behavior was preserved rather than adding UI changes for this distribution. All providers, screen sizes and long-term idle CPU behavior are not fully verified.

No maintainer accounts, chats, projects, credentials, private settings or real screenshots are included. Default branch: `main`; C31 archival branch: `community/xiaoxin-c31`. Windows releases remain separate. SHA-256, bundle verification and isolated smoke-test receipts are attached.

Release status: C31 is now the repository's recommended release and Latest download. This promotion changes release entry points and packaging notes only; application files and the verification limits above are unchanged.
