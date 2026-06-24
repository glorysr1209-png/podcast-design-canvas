"use strict";

// Dependency-free verification for the intro & outro builder prototype.
// Run with: `node prototype/intro-outro-builder.test.js` (Node built-ins only).
//
// The page script is browser-only and calls render() on load, so the test supplies a
// tiny DOM stub that lets it run to its `module.exports` block, then checks the pure
// review-state logic: draft/adapted/needs-review/approved/skipped and the warnings that
// route owned decisions to the screens that own them.

const fs = require("fs");
const vm = require("vm");
const path = require("path");
const assert = require("assert");

function makeNode(tag) {
  return {
    tagName: tag, id: "", _children: [], dataset: {}, style: {},
    textContent: "", value: "", checked: false, disabled: false, type: "", href: "", target: "", className: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute() {}, getAttribute() { return null; }, addEventListener() {},
    appendChild(c) { this._children.push(c); return c; },
    append(...cs) { this._children.push(...cs); },
    replaceChildren(...cs) { this._children = cs; },
    get children() { return this._children; },
  };
}

function load() {
  const html = fs.readFileSync(path.join(__dirname, "intro-outro-builder.html"), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const document = {
    createElement: (t) => makeNode(t),
    createTextNode: (t) => ({ textContent: t }),
    querySelector: () => makeNode(),
  };
  const sandbox = { document, module: { exports: {} } };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox); // runs render() for the sample — must not throw
  return sandbox.module.exports;
}

const M = load();
assert.ok(typeof M.evaluateSequence === "function", "prototype exports evaluateSequence()");

// The spec's intro and outro element sets are present.
const introIds = M.introElements.map((e) => e.id);
const outroIds = M.outroElements.map((e) => e.id);
for (const id of ["show-title", "episode-title", "speaker-names", "music-cue", "first-speaker-frame", "sponsor-disclosure"]) {
  assert.ok(introIds.includes(id), `intro element present: ${id}`);
}
for (const id of ["closing-title", "guest-links", "sponsor-ack", "next-episode-teaser", "credits", "export-destination-note"]) {
  assert.ok(outroIds.includes(id), `outro element present: ${id}`);
}

const fresh = () => ({
  adapted: false, skipped: false, removed: [],
  namesConfirmed: false, sponsorConfirmed: false, musicReviewed: false, approved: false,
});

// A brand-new sequence is a draft and is NOT counted as complete.
assert.equal(M.evaluateSequence("intro", fresh()).state, "draft", "fresh intro is a draft");
assert.equal(M.evaluateSequence("intro", fresh()).warnings.length, 0, "draft has no blocking warnings");

// Skipping a sequence yields the skipped state with no warnings for THIS sequence.
const skipped = M.evaluateSequence("intro", { ...fresh(), skipped: true });
assert.equal(skipped.state, "skipped", "skipped intro reports skipped");
assert.equal(skipped.warnings.length, 0, "a skipped sequence has no warnings of its own");

// Adapting surfaces the real review work: names, sponsor, and music are unresolved.
const adaptedRaw = M.evaluateSequence("intro", { ...fresh(), adapted: true });
assert.equal(adaptedRaw.state, "needs-review", "adapted-but-unresolved intro needs review");
const warnIds = adaptedRaw.warnings.map((w) => w.id);
assert.ok(warnIds.includes("names"), "unconfirmed names is flagged");
assert.ok(warnIds.includes("sponsor"), "unconfirmed sponsor disclosure is flagged");
assert.ok(warnIds.includes("music"), "unreviewed intro music cue is flagged");

// Owned decisions route to the screens that own them, and those screens exist.
const nameWarn = adaptedRaw.warnings.find((w) => w.id === "names");
assert.equal(nameWarn.route, "social-context-intake.html", "names route to social context intake");
const sponsorWarn = adaptedRaw.warnings.find((w) => w.id === "sponsor");
assert.equal(sponsorWarn.route, "export-readiness-review.html", "sponsor routes to export readiness");
for (const w of adaptedRaw.warnings) {
  assert.ok(
    fs.existsSync(path.join(__dirname, w.route)),
    `warning routes to a real screen: ${w.route}`,
  );
}

// Resolving every concern clears review; the sequence is adapted and approvable.
const resolved = M.evaluateSequence("intro", {
  ...fresh(), adapted: true, namesConfirmed: true, sponsorConfirmed: true, musicReviewed: true,
});
assert.equal(resolved.state, "adapted", "resolved intro is adapted for episode");
assert.equal(resolved.warnings.length, 0, "resolved intro has no blocking warnings");

// Approving a clean sequence reports approved-for-export.
const approved = M.evaluateSequence("intro", {
  ...fresh(), adapted: true, namesConfirmed: true, sponsorConfirmed: true, musicReviewed: true, approved: true,
});
assert.equal(approved.state, "approved", "clean + approved intro is approved for export");

// Removing the required sponsor disclosure is an honest, export-affecting warning.
const sponsorRemoved = M.evaluateSequence("intro", {
  ...fresh(), adapted: true, namesConfirmed: true, musicReviewed: true, removed: ["sponsor-disclosure"],
});
assert.equal(sponsorRemoved.state, "needs-review", "removing required sponsor disclosure needs review");
assert.ok(
  sponsorRemoved.warnings.some((w) => w.id === "sponsor-missing" && w.route === "export-readiness-review.html"),
  "removed sponsor disclosure routes to export readiness",
);

// Outro guest links carry the same naming-confirmation guard.
const outroAdapted = M.evaluateSequence("outro", { ...fresh(), adapted: true, sponsorConfirmed: true });
assert.ok(
  outroAdapted.warnings.some((w) => w.id === "names" && w.route === "social-context-intake.html"),
  "outro guest links route to social context intake until confirmed",
);

console.log("intro & outro builder: review states and owned-decision routing verified");
