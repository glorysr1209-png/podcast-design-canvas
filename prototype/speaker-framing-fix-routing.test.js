"use strict";

// Guards speaker-framing-safety hand-off links (#583): a coverage issue is resolved on
// the screen that owns the overlap, so captions/lower-third route to layout safe areas
// and b-roll routes to the contextual b-roll screen.
// Run with: `node prototype/speaker-framing-fix-routing.test.js`

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, "speaker-framing-safety.html"), "utf8");

assert.ok(html.includes('openLink = document.createElement("a")'), "framing issues render an open-fix-screen link");
assert.ok(html.includes("openLink.href = issue.fixScreen"), "open link routes to the owning fix screen");

const fixScreens = [...html.matchAll(/fixScreen:\s*"([a-z0-9-]+\.html)"/g)].map((m) => m[1]);
assert.ok(fixScreens.length >= 2, "framing coverage issues declare fix screens");
for (const file of fixScreens) {
  assert.ok(fs.existsSync(path.join(dir, file)), `fix screen exists: ${file}`);
}

assert.ok(
  fixScreens.includes("layout-safe-areas.html"),
  "caption / lower-third coverage routes to layout safe areas",
);
assert.ok(
  fixScreens.includes("contextual-broll-moments.html"),
  "b-roll coverage routes to the contextual b-roll screen",
);

console.log(`speaker framing safety: ${fixScreens.length} coverage issues open their owning fix screen`);
