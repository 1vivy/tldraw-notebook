# tldraw-notebook

A notebook-style layout for tldraw: fixed page width, vertical scrolling, page patterns,
a pen-first toolbar, self-hosted sync, and a local bot API. External programs can
read strokes and write onto pages. SQLite provides persistence.

- Pen, highlighter, stroke eraser, lasso, undo and redo.
- Page patterns: ruled, grid, dot and blank, with additional sheets as content grows.
  The ruled pattern includes a margin line.
- Named notebooks, notes pages and dated pages.
- Image uploads, text boxes and a local bot API for reading and placing content.
- A standalone web-app shell for supported browsers.

## Quick start

Use Node.js 24 and npm. From the repository root:

```sh
npm ci
```

Create a local `.env` file (do not commit it):

```dotenv
TLDRAW_LICENSE_KEY=your-valid-license-key
NOTEBOOK_ROOMS=notebook,scratch
```

Then build and start:

```sh
npm run build
npm start
```

Open `http://127.0.0.1:5858`. The server binds to loopback; use an access-controlled
reverse proxy with WebSocket support for access from other devices. The app has
no built-in login or per-notebook authorization. Keep `/bot/*` private.

### Configuration

- `TLDRAW_LICENSE_KEY`: supplied to the client at build time. Rebuild after changing it.
- `NOTEBOOK_ROOMS`: notebook list, copied to build-time `VITE_NOTEBOOK_ROOMS`.
  Accepts comma-separated IDs or a JSON array of `{id,label,detail?,color?}`.
  The default rooms are `notebook` and `scratch`. IDs use letters, digits,
  underscores or hyphens, up to 80 characters.

  ```dotenv
  NOTEBOOK_ROOMS='[{"id":"notebook","label":"Notebook","detail":"Everyday notes","color":"#476b84"},{"id":"scratch","label":"Scratch"}]'
  ```

  Rebuild after changing the list. This configures the client index, not an
  authorization allowlist.
- `NOTEBOOK_PYTHON`: runtime path to a Python executable with Pillow installed.
- `NOTEBOOK_CLI`: runtime path to an external compatible `notebook_bot.py` renderer.
  Export invokes it as `render-data`, passing JSON on stdin and expecting JSON
  containing a base64 `png` on stdout. This renderer is an external dependency,
  not bundled by npm; configure both paths explicitly for a standalone deployment.
  Image placement also needs the Python/Pillow dependency.

Notebook databases and uploaded assets are stored under `data/`; preserve that
directory across restarts and exclude it from version control. The production
client is built into `dist/client`.

## Local API and design

See [DESIGN.md §5](DESIGN.md#5-server--bot-api) for route tables, payloads,
rendering dependencies and access restrictions. For example:

```sh
curl http://127.0.0.1:5858/bot/notebook/pages
curl -X POST http://127.0.0.1:5858/bot/notebook/pages \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ideas","meta":{"kind":"notes","template":"ruled"}}'
```

Bots decide how to compose a page and submit content through the `place` route;
the service does not impose a content workflow or run an autonomous bot.

## Development

```sh
npm run typecheck
npm run test:client
npm run build
```

## Licensing and affiliation

The tldraw SDK is subject to the [tldraw license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md),
not an unrestricted open-source license. A valid tldraw license key is required
for non-localhost use, including private network deployments. Obtain a key
appropriate to your use, observe its terms and expiry, and retain required
branding. Do not commit keys or notebook content.

This is an independent project, not affiliated with or endorsed by tldraw.
