// Pads layers with transparent space on the right/bottom so the exported width and
// height are multiples of 4. Artwork is never scaled or moved relative to its top-left corner.
// Default command scans every bitmap (image-fill) layer on the current page; the
// "selection" command pads only what is selected.

const MULTIPLE = 4;
const WRAPPER_KEY = "pad4";

type Outcome =
  | { kind: "padded"; result: SceneNode }
  | { kind: "already" }
  | { kind: "skipped"; reason: string };

// Round to 1/100 px first so float noise like 100.0000001 does not jump to 104.
function roundUp(n: number): number {
  return Math.ceil(Math.round(n * 100) / 100 / MULTIPLE) * MULTIPLE;
}

function isMultiple(n: number): boolean {
  return Math.abs(roundUp(n) - n) < 0.01;
}

function hasVisiblePaint(paints: ReadonlyArray<Paint> | PluginAPI["mixed"]): boolean {
  if (paints === figma.mixed) return true;
  return paints.some((p) => p.visible !== false && (p.opacity ?? 1) > 0);
}

// A frame can simply grow when what it exports is exactly its own box and the new
// area would stay transparent: clipped, no fill, no effects, no stroke outside the box.
function canResizeInPlace(node: SceneNode): node is FrameNode | ComponentNode {
  if (node.type !== "FRAME" && node.type !== "COMPONENT") return false;
  if (node.layoutMode !== "NONE") return false;
  if (!node.clipsContent) return false;
  if (node.rotation !== 0) return false;
  if (hasVisiblePaint(node.fills)) return false;
  if (node.effects.some((e) => e.visible)) return false;
  if (hasVisiblePaint(node.strokes) && node.strokeAlign !== "INSIDE") return false;
  return true;
}

function moveToAbsolute(node: SceneNode, x: number, y: number) {
  const t = node.absoluteTransform;
  node.x += x - t[0][2];
  node.y += y - t[1][2];
}

function resizeInPlace(node: FrameNode | ComponentNode): Outcome {
  if (isMultiple(node.width) && isMultiple(node.height)) return { kind: "already" };
  // resizeWithoutConstraints keeps children where they are; resize() would apply constraints.
  node.resizeWithoutConstraints(roundUp(node.width), roundUp(node.height));
  return { kind: "padded", result: node };
}

// Wrap the node in a transparent, clipping frame sized to its render bounds
// (shadows, outside strokes and rotation included), rounded up to the multiple.
function wrap(node: SceneNode): Outcome {
  const parent = node.parent;
  if (!parent || !("insertChild" in parent)) return { kind: "skipped", reason: "không có parent hợp lệ" };
  if (parent.type === "COMPONENT_SET") return { kind: "skipped", reason: "component trong variant set, không bọc được" };
  if (parent.type === "BOOLEAN_OPERATION") return { kind: "skipped", reason: "nằm trong boolean group" };

  const rb = renderBounds(node);
  if (!rb) return { kind: "skipped", reason: "layer ẩn hoặc rỗng" };
  if (isMultiple(rb.width) && isMultiple(rb.height)) return { kind: "already" };

  const index = parent.children.indexOf(node);
  const wasAbsolute = "layoutPositioning" in node && node.layoutPositioning === "ABSOLUTE";

  const frame = figma.createFrame();
  frame.name = node.name;
  frame.setPluginData(WRAPPER_KEY, "wrapper");
  frame.fills = [];
  frame.clipsContent = true;
  parent.insertChild(index, frame);
  if (wasAbsolute) frame.layoutPositioning = "ABSOLUTE";
  if ("constraints" in node) frame.constraints = node.constraints;
  frame.resizeWithoutConstraints(roundUp(rb.width), roundUp(rb.height));
  moveToAbsolute(frame, rb.x, rb.y);

  // Export presets follow the wrapper, since that is now the thing to export.
  if ("exportSettings" in node && node.exportSettings.length) {
    frame.exportSettings = node.exportSettings;
    node.exportSettings = [];
  }

  frame.appendChild(node);
  // Pin the artwork to the wrapper's top-left so a later manual resize never shifts it.
  if ("constraints" in node) node.constraints = { horizontal: "MIN", vertical: "MIN" };
  // appendChild keeps the relative transform, so re-align the render box to the frame's top-left.
  const after = renderBounds(node);
  if (after) {
    const t = frame.absoluteTransform;
    node.x += t[0][2] - after.x;
    node.y += t[1][2] - after.y;
  }
  return { kind: "padded", result: frame };
}

