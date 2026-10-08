# Pad Images to ×4 (Figma plugin)

Makes every bitmap layer on the current page export at a width and height divisible by 4,
by adding transparent padding on the right and bottom. Artwork is never scaled or moved.

## Commands

- **Pad all images on this page**: scans every visible layer with an image fill (outermost
  only) and pads it. No selection needed.
- **Pad selection only**: pads only the selected layers or frames.

How a layer is padded:

- A clipped frame with no fill, effects or outside stroke is resized in place
  (`resizeWithoutConstraints`, so children do not move).
- Anything else is wrapped in a new transparent, clipping frame with the same name, sized to
  the layer's render bounds (shadows and outside strokes included) rounded up to 4. Export
  presets move to the wrapper. Running the plugin again re-fits the wrapper instead of
  wrapping twice.
- Layers inside instances, inside boolean groups or in variant sets with fills are skipped,
  and the closing toast reports how many and why.

The whole run is one undo step (Ctrl+Z).

## Develop

Plugin development needs the Figma desktop app (or `figma-linux` on Linux). The web app
cannot import a local manifest.

```bash
npm install
npm run watch
```

In Figma: `Plugins > Development > Import plugin from manifest…` and pick `manifest.json`.

## Publish so coworkers can use it in the browser

1. In the desktop app: `Plugins > Development > Manage plugins in development`, then
   `Publish`. Figma writes the real plugin id into `manifest.json`, replacing
   `REPLACE_WITH_ID_FROM_FIGMA`.
2. Provide an icon (128×128), a cover image (1920×1080), a description and a support contact.
3. Choose who can use it:
   - **Organization / Enterprise plan**: publish privately to the org. No review; coworkers
     find it under the org's plugins right away, in the web app too.
   - **Professional or free plan**: publish to Community. Figma reviews it first (usually
     a few business days), then anyone can run it from the web app.
