# SDK license behavior (verified against v5.5.2)

Source clone HEAD was checked with `git describe --tags --exact-match HEAD`: **v5.5.2**. No enforcement or watermark code is overridden by this client. `hideUi` does not remove the editor's independently mounted watermark.

## With no key

- `http://localhost` and `https://localhost` are development origins, even in a production bundle. IPv4 loopback (`127.0.0.0/8`) and IPv6 `::1` also qualify. License state becomes `unlicensed`; all licensable features, including collaboration, are enabled. The SDK renders its interactive **“Get a license for production”** watermark; it does not blank the editor.
- Non-localhost **HTTP** origins also count as development, even with `NODE_ENV=production`, except `*.localhost`, which has a special rule. This is runtime behavior, **not permission to deploy without a license**.
- Non-loopback **HTTPS** origins in a **production** bundle do not count as development. No key resolves to `unlicensed-production`, logs the production-license requirement, disables licensable features (collaboration/commenting), and the LicenseProvider removes the editor after **5000 ms** from entering that license state. It returns an invisible `data-testid="tl-license-expired"` gate: effectively a blank editor region. `Watermark` does not render for `unlicensed-production` (it only renders for `unlicensed` / `licensed-with-watermark`). An analytics request is attempted for unlicensed production.
- A non-production `NODE_ENV` counts as development regardless of HTTPS hostname. Hosts ending in `.localhost` are special: they count as development only when `NODE_ENV !== 'production'`, even over HTTP.
- A valid hobby/watermark key must also enable **collaboration** for this synced notebook. A valid key without the collaboration flag is not enough for `useSync` in production. Obtain/confirm the appropriate key; do not bypass the feature gate.

## Sources

All links pinned to the inspected tag:

- [LicenseManager.ts L187–214: origin / development classification](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/LicenseManager.ts#L187-L214)
- [LicenseManager.ts L325–332: no-key result](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/LicenseManager.ts#L325-L332)
- [LicenseManager.ts L579–634: feature gates and unlicensed states](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/LicenseManager.ts#L579-L634)
- [LicenseManager.ts L217–271: analytics](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/LicenseManager.ts#L217-L271)
- [LicenseProvider.tsx L34–89: 5000 ms gate](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/LicenseProvider.tsx#L34-L89)
- [Watermark.tsx L17–34 and L39–78: display states and unlicensed text](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/license/Watermark.tsx#L17-L78)
- [TldrawEditor.tsx L769–773: independent watermark mounting](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/editor/src/lib/TldrawEditor.tsx#L769-L773)
- [TldrawUi.tsx L73–91: hideUi keeps children](https://github.com/tldraw/tldraw/blob/v5.5.2/packages/tldraw/src/lib/ui/TldrawUi.tsx#L73-L91)

This client reads `import.meta.env.VITE_TLDRAW_LICENSE_KEY`. The parent build is responsible for mapping its `.env` `TLDRAW_LICENSE_KEY` to that variable. The browser-visible SDK license key is not a server secret.
