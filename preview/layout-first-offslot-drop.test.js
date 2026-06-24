"use strict";

// Behavior test for the off-slot drop guard on the layout-first canvas (#1131 / #1026).
// A video released just outside a slot must NOT navigate the browser away (which would
// destroy every placement); when the miss lands on the canvas with an open slot, the
// videos are routed into it. Drops that land inside a slot are left to the slot's own
// handler (no double placement). Standalone DOM stub so it does not touch the shared
// layout-first.test.js. Run: `node preview/layout-first-offslot-drop.test.js`

const assert = require("assert");
const { createLayoutFirstController } = require("./layout-first.js");

class ClassList {
  constructor(initial = "") {
    this.classes = new Set(initial.split(/\s+/).filter(Boolean));
  }
  add(name) { this.classes.add(name); }
  remove(name) { this.classes.delete(name); }
  contains(name) { return this.classes.has(name); }
  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.classes.has(name) : Boolean(force);
    if (shouldAdd) this.classes.add(name);
    else this.classes.delete(name);
    return shouldAdd;
  }
}

class Element {
  constructor(tagName, options = {}) {
    this.tagName = tagName;
    this.id = options.id || "";
    this.dataset = options.dataset || {};
    this.className = options.className || "";
    this.classList = new ClassList(options.className || "");
    this.children = [];
    this.firstChild = null;
    this.parentNode = null;
    this.textContent = options.textContent || "";
    this.hidden = Boolean(options.hidden);
    this.attributes = {};
    this.listeners = {};
    this.files = null;
    this.value = "";
  }
  focus() {}
  setAttribute(name, value) { this.attributes[name] = value; }
  getAttribute(name) { return this.attributes[name]; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
  appendChild(child) {
    this.children.push(child);
    this.firstChild = this.children[0] || null;
    child.parentNode = this;
    return child;
  }
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    if (index === -1) this.children.unshift(child);
    else this.children.splice(index, 0, child);
    this.firstChild = this.children[0] || null;
    child.parentNode = this;
    return child;
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter((c) => c !== this);
    this.parentNode.firstChild = this.parentNode.children[0] || null;
  }
  querySelector(selector) { return findAll(this, selector)[0] || null; }
}

function findAll(rootNode, selector) {
  const nodes = [];
  (function visit(node) {
    if (matches(node, selector)) nodes.push(node);
    node.children.forEach(visit);
  })(rootNode);
  return nodes;
}

function matches(node, selector) {
  if (selector === ".drop-zone[data-slot]") {
    return node.classList.contains("drop-zone") && Boolean(node.dataset.slot);
  }
  if (selector === "[data-layout]") return Boolean(node.dataset.layout);
  if (selector === "[data-layout-label]") return Object.prototype.hasOwnProperty.call(node.dataset, "layoutLabel");
  if (selector === "[data-file-input]") return Boolean(node.dataset.fileInput);
  if (selector === ".placed-video") return node.className === "placed-video";
  return false;
}

function makeLayoutButton(layout, label) {
  const button = new Element("button", { dataset: { layout } });
  button.appendChild(new Element("strong", { dataset: { layoutLabel: "" }, textContent: label }));
  return button;
}

function makeZone(slot, className = "drop-zone") {
  const zone = new Element("div", { className, dataset: { slot } });
  zone.appendChild(new Element("input", { dataset: { fileInput: slot } }));
  return zone;
}

