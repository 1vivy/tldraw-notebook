# Notebook — design

A self-hosted, pen-first notebook with live synchronization and a local bot API.
The client provides paper and tools; bots can read strokes and place content.
Page composition and content policy belong to the bot, not the notebook service.

## 1. Principles

1. **Page, not unbounded canvas.** Fixed width, vertical scrolling and visible
   paper guides keep handwriting aligned.
2. **Pen first.** Writing is the default; touch navigation and a compact toolbar
   stay out of the way.
3. **A second pen.** Bot content shares page coordinates with handwriting and
   carries explicit authorship and placement identifiers.
4. **Honest activity.** Use stored timestamps, not assumptions about when old
   ink was written. Missing timestamps remain unknown.
5. **Neutral composition.** The service supplies primitives, not prescribed
   page contents, schedules or decision-making logic.

## 2. Page geometry (shared contract)

| Constant | Value |
|---|---|
| `PAGE_W` | 820 page units |
| `RULE` | 32 |
| `MARGIN_X` | 72; vertical margin on ruled paper |
| `TEXT_X` | 88; first text column |
| `TEXT_W` | 672; right edge at 760 when starting at `TEXT_X` |
| `PAGE_H` | 1088; 34 rules |
| `PAGE_GAP` | 48; grey band between sheets |
| Sheet n top | `y = n * (PAGE_H + PAGE_GAP)`, n ≥ 0 |

The camera fits page width with 8 px gutters, locks horizontal panning and
contains vertical movement to the current sheets. Zoom spans 0.75–3 relative
to the base fit-width zoom. Pinch zoom is available. Content reaching the last
sheet's bottom third extends the paper. Sheet bands are visual, not separate
drawing surfaces.

Templates live in `page.meta.template`: `ruled` (default), `grid` (`RULE/2`
squares), `dot`, `blank`. Only ruled paper has a margin line. Paper is light.

Draw/highlight paths decode from tldraw's encoded segments. Absolute points
apply `scaleX`/`scaleY`, rotation and ancestor translations/rotations;
`props.scale` changes stroke width, not coordinate geometry. Decoded points
include `z` and `pressure`, defaulting to 0.5 when absent. Other shape types
retain their native tldraw representation.

## 3. Structure

- **Room = notebook.** Configure `NOTEBOOK_ROOMS`, exposed to the client as
  build-time `VITE_NOTEBOOK_ROOMS`. Accept either a JSON array of
  `{id,label,detail?,color?}` or comma-separated IDs. Defaults: `notebook`,
  `scratch`. Rebuild to change the index. IDs match `[a-zA-Z0-9_-]{1,80}`.
  The displayed list is not an authorization boundary.
- **tldraw page = notebook section.** Page metadata is
  `{kind:'dated'|'notes'|'scratch', date?:'YYYY-MM-DD',
  template:'ruled'|'grid'|'dot'|'blank', createdBy:'bot'|'user', sheets:number}`.
  API-created pages use `createdBy:'bot'`; client-created pages use
  `createdBy:'user'`. A newly initialized room starts with a `Notebook` page;
  older pages may lack metadata.
- **Authorship.** API-created shapes use `meta.author='bot'`,
  `meta.placement=<placementId>` and `meta.updatedAt`. User shapes have no
  `meta.author`. API deletion is restricted to bot-authored shapes; it is not
  a general-purpose user-content deletion API.
- **Navigation.** `/` lists notebooks; `/r/:room` opens a notebook.
  `?page=today` selects the newest dated page, falling back to the last page.
- **Persistence.** Each room has a SQLite database under `data/`; images live
  under `data/assets/`. Live updates use `TLSocketRoom` and SQLite-backed
  storage, with WAL and full synchronous writes.

## 4. Client

A compact toolbar uses 44 px targets, positioned along the bottom in portrait
and as a rail in landscape.

- **Pen:** three favorites, six colors, three widths and pressure-sensitive
  ink; pen mode enables palm rejection. Hold-to-straighten provides lines.
