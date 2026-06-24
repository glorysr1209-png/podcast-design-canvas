"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const html = fs.readFileSync(path.join(__dirname, "episode-asset-library.html"), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

// Minimal DOM stub: render() runs at load, so every node must absorb the
// createElement / append / setAttribute / addEventListener calls without effect.
function makeNode() {
  return {
    className: "",
    textContent: "",
    type: "",
    value: "",
    selected: false,
    href: "",
    replaceChildren() {},
    append() {},
    appendChild() {},
    addEventListener() {},
    setAttribute() {},
    querySelector() {
      return makeNode();
    },
  };
}

const nodes = {
  "#filters": makeNode(),
  "#assets": makeNode(),
  "#issues": makeNode(),
};

const sandbox = {
  document: {
    querySelector(selector) {
      return nodes[selector] || makeNode();
    },
    createElement() {
      return makeNode();
    },
  },
  structuredClone,
  module: { exports: {} },
};

vm.runInNewContext(script, sandbox);

const { sampleAssets, availabilityFor, isOfferedForNewUse, matchesFilter, assetIssues, ROLE_OWNERS } =
  sandbox.module.exports;

// Availability: archiving and unresolved approval concerns override status.
assert.strictEqual(availabilityFor({ status: "archived", approval: "approved" }), "retired");
assert.strictEqual(availabilityFor({ status: "suggested", approval: "rejected" }), "blocked");
assert.strictEqual(availabilityFor({ status: "in-use", approval: "review" }), "needs-review");
assert.strictEqual(availabilityFor({ status: "suggested", approval: "approved" }), "available");
assert.strictEqual(availabilityFor({ status: "in-use", approval: "approved" }), "in-use");

// An unresolved concern holds an in-use asset back from NEW placements without archiving it.
assert.strictEqual(isOfferedForNewUse({ status: "in-use", approval: "review" }), false);
assert.strictEqual(isOfferedForNewUse({ status: "in-use", approval: "approved" }), true);
assert.strictEqual(isOfferedForNewUse({ status: "archived", approval: "approved" }), false);
assert.strictEqual(isOfferedForNewUse({ status: "suggested", approval: "approved" }), true);

// Filters: "flagged" surfaces review/rejected; "archived" is status-based.
assert.ok(matchesFilter({ status: "in-use", approval: "review" }, "flagged"));
assert.ok(matchesFilter({ status: "suggested", approval: "rejected" }, "flagged"));
assert.ok(!matchesFilter({ status: "suggested", approval: "approved" }, "flagged"));
assert.ok(matchesFilter({ status: "archived", approval: "approved" }, "archived"));
assert.ok(matchesFilter({ status: "suggested", approval: "approved" }, "all"));

// Reuse-safety issues: only non-archived flagged assets, routed to the owning workflow.
const issues = assetIssues(sampleAssets);
const guestIssue = issues.find((issue) => issue.title.includes("Priya"));
assert.ok(guestIssue, "an in-use guest headshot under review surfaces an issue");
assert.equal(guestIssue.fixScreen, "guest-profile-reuse.html");
assert.match(guestIssue.detail, /held back from new placements/i);

const sponsorIssue = issues.find((issue) => issue.title.includes("Northwind"));
assert.ok(sponsorIssue, "a rejected sponsor mark surfaces an issue");
assert.equal(sponsorIssue.tone, "block");
assert.ok(!sponsorIssue.fixScreen, "no dead fix link when the owning screen does not exist yet");

// Archived assets never appear as a reuse-safety concern.
assert.ok(!issues.some((issue) => issue.title.includes("season 4")), "archived assets are not flagged");

// All-clear: every active asset approved -> a single informational note.
const clear = assetIssues(sampleAssets.map((a) => ({ ...a, approval: "approved" })));
assert.equal(clear.length, 1);
assert.match(clear[0].title, /cleared for reuse/i);

// Only routes to screens that exist (no dead fix links).
for (const owner of Object.values(ROLE_OWNERS)) {
  assert.ok(
    fs.existsSync(path.join(__dirname, owner.screen)),
    `role owner screen exists: ${owner.screen}`,
  );
}

assert.ok(html.includes('link.className = "fix-link"'), "asset-library fix links are class-tagged");

console.log("episode-asset-library: availability, reuse-safety routing, and filters evaluate cleanly");