function renderBounds(node: SceneNode): Rect | null {
  return "absoluteRenderBounds" in node ? node.absoluteRenderBounds : node.absoluteBoundingBox;
}

function refitWrapper(wrapper: FrameNode, node: SceneNode): Outcome {
  const rb = renderBounds(node);
  if (!rb) return { kind: "skipped", reason: "layer ẩn hoặc rỗng" };
  const w = roundUp(rb.width);
  const h = roundUp(rb.height);
  if (wrapper.width === w && wrapper.height === h) return { kind: "already" };
  wrapper.resizeWithoutConstraints(w, h);
  return { kind: "padded", result: wrapper };
}

function padNode(node: SceneNode): Outcome {
  // Layers inside an instance cannot be resized or reparented.
  if (node.id.includes(";")) return { kind: "skipped", reason: "layer bên trong instance" };
  if (node.type === "SLICE") {
    if (isMultiple(node.width) && isMultiple(node.height)) return { kind: "already" };
    node.resize(roundUp(node.width), roundUp(node.height));
    return { kind: "padded", result: node };
  }
  if (node.type === "SECTION") return { kind: "skipped", reason: "section" };
  // Already wrapped by an earlier run: only re-fit the wrapper, never wrap twice.
  const parent = node.parent;
  if (parent && parent.type === "FRAME" && parent.getPluginData(WRAPPER_KEY) === "wrapper") {
    return refitWrapper(parent, node);
  }
  if (node.type === "FRAME" && node.getPluginData(WRAPPER_KEY) === "wrapper" && node.children.length === 1) {
    return refitWrapper(node, node.children[0]);
  }
  if (canResizeInPlace(node)) return resizeInPlace(node);
  return wrap(node);
}

function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node)) return false;
  const fills = node.fills;
  if (fills === figma.mixed) return false;
  return fills.some((p) => p.type === "IMAGE" && p.visible !== false);
}

// Every visible image-fill layer on the page, outermost only: a bitmap nested inside
// another bitmap layer is covered when the outer one is padded.
function findImageLayers(): SceneNode[] {
  const found = figma.currentPage.findAll((n) => n.visible && hasImageFill(n) && !n.id.includes(";"));
  const set = new Set<BaseNode>(found);
  return found.filter((n) => {
    for (let p = n.parent; p && p.type !== "PAGE"; p = p.parent) {
      if (set.has(p)) return false;
      if ("visible" in p && !p.visible) return false;
    }
    return true;
  });
}

function main() {
  const fromSelection = figma.command === "selection";
  const targets = fromSelection ? [...figma.currentPage.selection] : findImageLayers();
  if (!targets.length) {
    figma.closePlugin(fromSelection ? "Chọn ít nhất một layer hoặc frame trước." : "Page này không có layer ảnh nào.");
    return;
  }

  let padded = 0;
  let already = 0;
  const skipped = new Map<string, number>();
  const changed: SceneNode[] = [];

  for (const node of targets) {
    const out = padNode(node);
    if (out.kind === "padded") {
      padded++;
      changed.push(out.result);
    } else if (out.kind === "already") {
      already++;
    } else {
      skipped.set(out.reason, (skipped.get(out.reason) ?? 0) + 1);
    }
  }
  // Select what changed so the artist can review it right away.
  if (changed.length) figma.currentPage.selection = changed;

  const parts = [`Đã pad ${padded}`, `chuẩn sẵn ${already}`];
  for (const [reason, count] of skipped) parts.push(`bỏ qua ${count} (${reason})`);
  figma.closePlugin(parts.join(" · "));
}

main();