- **Highlighter:** yellow, green or pink; near-horizontal line snapping.
- **Eraser:** whole-stroke erasing, optional scribble-to-erase and finger erase.
- **Lasso:** enclosure selection, move/resize and color changes.
- **Undo / redo**, **fit width**, and a **page strip** with thumbnails, add and rename.
- **Paper:** ruled, grid, dot or blank.
- **Images:** upload or paste; assets are served from `/uploads`.
- **Text:** plain text boxes, using sans text by default.

Finger input pans unless finger erase is enabled. Two-finger tap undoes,
three-finger tap redoes, and pinch zooms. Device/browser support governs hover.

The web-app manifest and icons support installation on compatible devices.
The service worker caches the shell, not notebook data; this is not an offline
synchronization guarantee. A bot-reading indicator is shown for 60 seconds
after `lastBotRead`; callers explicitly refresh it with `mark-read`. Remote
bot content fades in as it syncs. The indicator does not prove continuous reading.

## 5. Server + bot API

The server binds to `127.0.0.1:5858`. `/bot/*` requires the exact Host header
`127.0.0.1:5858` and rejects `forwarded`, `x-forwarded-*` and `tailscale-*`
headers. A rejection returns HTTP 403 with `{error:'Bot API is local-only'}`.
Use a direct loopback connection, not a proxy. JSON is used except where noted.
The global request-body limit is 20 MiB.

### Bot routes

`page` selectors accept a page ID or exact name. Where a single page is chosen
and no selector is supplied, the first page in index order is used.

| Method and route | Request | Success response |
|---|---|---|
| `GET /bot/:room/pages` | None | `{pages:[<page record with shapeCount,lastUserStroke,lastBotWrite>]}` |
| `POST /bot/:room/pages` | `{name,meta?:{kind?,date?,template?}}` | `{page:<created page record>}` |
| `GET /bot/:room/shapes` | Query `page?`, `since?` | `{room,page,shapes:[<decoded shape>],assets:[<asset>]}` |
| `GET /bot/:room/activity` | None | `{timestampSource:'shape.meta.updatedAt',lastBotRead,pages:[{id,name,lastUserStroke,strokes:{'5':number,'15':number,'60':number},openPlacements:[string]}]}` |
| `POST /bot/:room/place` | `{placement?:string,shapes:[<item>]}` or an item array | `{placement,ids:[<shape ID>]}` |
| `DELETE /bot/:room/placement/:id` | None | `{placement:<requested ID>,deleted:[<shape ID>]}` |
| `GET /bot/:room/export` | Query `page?` | `{tldr:{records:[...],schema:<serialized schema>},png:<base64 string>}` |
| `POST /bot/:room/mark-read` | No body required | `{lastBotRead:<epoch milliseconds>}` |
| `POST /bot/:room/feedback` | `{text,x,y,kind?:'text'|'note',page?}` | `{id,shape:<stored shape record>}` |
| `DELETE /bot/:room/feedback/:id` | None | `{deleted:<shape ID>}` |

Page creation requires a nonblank name of at most 200 characters. Defaults are
`kind:'notes'`, `template:'ruled'`, `createdBy:'bot'`, `sheets:1`. Optional dates
must match `YYYY-MM-DD`; this is format checking, not calendar validation.

`lastUserStroke` is the latest timestamp among unauthored `draw`, `highlight`
and `line` shapes; `lastBotWrite` is the latest bot-authored shape timestamp.
Values are epoch milliseconds or null. Activity counts timestamped user strokes
in trailing 5/15/60-minute windows and lists distinct current bot placement IDs.
These are counts of stored shapes, not a history of editing operations.

`since` accepts digit-only epoch milliseconds or a parseable date string.
Unknown shape timestamps remain included. Without `page`, `shapes` returns
shapes across the room even though its `page` field identifies the default
page. Draw/highlight shapes include decoded absolute points; image assets
whose source is a local `/uploads/` path include base64 bytes.

### Placement items

Every item requires finite `x`, `y`, a supported `type` and optionally `page`.
Coordinates are in page units. A batch contains 1–500 items. A supplied placement
label matches `[\w .:-]{1,200}`; otherwise a UUID is generated. A batch can span
pages and returns shape IDs, not asset IDs. Placement extends sheet metadata as
needed. The bot is responsible for layout, spacing and avoiding existing ink;
there is no server-side page-composition protocol.

