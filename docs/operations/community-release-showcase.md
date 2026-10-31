# Community release feature images

The repository landing page is a visual product introduction. Keep the overview and feature gallery in both `README.md` and `README.en.md` on every release and homepage rewrite. This applies to Mac and Windows release entry points.

- Put the overview image near the top of each README, before installation instructions. Show the featured UI directly; a text-only list, an external link, or a collapsed `<details>` gallery is insufficient.
- Retain visible coverage of allowances, task progress, artifacts and image feedback, context, model selection, usage/cost, storage, and localized settings. Update stale pictures with equally clear replacements when the UI changes. Existing image assets remain available for historical notes.
- Each image states whether it is a concept, source-component preview or isolated-runtime screenshot. Identify platform differences and earlier-version screenshots. Use synthetic projects and values; do not publish private chats, account quotas, credentials or client materials.
- Every new community Release includes an inline overview plus the full gallery link. Keep existing useful release images when editing notes.

The image provenance and required coverage are recorded in `assets/community/showcase/manifest.json`. The HTML comments `showcase:<id>` associate each README section with its image; keep them when editing headings.

Before pushing homepage changes, run:

```sh
node .github/scripts/check-community-showcase.cjs
```

Before publishing or rewriting community release notes, run the same check with the intended Markdown body:

```sh
SHOWCASE_RELEASE_BODY=/path/to/release-body.md node .github/scripts/check-community-showcase.cjs
```

The standalone check needs no dependency installation or model calls. It reports missing, collapsed and broken images. Run it locally before every publication.

The **Community Feature Showcase** workflow runs the same check on relevant pushes and pull requests to `main` and the maintained community branches, and on published or edited releases. For release events it checks the current default-branch gallery and the event's release body, including when the release tag predates this check. It has read-only repository access, installs no project dependencies and calls no models. A failed check reports the problem; it does not delete images, undo a push or unpublish a release.

To check an existing release, run the workflow manually with its optional `release_tag` input. Keep the local pre-publication check: an automated post-publication check cannot prevent an incomplete release from being published.
