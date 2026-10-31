const fs = require("node:fs");
const path = require("node:path");

// Standalone so the public-gallery check needs no workspace dependencies or model calls.
const root = path.resolve(process.env.SHOWCASE_ROOT || path.join(__dirname, "../.."));
const manifestPath = path.join(root, "assets/community/showcase/manifest.json");
const failures = [];
const required = [
  "overview",
  "allowances",
  "progress",
  "artifacts",
  "context",
  "models",
  "usage",
  "storage",
  "settings",
];
const fail = (message) => failures.push(message);
const markdownImages = (text) => [...text.matchAll(/!\[([^\]]*)\]\(([^\s)]+)\)/g)];
const foldedAt = (text, offset) => {
  let depth = 0;
  for (const tag of text.slice(0, offset).matchAll(/<\/?details\b[^>]*>/gi)) {
    depth += /^<\//.test(tag[0]) ? -1 : 1;
  }
  return depth > 0;
};

function check() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const ids = manifest.features.map((feature) => feature.id);
  if (new Set(ids).size !== ids.length) fail("Duplicate feature ids in showcase manifest");
  for (const id of required) if (!ids.includes(id)) fail(`Required feature missing: ${id}`);

  for (const readme of manifest.readmes) {
    const text = fs.readFileSync(path.join(root, readme.path), "utf8");
    const images = markdownImages(text);
    const install = text.indexOf(readme.installHeading);
    if (install < 0) fail(`${readme.path}: installation section not found`);
    if (!text.includes('<a id="feature-showcase"></a>')) {
      fail(`${readme.path}: stable feature-showcase anchor missing`);
    }
    for (const feature of manifest.features) {
      const marker = `<!-- showcase:${feature.id} -->`;
      const start = text.indexOf(marker);
      const next = text.indexOf("<!-- showcase:", start + marker.length);
      const end = next < 0 ? text.length : next;
      const asset = feature.images?.[readme.language] || feature.image;
      if (!asset || path.isAbsolute(asset) || asset.split("/").includes("..")) {
        fail(`${readme.path}: ${feature.id} must use a repository-owned image`);
        continue;
      }
      const image = images.find(
        (entry) => entry[2] === asset && entry.index > start && entry.index < end,
      );
      if (start < 0 || !image) {
        fail(`${readme.path}: visible image missing for ${feature.id}`);
        continue;
      }
      if (!image[1].trim()) fail(`${readme.path}: ${feature.id} needs descriptive alt text`);
      if (foldedAt(text, image.index)) fail(`${readme.path}: ${feature.id} is hidden in details`);
      if (install >= 0 && image.index >= install) {
        fail(`${readme.path}: ${feature.id} must appear before installation instructions`);
      }
      if (feature.id === "overview") {
        const line = text.slice(0, image.index).split("\n").length;
        if (images[0] !== image || line > 18) {
          fail(`${readme.path}: overview must be the first image within the opening 18 lines`);
        }
      }
      const file = path.join(root, asset);
      if (!fs.existsSync(file)) {
        fail(`${readme.path}: image file missing: ${asset}`);
        continue;
      }
      const bytes = fs.readFileSync(file);
      const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
      if (bytes.length < 24 || !bytes.subarray(0, 8).equals(png)) {
        fail(`${readme.path}: invalid PNG: ${asset}`);
      } else if (bytes.readUInt32BE(16) < 640 || bytes.readUInt32BE(20) < 360) {
        fail(`${readme.path}: image too small to explain the UI: ${asset}`);
      }
    }
  }

  let releaseBody;
  if (process.env.SHOWCASE_RELEASE_BODY) {
    releaseBody = fs.readFileSync(process.env.SHOWCASE_RELEASE_BODY, "utf8");
  } else if (process.env.GITHUB_EVENT_NAME === "release") {
    const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (event.release?.tag_name?.startsWith("xiaoxin-c")) releaseBody = event.release.body || "";
  }
  if (releaseBody !== undefined) {
    const images = markdownImages(releaseBody);
    if (!releaseBody.includes("<!-- community-showcase -->"))
      fail("Release: showcase marker missing");
    if (!releaseBody.includes(manifest.galleryUrl))
      fail("Release: full feature gallery link missing");
    if (!images.some((image) => !foldedAt(releaseBody, image.index))) {
      fail("Release: an inline overview image is required");
    }
  }
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(
    `Showcase verified: ${manifest.readmes.length} READMEs, ${ids.length} visible feature images each${releaseBody !== undefined ? ", release overview and gallery link" : ""}.`,
  );
}

try {
  check();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
