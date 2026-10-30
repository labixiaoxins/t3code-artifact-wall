# Xiaoxin T3 Code C29: Chinese settings and engineering repairs

[简体中文](RELEASE.zh.md) · 2026-10-30

C29 continues the Xiaoxin customization based on upstream 0.1.5. It expands Chinese settings coverage and resolves the engineering-check failures disclosed with C28. This update does not merge a newer upstream main, nightly build, or pending pull request.

## Settings changes

- Settings categories, navigation, breadcrumbs, search results, and descriptions use the existing bilingual catalog. Settings can be searched in Chinese.
- Dynamic copy now includes loading, empty archives, failure, signed-out, release-checking, and offline webhook states.
- Product names, commands, URLs, user-authored content, and unknown external diagnostics remain intact.
- Save the language through the language menu and reload to switch between Simplified Chinese and English, without clearing chats or settings.
- The implementation reuses the existing localization system rather than introducing another framework.

These screenshots show the actual candidate application running with an isolated test data directory, not design mockups. Signed-out providers reflect that test environment.

![Chinese source-control settings and provider descriptions](settings-zh.png)

![English general settings and language selection](settings-en.png)

## Functional and engineering repairs

- Resolve React Compiler blockers in affected components, including ContextHandoffNotice and StorageManagementPanel, and clarify required lifecycle handling.
- Correct AgentContextBudget accounting, test imports, unused exports, and the knip entry for a dynamically loaded worker.
- Restore the dependencies required by the lockfile so peripheral package type checks can run, without removing affected modules to bypass checks.
- Report explicit refusal of local Claude compaction as failure rather than successful completion; interrupted operations retain their interrupted status.
- Apply configuration-history retention to the read-only display even when browser storage writes fail.
- Reset only the rich-text composer preference when using its reset action, preserving the image revision preference; remove a duplicate authentication-status link.
- Ignore only the model catalog's root-level `fetchedAtMs` refresh timestamp in installation configuration comparisons. Other configuration and authentication content remains strictly checked, preventing a normal catalog refresh from causing a false rollback.

## Validation and scope

| Check | Result |
| --- | --- |
| Changed-source formatting, lint, both knip stages, GraphQL | Passed |
| Package type checks | 36 packages passed |
| Relevant automated tests | 772 tests in 64 files passed |
| React Compiler checks | 99 passed; 1246 excluded by change scope |
| Installer regression tests | 60 passed |
| Server and web builds | Passed |
| Full application signature, native payload, and icon verification | Passed; 96 native entries preserved |
| Actual candidate UI | Chinese search, source control, general settings, empty archives, and round-trip language switching passed |
| Window sizes | 1440×1000 and 1000×760; screenshots inspected, no document-level horizontal overflow observed |

On one maintainer macOS device, C29 completed post-install application, data, authentication, and configuration readback checks. A valid idle window contained 65 renderer CPU samples: median 0.5%, P95 0.7%. This passed the window's median ≤5% and P95 ≤10% thresholds. These are observations from one device and idle workload, not a performance guarantee for other machines, long-running tasks, or generation workloads.

The complete repository CI/Rust suites were not run, and every external-provider error state was not reproduced. Passing results apply to the checks listed here and the local installation verification; they are not comprehensive stability certification for every platform.

## Upgrade and recovery

Keep existing configuration, chat data, and a usable application backup before upgrading. Let active tasks finish before replacing the application. The maintainer's local installation procedure retained a C28 rollback application and a cold data backup, and verified that existing data and authentication information were preserved. Verification of that local procedure does not imply equivalent coverage for every download or installation method.

For recovery, restore the application version first; do not overwrite new chats with an older database. CPU windows affected by task activity or user input must not be treated as performance failures.

## References and acknowledgments

The work reviewed upstream localization proposals [#16673](https://github.com/pingdotgg/t3code/pull/16673), [#16087](https://github.com/pingdotgg/t3code/pull/16087), and [ZhiweiXiao98/t3code](https://github.com/ZhiweiXiao98/t3code). Both proposals were unmerged when checked. This version retains the existing translation catalog and its MIT attribution, adding copy for the current code structure rather than directly applying an incompatible branch.
