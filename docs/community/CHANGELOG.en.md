# Community changelog

## C25 · 2026-10-29

- Fix repeated artifact-count state updates that could create a renderer update loop.
- Identify revision requests with stable source-thread/path/revision/time/size metadata rather than temporary access IDs; draft matching and comparison guards use the same stable key.
- Recognize artifact paths next to full-width punctuation.
- Add optional sidebar font, size and light/dark text preferences while preserving existing defaults.
- Include context-handoff/UI baseline cleanup and retain the C23 features and complete official 0.1.3 baseline.

C25 is a community build number, not a new official version. Revision checks remain model-executed, without filesystem locks; feedback drafts do not survive a reload. The Electron revision interaction has not been re-accepted click by click; the real-model revision check was performed on web.


## C23 · 2026-10-28

Added a [full C13 → C23 comparison](C13-TO-C23.en.md), covering search, optional quota safeguards, run visibility, storage, upstream integration and retained capabilities.

Cumulative changes since C13: the complete official 0.1.3 baseline with applicable backend backports and the Chinese workbench; actionable storage inspection, planning, verified archives, safeguarded release and restore-to-new-directory; a single-row model picker; compact provider icons and lighter sidebar text; model bookmarks instead of a misleading work-mode preset; explicit review requests; a 3.5-line composer and one light footer row retaining original brand and Gauge icons.

C21 experimented with manual resizing; C22 removed it following feedback. The final C23 has no resize grip or manual height memory. Its last implementation change is renderer-only, with backend bytes unchanged from C22.

Official baseline: `d2c440312e5f39d59827ed466838a623516454d6`. Installed implementation source: `6d3627c85508ab2bb45c7f1bf04b07f170d00e2b`. The release documentation commit is a descendant. See the root README for details.

## Earlier releases

- [C13 · Project workbench and interface showcase](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c13-20261026)
- [C11 · Earlier community edition](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c11-20261024)

Historical releases remain available. Their own tags describe their upstream baseline and limitations.
