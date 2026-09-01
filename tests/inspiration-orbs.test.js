const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const appSource = fs.readFileSync(path.join(root, "app.js"), "utf8");
const cssSource = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const indexSource = fs.readFileSync(path.join(root, "index.html"), "utf8");
const rendererSource = fs.readFileSync(path.join(root, "inspiration-orbs.js"), "utf8");
const orbSource = fs.readFileSync(path.join(root, "liquid-orb.html"), "utf8");

test("four editor snapshots are preserved as complete orb presets", () => {
  const seeds = [...rendererSource.matchAll(/seed: Object\.freeze\((\[[^\]]+\])\)/g)].map(match => JSON.parse(match[1]));
  assert.equal(seeds.length, 4);
  assert.deepEqual(seeds.map(seed => seed.length), [128, 128, 128, 128]);
  assert.deepEqual(seeds.map(seed => seed[15]), [12, 10, 22, 19]);
  assert.deepEqual(seeds.map(seed => seed[3]), [0.5799999833106995, 1.2100000381469727, 0.4099999964237213, 1.7599999904632568]);
});

test("inspiration library uses one shared WebGPU engine with progressive fallbacks", () => {
  assert.equal((rendererSource.match(/requestDevice\(/g) || []).length, 1);
  assert.equal((rendererSource.match(/createRenderPipeline\(/g) || []).length, 1);
  assert.match(rendererSource, /if \(!navigator\.gpu\)/);
  assert.match(rendererSource, /prefers-reduced-motion: reduce/);
  assert.match(rendererSource, /IntersectionObserver/);
  assert.match(rendererSource, /document\.hidden/);
  assert.match(rendererSource, /Upstream: https:\/\/github\.com\/LerSent001\/orb \(MIT\)/);
  assert.match(rendererSource, /liquid-orb\.html\?shader-bridge=v2/);
  assert.match(rendererSource, /project-os:liquid-orb-shader/);
  assert.doesNotMatch(rendererSource, /fetch\s*\(/);
  assert.match(orbSource, /get\("shader-bridge"\) === "v2"/);
  assert.match(orbSource, /parent\.postMessage\(\{ type:"project-os:liquid-orb-shader", shaderSource \}, "\*"\)/);
  assert.match(cssSource, /\.inspiration-orb-fallback/);
  assert.match(cssSource, /\.inspiration-orb-canvas\.is-ready\+\.inspiration-orb-fallback\{opacity:0\}/);
});

test("every inspiration persists its orb identity and future AI state", () => {
  assert.match(appSource, /orbPresetId/);
  assert.match(appSource, /aiState/);
  assert.match(appSource, /aiSummary/);
  assert.match(appSource, /data-action="set-inspiration-orb"/);
  assert.match(appSource, /window\.ProjectOSInspirationAI=Object\.freeze/);
  assert.match(appSource, /setState\(id,aiState/);
  assert.match(appSource, /window\.ProjectOSInspirationOrbs\?\.sync\(\)/);
  assert.match(appSource, /<span class="inspiration-orb-visual"[\s\S]*?<span class="inspiration-orb-fallback" aria-hidden="true"><\/span><\/span><span class="inspiration-orb-title">\$\{escapeHtml\(item\.text\)\}<\/span><\/button>/);
  assert.match(appSource, /aria-label="\$\{escapeHtml\(item\.text\)\}，\$\{ai\.label\}"/);
  assert.doesNotMatch(appSource, /class="inspiration-orb-copy"/);
  assert.doesNotMatch(appSource, /class="inspiration-orb-state"/);
  assert.match(cssSource, /\.inspiration-orb-title\{display:-webkit-box;[\s\S]*?text-align:center/);
});

test("the primary product page loads the optional inspiration renderer before the app", () => {
  assert.ok(indexSource.indexOf('src="inspiration-orbs.js"') < indexSource.indexOf('src="app.js"'));
});
