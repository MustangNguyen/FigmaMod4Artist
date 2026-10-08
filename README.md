# FigmaMod4Artist

Tools that make exported textures have a width and height divisible by 4 (needed for GPU
block compression such as BC/DXT, ETC2 and ASTC 4×4). Both add transparent padding on the
right and bottom only; artwork is never scaled or moved.

- [`figma-plugin/`](figma-plugin/): Figma plugin that pads every bitmap layer on the current
  page (or only the selection). See its README for build and publish steps.
- [`web-tool/`](web-tool/): single-page browser tool. Drop PNG/JPG/WebP files in, download
  padded PNGs or a zip. PNG pixels are copied exactly.

  The page is written for the claude.ai artifact viewer, which provides the download
  capability. Opened as a plain local file, it shows the previews but cannot save files.
