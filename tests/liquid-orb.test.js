const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const orbSource = fs.readFileSync(path.join(root, "liquid-orb.html"), "utf8");

test("dashboard embeds the liquid orb as a decorative isolated page", () => {
  assert.match(appSource, /class="overview-orb" aria-hidden="true"/);
  assert.match(appSource, /<iframe src="liquid-orb\.html"[^>]*tabindex="-1"/);
  assert.match(cssSource, /\.overview-orb iframe\{[^}]*pointer-events:none/);
});

test("liquid orb keeps WebGPU progressive enhancement safeguards", () => {
  assert.match(orbSource, /if \(!navigator\.gpu\)/);
  assert.match(orbSource, /id="fallback" aria-hidden="true"/);
  assert.match(orbSource, /prefers-reduced-motion: reduce/);
  assert.match(orbSource, /if \(document\.hidden\)/);
  assert.match(orbSource, /Upstream: https:\/\/github\.com\/LerSent001\/orb \(MIT\)/);
});