| Type | Fields and behavior |
|---|---|
| `text` | `text` (≤100,000 characters) or `richText`; optional `w`, `size`, `font`, `color`, `autoSize`. Width defaults to 672; auto-size defaults to true only when `w` is omitted. |
| `mark` | `glyph` or `text`: `✓`, `✗`, `?`; uses large red text. Supports the text sizing/layout fields. |
| `box` | Positive `w`/`width` and `h`/`height`; dashed red rectangle with no fill. |
| `line` | Optional `x2`,`y2`, or `w`/`width` and `h`; defaults to a horizontal 100-unit line. Optional `color`,`size`,`dash`. |
| `highlight` | Positive `w`/`width`; positive `h`/`height` defaults to 24. Optional `color` defaults to yellow. |
| `image` | Server-local `path` or `base64` (data-URL prefix accepted); positive `w`/`width` defaults to 672. Height preserves image aspect ratio. Optional `altText`. |

Text and lines default to red; the optional `role:'problem'` switches that
default to black. Images must decode with Pillow and be 1 byte–16 MiB; assets
are copied into local storage. Local paths are read by the server, which is
another reason to keep the API private. tldraw schema validation applies to
constructed shapes. Invalid requests generally return HTTP 400; renderer or
filesystem failures can return server errors. Do not assume one uniform error
body across all handlers.

Placement deletion removes matching bot-authored shapes, not uploaded asset
files. The feedback route creates a single red text box or light-red note and
requires finite coordinates and text ≤20,000 characters; `kind` defaults to
`text`. It targets the selected page or the first stored page. Feedback deletion
returns 404 for a missing shape and 403 for a shape not authored by a bot.

### Other routes

| Method and route | Request / response |
|---|---|
| WebSocket `/connect/:roomId` | tldraw synchronization protocol; the SDK supplies the required connection identifier. Invalid connections close with code 1008. |
| `PUT /uploads/:id` | Raw bytes → `{ok:true}`. ID matches `[\w. -]{1,250}`. |
| `GET /uploads/:id` | Raw bytes as `application/octet-stream`, with restrictive CSP and `nosniff`; 404 if absent. |
| `GET /` | Built client index. |
| `GET /r/:room` | Built client shell. |

Static client assets are also served from `dist/client`. Upload routes are not
protected by the bot guard. Deploy authentication/access restrictions in front
of browser, upload and WebSocket routes together.

### Rendering dependency

Export invokes an **external** compatible Python renderer. Set `NOTEBOOK_PYTHON`
to a Python executable with Pillow and `NOTEBOOK_CLI` to the renderer script;
do not rely on deployment-relative fallback paths. The script must accept
`render-data`, read `{shapes,assets,page}` JSON from stdin, and emit JSON with
`png` containing base64 image bytes. This script is not supplied by npm.
Image placement also uses `NOTEBOOK_PYTHON` and Pillow to validate dimensions.

The process timeout is 60 seconds and stdout is capped at approximately 80 MiB.
Export includes the document record, selected page, its shapes and referenced
assets, plus the serialized schema. Locally stored image bytes are embedded;
arbitrary remote URLs are not fetched by the asset-embedding step. Rendering
quality depends on the external script and available fonts: exported PNGs are
approximations, not browser screenshots. The browser remains the visual reference.

## 6. Known limits and deployment

- Ink quality and input latency depend on tldraw, browser and hardware. Native
  pen double-tap/squeeze controls are not available through this web UI.
- No audio, handwriting search, native PDF-to-page import or dark paper.
  Images can be placed instead; no autonomous bot/model loop is built in.
- No built-in login or per-room access control. Use a trusted, access-controlled
  deployment; the client room list does not restrict server room creation.
- Shell caching is not an offline editing or backup system. Back up SQLite
  databases and assets consistently; deletion does not garbage-collect assets.
- A valid tldraw license key is required for non-localhost use, including private
  networks. `TLDRAW_LICENSE_KEY` is mapped to build-time
  `VITE_TLDRAW_LICENSE_KEY`; rebuild after changing it. Respect license terms,
  expiry and required branding rather than bypassing checks.

This independent project is not affiliated with or endorsed by tldraw. See the
[tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md).
