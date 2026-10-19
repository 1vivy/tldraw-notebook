# Notebook interactions (tldraw 5.5.2)

## Integration / public surface

```ts
import { NotebookLassoTool, installInteractions } from './interaction'
// <Tldraw tools={[NotebookLassoTool]} ... />
// onMount / effect:
const dispose = installInteractions(editor, () => ({ fingerErase, scribbleErase }))
// On editor unmount or replacement: dispose()
// Toolbar: editor.setCurrentTool('notebook-lasso')
```

Keep the option getter live (a mutable ref works). Install only once per editor.
Mark toolbar/popover roots `data-notebook-ui`; pointer sequences beginning there
are excluded. The lasso remains a pen/mouse tool: fingers always pan or erase.
No user `meta.author` is introduced. Straightening copies existing metadata.

Only published package exports and Editor APIs are used: `StateNode`,
`b64Vecs`, `createShapeId`, `getIndices`, `editor.inputs.getCurrentPagePoint`,
`getContainer`, `getCurrentToolId`, `getCurrentPageId`, `getShape`,
`getCurrentPageShapesSorted`, `getShapePageBounds`, `getShapeGeometry`,
`getPointInShapeSpace`, `getShapePageTransform`, `isShapeOrAncestorLocked`,
`getInstanceState`, `screenToPage`, `getZoomLevel`, `getCamera`, `setCamera`,
`setCursor`, `setCurrentTool`, `setSelectedShapes`, `scribbles`,
`sideEffects.registerAfterCreateHandler/registerAfterChangeHandler`, `complete`,
`run`, `createShape`, `updateShape`, `deleteShapes`, `sendToBack`,
`markHistoryStoppingPoint`, `undo`, and `redo`. No private drawing child-state
access or synthetic editor input is used. Draw/highlight segment paths use
`b64Vecs`, not legacy point arrays; line points have public fractional indices.

The returned disposer is idempotent and removes capture listeners, side-effect
subscriptions, window blur listener, hold timer, and owned pointer captures.
Lasso scribbles are stopped on tool exit/cancel. Disposing does not unregister
the custom tool: its lifetime belongs to Tldraw's `tools` registration.

## Exact gesture behavior and limitations

- Capture-phase PointerEvent listeners on `editor.getContainer()` suppress only
  finger PointerEvents. They **never** prevent/default-stop TouchEvents,
  GestureEvents, wheel events, or native pinch dispatch. Native tldraw pinch
  receives the entire touch sequence, including its first finger; there is no
  replacement pinch implementation. Camera changes obey the host's existing
  camera constraints; this module does not impose page width or horizontal lock.
- One finger pans by screen delta / zoom, or erases whole hit shapes with a
  seven-screen-pixel hit tolerance. Erasure respects locked shapes/ancestors and
  read-only mode. It is not pixel erasure. A stationary eraser tap erases on lift.
  Once a second finger lands, single-finger actions stop until **all** fingers
  lift; a remaining finger cannot jump the camera after a pinch.
- Two/three distinct concurrently-down fingers, released within 280 ms of the
  first down and with every finger staying within eight screen pixels of its
  start, invoke undo/redo. Movement, cancellation, capture loss, four fingers,
  pen contact, or a long hold rejects the tap. There is no delayed zoom or
  camera rollback. Native pinch is allowed to begin even for a tap; negligible
  native camera motion may therefore coexist with a recognized tap. A first
  finger can pan/erase before a second arrives; undoing those changes on second
  contact would corrupt legitimate history, so they are not rolled back.
- A draw pointer held stationary for 400 ms completes the native stroke and
  replaces it with a two-endpoint `line`. Movement of at least two accumulated
  screen pixels restarts the timer; shorter jitter is tolerated. Endpoints less
  than eight screen pixels apart are left alone. The converted line freezes
  until lift; subsequent movement while held does not extend it. Pen pointerup
  still reaches tldraw to reset native input/capture state. Closed loops can
  straighten too: this is hold-to-line, not semantic shape recognition. Width,
  color, dash, transform, stacking position, opacity, and metadata are preserved;
  pressure variation is necessarily lost in a line. The replacement has a new
  shape ID. Parent/section changes invalidate the pending transformation.
- Highlighter completion keeps a native `highlight` shape; strokes spanning at
  least 24 screen pixels whose entire sampled path stays within max(5 px, 12%
  of horizontal span) of the starting height snap to that height. Completion
  sends the highlight to the back **among its siblings**, including non-ink
  siblings. Cross-parent reordering is not supported. Native shape-util rendering
  still controls blend/compositing. Remote and already-complete imported strokes
  are not transformed/reordered.
- Scribble erase is opt-in and a conservative heuristic, not handwriting
  recognition: at least eight samples, three sharp reversals, 100 px travel,
  travel at least three times span, and span at most 220 px. It runs on completed
  local draw strokes only and deletes intersecting unlocked draw/highlight/line
  shapes plus the scribble if any were hit. It can misrecognize zigzag writing;
  undo is the recovery. Sampling is capped at 4096 points. It does not erase
  text/images, cross-page ink, or masked geometry accurately. The tolerance is
  approximate for unusually scaled parent shapes. Drawing, replacement and
  deletion participate in tldraw history; there is no custom history stack.
- Lasso closes its sampled polygon on release and requires **all four corners
  of full page-axis-aligned shape bounds** inside (boundary included), not merely
  the center. Rotated shapes are conservatively bounded; deeply concave lassos
  can have all corners inside while a rectangle edge crosses a notch. This is
  the requested corner rule, not exact polygon/shape containment. No modifier
  selection, mask clipping, group promotion, or special frame selection policy
  is added; native select handles subsequent manipulation. Locked shapes are
  excluded. The live trail uses tldraw's fading scribble overlay, not a persistent
  closed polygon preview.
- Palm rejection, Pencil hover, pinch recognition and browser-generated pointer
  cancellation remain tldraw/browser responsibilities. A web app cannot reliably
  distinguish a resting palm from an intentional finger. Pencil double-tap and
  squeeze are not exposed by these APIs. OS accessibility gestures can consume
  three-finger touches before the page receives them.

## Verification

Standalone `npx tsc --noEmit --module esnext --moduleResolution bundler --target
es2022 --jsx react-jsx --esModuleInterop --skipLibCheck src/client/interaction.ts
src/client/interaction-geometry.ts src/client/interaction-geometry.test.ts`
passes. `npx tsx --test src/client/interaction-geometry.test.ts` passes six pure
geometry/heuristic tests. No browser is available in this task: real iPad
PointerEvent/TouchEvent ordering, palm rejection, pinch + tap arbitration,
collaborative undo grouping, and rendered highlighter layering still require
an actual browser/device acceptance test. Typechecking is not such a test.
