# Client v1

Uses the pinned tldraw 5.5.2 public APIs; built-in UI stays hidden and the license/watermark is unchanged. Geometry lives in `src/shared/geometry.ts`.

## Delivered
- Page-space sheets, templates from `page.meta.template`, grey gaps, automatic sheet growth, constrained fit-width camera and native pinch.
- Responsive 44px-target toolbar, three pressure-sensitive pen presets, six colours/three widths, highlighter palette and snap, eraser ring/toggles, enclosure lasso, undo/redo, fit, section thumbnails/rename/create, local-date dated pages, paper picker, images through the existing asset store, sans medium text.
- Finger pan/erase, two/three-finger tap undo/redo, 400ms hold-to-line and opt-in scribble erase. See INTERACTION-NOTES.md for precise recognition thresholds and interaction caveats.
- Index notebook links and today's-page links; activity appears inside the notebook. Bot-read presence expires after 60 seconds; remote bot shapes fade in.
- Standalone PWA manifest, generated icons, Apple metadata and app-shell-only service worker. No notebook data is cached. Offline room navigation is intentionally unavailable.

## Explicit limitations / acceptance work
- The grey pen preset uses the same pressure-sensitive draw engine. tldraw 5.5.2 has no separate native graphite texture preset.
- Lasso is custom polygon enclosure because 5.5.2's select tool offers rectangular brushing / intersection scribble, not enclosure lasso. Native select handles resize and move afterward; only colour is added to the custom selection UI.
- Pencil double-tap/squeeze and native pencil settings are not exposed to the browser. Palm/hover behavior remains the SDK/browser responsibility. Safari gesture ordering and actual latency need iPad acceptance testing; no browser is installed on the build host.
- Highlighters send behind sibling ink; cross-parent stacking cannot be reordered without reparenting. Hold-to-line loses pressure variation, as a tldraw line has uniform width.
- Sheet count is derived from geometry, not a persistent shape. Erasing bottom content can shrink the sheet count.
- Activity reads shape `meta.updatedAt` (epoch ms or ISO). Local user creation/changes stamp epoch ms, without `meta.author`; a server receipt timestamp should remain authoritative for evidence. Imported local shapes have any author stripped on creation. Existing bot shapes retain attribution when edited.
- Presence reads document `meta.lastBotRead` (epoch ms or ISO); dated pages write `{kind:'dated',date:'YYYY-MM-DD',template:'ruled',createdBy:'user'}`. Templates are ruled/grid/dot/blank. Today's link chooses the dated with newest date, otherwise last section.
- Pure logic is covered by Vitest; HTTP/build checks do not prove browser rendering, license validity on a production origin, Pencil quality, or collaboration gesture/history behavior.
