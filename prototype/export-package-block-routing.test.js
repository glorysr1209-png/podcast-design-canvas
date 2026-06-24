"use strict";

// Guards the export package handoff blocking-warning route (#583): a required-item
// block points back to the screen that owns the fix, as a real link.
// Run with: `node prototype/export-package-block-routing.test.js`

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, "export-package-handoff.html"), "utf8");

// The warnings render path appends an open-fix link when a warning declares one.
assert.ok(
  html.includes("[tone, title, detail, fixScreen, fixLabel]"),
  "warnings render path reads an optional fix screen + label",
);
assert.ok(html.includes("openLink.href = fixScreen"), "blocking warning renders a link to the owning screen");

// Load the exported data model (Node-built-ins only) to assert the blocked caption
// warning carries speaker-attribution-review as its owner, and that the target exists.
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
function makeNode() {
  const node = {
    style: {}, dataset: {}, textContent: "", className: "",
    setAttribute() {}, removeAttribute() {}, getAttribute() { return null; },
    addEventListener() {}, appendChild() {}, append() {}, replaceChildren() {},
    querySelector() { return makeNode(); },
  };
  return node;
}
const document = { querySelector: () => makeNode(), createElement: () => makeNode() };
const sandbox = { document, module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const M = sandbox.module.exports;

const blocked = M.destinations.review.warnings.find((w) => w[0] === "blocked");
assert.ok(blocked, "the client review copy has a blocked warning");
assert.strictEqual(blocked[3], "speaker-attribution-review.html", "blocked caption routes to speaker attribution review");
assert.ok(typeof blocked[4] === "string" && blocked[4].length, "the route carries a creator-facing label");
assert.ok(
  fs.existsSync(path.join(dir, "speaker-attribution-review.html")),
  "the speaker attribution review target exists",
);

// A non-blocking warning carries no route (no false links).
const review = M.destinations.youtube.warnings.find((w) => w[0] === "review");
assert.ok(review && review[3] === undefined, "non-blocking warnings do not declare a fix screen");

console.log("export package handoff: blocked required item routes to its owning review screen");