function build() {
  const zones = [
    makeZone("host"),
    makeZone("guest"),
    makeZone("guest-b", "drop-zone is-hidden"),
    makeZone("broll"),
  ];
  const canvas = new Element("div", { className: "canvas-frame", id: "layout-canvas" });
  const speakerRow = new Element("div", { className: "speaker-row", id: "speaker-row" });
  zones.forEach((z) => speakerRow.appendChild(z));
  canvas.appendChild(speakerRow);
  const layoutButtons = [
    makeLayoutButton("interview", "Using interview"),
    makeLayoutButton("solo", "Use solo"),
    makeLayoutButton("panel", "Use panel"),
  ];
  const elementsById = {
    "layout-scene-label": new Element("span"),
    "layout-runtime-label": new Element("span"),
    "speaker-row": speakerRow,
    "layout-slot-status": new Element("p"),
    "layout-reset": new Element("button"),
    "layout-continue": new Element("a", { className: "continue-btn is-disabled" }),
    "layout-error-card": new Element("div", { hidden: true }),
    "layout-error": new Element("p"),
  };
  const docListeners = {};
  const documentStub = {
    createElement(tagName) { return new Element(tagName); },
    getElementById(id) { return elementsById[id] || null; },
    querySelectorAll(selector) {
      if (selector === "[data-layout]") return layoutButtons;
      if (selector === ".drop-zone[data-slot]") return zones;
      return [];
    },
    addEventListener(type, handler) { docListeners[type] = handler; },
  };
  const urlApi = {
    createObjectURL(file) { return `blob:${file.name}`; },
    revokeObjectURL() {},
  };
  const ctl = createLayoutFirstController(documentStub, { URL: urlApi });
  return { ctl, docListeners, canvas, speakerRow };
}

function video(name) { return { name, type: "video/mp4", size: 2048 }; }
function dropEvent(target, files) {
  let prevented = false;
  return {
    target,
    dataTransfer: { files },
    preventDefault() { prevented = true; },
    get defaultPrevented() { return prevented; },
  };
}

// The controller registers document-level dragover and drop handlers.
let { ctl, docListeners, canvas, speakerRow } = build();
assert.equal(typeof docListeners.dragover, "function", "a document dragover handler is registered");
assert.equal(typeof docListeners.drop, "function", "a document drop handler is registered");

// dragover anywhere is prevented so the drop event can fire (and not be a browser file-open).
const over = dropEvent(speakerRow, []);
docListeners.dragover(over);
assert.ok(over.defaultPrevented, "document dragover is prevented so drops are catchable");

// A video dropped on the canvas frame (a miss between slots) is swallowed AND routed to the
// first open slot — it must not navigate the browser away.
const missEvent = dropEvent(speakerRow, [video("host-cam.mp4")]);
docListeners.drop(missEvent);
assert.ok(missEvent.defaultPrevented, "an off-slot drop is prevented (no navigate-away)");
assert.ok(ctl.zonesBySlot.host.classList.contains("filled"), "an off-slot drop routes into the first open slot");

// Multiple videos missing the slots fill the open slots in order.
({ ctl, docListeners, canvas, speakerRow } = build());
const multiMiss = dropEvent(canvas, [video("a.mp4"), video("b.mp4")]);
docListeners.drop(multiMiss);
assert.ok(multiMiss.defaultPrevented, "a multi-file off-slot drop is prevented");
assert.ok(ctl.zonesBySlot.host.classList.contains("filled"), "first off-slot video fills host");
assert.ok(ctl.zonesBySlot.guest.classList.contains("filled"), "second off-slot video spills to guest");

// A drop that lands INSIDE a slot is left to the slot's own handler (no double handling here).
({ ctl, docListeners, speakerRow } = build());
const onSlot = dropEvent(ctl.zonesBySlot.host, [video("host.mp4")]);
docListeners.drop(onSlot);
assert.ok(!onSlot.defaultPrevented, "the document handler ignores drops that landed on a slot");

// An off-slot drop with no files is swallowed (still no navigate-away) and places nothing.
({ ctl, docListeners, speakerRow } = build());
const emptyMiss = dropEvent(speakerRow, []);
docListeners.drop(emptyMiss);
assert.ok(emptyMiss.defaultPrevented, "an off-slot drop with no files is still prevented");
assert.ok(!ctl.zonesBySlot.host.classList.contains("filled"), "an empty off-slot drop places nothing");

console.log("layout-first off-slot drop: never navigates away; routes a missed video into the first open slot");
