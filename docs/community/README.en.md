# Installation and recovery · C28

> C28 is a prerelease. Maintainer installation and data/runtime readbacks passed; idle CPU acceptance and aggregate checks are not all green. See [C28 validation and limits](C28.en.md).

[简体中文](README.md) · [Feature guide](../../README.en.md)

## Install

1. Download `Xiaoxin-T3-Code-C28-macOS-arm64.zip` and `SHA256SUMS.txt` from the [C28 release](https://github.com/labixiaoxins/xiaoxin-t3code/releases/tag/xiaoxin-c28-20261030). This package is for Apple silicon Macs. The minimum macOS version is recorded in release-manifest.json.
2. Run `shasum -a 256 -c SHA256SUMS.txt` in the download folder. If you downloaded only some assets, check the corresponding lines. Extract and move the app into Applications.
3. This community build is ad-hoc signed and not Apple-notarized. If macOS blocks the first launch, verify this repository, the checksum and the app’s source, then use the system’s allowed-open flow in Privacy & Security. Do not disable global system protection.
4. Sign in to your own providers. No maintainer account, API endpoint, subscription, private skill collection or chat data is included.

## Upgrade an existing T3 installation

This edition uses the existing T3 application identity and data locations. It is not automatically isolated. **Do not run official and community copies simultaneously.**

1. Finish tasks and quit normally. Ensure the old application and backend are stopped.
2. Back up the matching app, T3 home (normally `~/.t3`) and persistent desktop state (this package normally uses `~/Library/Application Support/t3code-v2`) at the same point in time. Include any custom home or external references you configured. Keep personal data and credentials on your own devices.
3. Replace the app, launch it, and check projects, chats, login, provider configuration, keybindings and preferences. Upstream migrations or maintenance may run; application rollback is not database rollback.

## Recovery

Preserve the current post-upgrade app and a consistent data snapshot first. Restore an older matching app/configuration/database set into a **new directory** and test it in isolation before switching. Never overwrite your only current data copy or let an old binary blindly write a newer database.

An older database does not automatically include newer chats and changes. Identify differences and preserve/export new work before accepting any destructive rollback. This ZIP contains no force-quit, database-wipe or personal-data overwrite installer.

## Storage operations

In Usage → Disk space, check the selected environment and measurement timestamp, then inspect directories, choose a destination and preview the plan. Archive-only keeps sources. Archive-and-release requires reviewed eligibility; age alone is insufficient for unknown runtime references, unaccepted rollback chains or unique work. Local indexes remain useful while external drives are offline. Restore to a new directory.

## Run from source

Use branch `community/xiaoxin-c28` or tag `xiaoxin-c28-20261030`. Install the Node.js version required by the root package.json and Vite+, then run `vp i` and `vp run dev --no-seed`. Keep development state separate from production. Never point a test server at the live `~/.t3/userdata`.

The official baseline is 0.1.5. Release builds align package versions with `scripts/update-release-package-versions.ts 0.1.5`; a base package.json field alone does not identify the installed distribution.

See LICENSE for the MIT license and upstream attribution. Provider terms, account permissions, private dependencies and quotas remain your own responsibility to configure and verify.
