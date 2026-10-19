import {
  Editor, StateNode, b64Vecs, createShapeId, getIndices,
  type TLDrawShape, type TLHighlightShape, type TLShapeId,
} from 'tldraw'
import { enclosesBounds, isEraseScribble, isNearHorizontal, type Point } from './interaction-geometry'

/** Enclosure lasso. Register in Tldraw's tools prop and activate notebook-lasso. */
export class NotebookLassoTool extends StateNode {
  static override id = 'notebook-lasso'
  private points: Point[] = []
  private scribbleId: string | undefined

  override onEnter() { this.editor.setCursor({ type: 'cross', rotation: 0 }) }
  override onPointerDown() {
    this.stopScribble()
    this.points = []
    this.scribbleId = this.editor.scribbles.addScribble({ color: 'selection-stroke', size: 2, opacity: 0.7 }).id
    this.addPoint()
  }
  override onPointerMove() { if (this.scribbleId) this.addPoint() }
  override onPointerUp() {
    if (!this.scribbleId) return
    this.addPoint()
    const ids = this.editor.getCurrentPageShapesSorted().filter(shape => {
      if (this.editor.isShapeOrAncestorLocked(shape)) return false
      const bounds = this.editor.getShapePageBounds(shape)
      return bounds && enclosesBounds(this.points, bounds)
    }).map(shape => shape.id)
    this.stopScribble()
    this.editor.setCurrentTool('select')
    this.editor.setSelectedShapes(ids)
  }
  override onCancel() { this.stopScribble(); this.editor.setCurrentTool('select') }
  override onInterrupt() { this.onCancel() }
  override onExit() { this.stopScribble(); this.editor.setCursor({ type: 'default', rotation: 0 }) }
  private addPoint() {
    const p = this.editor.inputs.getCurrentPagePoint()
    this.points.push({ x: p.x, y: p.y })
    if (this.scribbleId) this.editor.scribbles.addPoint(this.scribbleId, p.x, p.y)
  }
  private stopScribble() {
    if (this.scribbleId) this.editor.scribbles.stop(this.scribbleId)
    this.scribbleId = undefined
    this.points = []
  }
}

type Ink = TLDrawShape | TLHighlightShape
type Stroke = {
  pointer: number; tool: string; points: Point[]; shape?: TLShapeId
  held: boolean; canceled: boolean; processed: boolean; page: string
}

/** Returns an idempotent disposer; call it before disposing the editor. */
export function installInteractions(
  editor: Editor,
  options: () => { fingerErase: boolean; scribbleErase: boolean; fingerDraws?: boolean; reveal?: () => void },
): () => void {
  const container = editor.getContainer()
  const touches = new Map<number, { start: Point; last: Point }>()
  let maximumTouches = 0, touchStart = 0, rejected = false, multi = false
  let eraseMark = false, disposed = false
  let stroke: Stroke | undefined
  let holdTimer: ReturnType<typeof setTimeout> | undefined
  const disposers: (() => void)[] = []
  const ignored = (event: Event) => event.composedPath().some(target =>
    target instanceof Element && target.matches('[data-notebook-ui]'))
  const clearHold = () => { if (holdTimer !== undefined) clearTimeout(holdTimer); holdTimer = undefined }
  const screen = (event: PointerEvent): Point => ({ x: event.clientX, y: event.clientY })

  function eraseBetween(a: Point, b: Point) {
    if (editor.getInstanceState().isReadonly) return
    const A = editor.screenToPage(a), B = editor.screenToPage(b)
    const margin = 7 / editor.getZoomLevel()
    const ids = editor.getCurrentPageShapesSorted().filter(shape => {
      if (editor.isShapeOrAncestorLocked(shape)) return false
      const geometry = editor.getShapeGeometry(shape)
      return geometry.hitTestLineSegment(editor.getPointInShapeSpace(shape, A), editor.getPointInShapeSpace(shape, B), margin)
    }).map(shape => shape.id)
    if (!ids.length) return
    if (!eraseMark) { editor.markHistoryStoppingPoint('finger erase'); eraseMark = true }
    editor.deleteShapes(ids)
  }

  function finishInk(s: Stroke, shape: Ink) {
    if (disposed || s.processed || s.canceled || shape.parentId !== s.page || editor.getCurrentPageId() !== s.page) return
    if (!shape.props.isComplete) return
    s.processed = true
    const local = shape.props.segments.flatMap(segment => b64Vecs.decodePoints(segment.path))
    if (local.length < 2) return
    const first = local[0], last = local[local.length - 1]
    if (shape.type === 'draw' && options().scribbleErase && isEraseScribble(s.points)) {
      // Delete only ink intersecting this completed gesture, never whole bounding boxes.
      const transform = editor.getShapePageTransform(shape)
      const path = local.map(p => transform.applyToPoint({ x: p.x * shape.props.scaleX, y: p.y * shape.props.scaleY }))
      const ids = editor.getCurrentPageShapesSorted().filter(candidate => {
        if (candidate.id === shape.id || !['draw', 'highlight', 'line'].includes(candidate.type) || editor.isShapeOrAncestorLocked(candidate)) return false
        const geometry = editor.getShapeGeometry(candidate)
        return path.slice(1).some((p, i) => geometry.hitTestLineSegment(
          editor.getPointInShapeSpace(candidate, path[i]), editor.getPointInShapeSpace(candidate, p), 4 / editor.getZoomLevel()))
      }).map(candidate => candidate.id)
      if (ids.length) editor.deleteShapes([shape.id, ...ids])
      return
    }
    if (shape.type === 'highlight') {
      editor.run(() => {
        if (isNearHorizontal(s.points)) editor.updateShape<TLHighlightShape>({ id: shape.id, type: 'highlight', props: {
          segments: [{ type: 'straight', path: b64Vecs.encodePoints([{ ...first }, { ...last, y: first.y }]) }],
        } })
        editor.sendToBack([shape.id])
      })
    } else if (s.held && Math.hypot(last.x - first.x, last.y - first.y) >= 8 / editor.getZoomLevel()) {
      const [a, b] = getIndices(2)
      editor.run(() => {
        editor.createShape({ id: createShapeId(), type: 'line', parentId: shape.parentId,
          x: shape.x, y: shape.y, rotation: shape.rotation, index: shape.index,
          opacity: shape.opacity, meta: { ...shape.meta },
          props: { color: shape.props.color, size: shape.props.size, dash: shape.props.dash,
            scale: shape.props.scale, spline: 'line', points: {
              [a]: { id: a, index: a, x: first.x * shape.props.scaleX, y: first.y * shape.props.scaleY },
              [b]: { id: b, index: b, x: last.x * shape.props.scaleX, y: last.y * shape.props.scaleY },
            } },
        })
        editor.deleteShapes([shape.id])
      })
    }
  }

  disposers.push(editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
    if (source !== 'user' || !stroke || stroke.canceled || stroke.processed ||
      shape.type !== stroke.tool || (shape.type !== 'draw' && shape.type !== 'highlight') || shape.props.isComplete) return
    stroke.shape = shape.id
  }))
  disposers.push(editor.sideEffects.registerAfterChangeHandler('shape', (_previous, shape, source) => {
    if (source !== 'user' || !stroke || shape.id !== stroke.shape || (shape.type !== 'draw' && shape.type !== 'highlight')) return
    finishInk(stroke, shape)
  }))

  function armHold(s: Stroke) {
    clearHold()
    holdTimer = setTimeout(() => {
      holdTimer = undefined
      if (disposed || stroke !== s || s.canceled || s.processed || s.tool !== 'draw' ||
        editor.getCurrentToolId() !== 'draw' || editor.getCurrentPageId() !== s.page || !s.shape) return
      const shape = editor.getShape(s.shape)
      if (shape?.type !== 'draw' || s.points.length < 2) return
      s.held = true
      editor.complete()
      const completed = editor.getShape(s.shape)
      if (completed?.type === 'draw') finishInk(s, completed)
    }, 400)
  }

  function down(event: PointerEvent) {
    if (ignored(event)) return
    if (event.pointerType === 'touch' && !options().fingerDraws) {
      // Only PointerEvents are stopped. TouchEvents and GestureEvents reach native pinch unchanged.
      event.stopPropagation()
      const p = screen(event)
      if (!touches.size) { maximumTouches = 0; touchStart = performance.now(); rejected = !!stroke && !stroke.processed; multi = false; eraseMark = false }
      touches.set(event.pointerId, { start: p, last: p })
      maximumTouches = Math.max(maximumTouches, touches.size)
      multi ||= touches.size > 1
      // Capture keeps one-finger pan/erase tracked after leaving the paper.
      try { container.setPointerCapture(event.pointerId) } catch { /* detached/canceled pointer */ }
      return
    }
    rejected = true
    if (event.button !== 0 || !['draw', 'highlight'].includes(editor.getCurrentToolId())) return
    clearHold()
    stroke = { pointer: event.pointerId, tool: editor.getCurrentToolId(), points: [screen(event)],
      held: false, canceled: false, processed: false, page: editor.getCurrentPageId() }
    if (stroke.tool === 'draw') armHold(stroke)
  }

  function move(event: PointerEvent) {
    const touch = touches.get(event.pointerId)
    if (touch) {
      event.stopPropagation()
      const p = screen(event)
      if (Math.hypot(p.x - touch.start.x, p.y - touch.start.y) > 8) rejected = true
      if (!multi && touches.size === 1) {
        if (options().fingerErase) eraseBetween(touch.last, p)
        else {
          const camera = editor.getCamera(), zoom = editor.getZoomLevel()
          editor.setCamera({ x: camera.x + (p.x - touch.last.x) / zoom, y: camera.y + (p.y - touch.last.y) / zoom, z: camera.z })
        }
      }
      touch.last = p
      return
    }
    if (!stroke || stroke.pointer !== event.pointerId || stroke.canceled) return
    if (stroke.held) { event.stopPropagation(); return }
    const p = screen(event), previous = stroke.points[stroke.points.length - 1]
    if (Math.hypot(p.x - previous.x, p.y - previous.y) >= 2) {
      // Bound memory without manufacturing a scribble from a long stroke.
      if (stroke.points.length < 4096) stroke.points.push(p)
      if (stroke.tool === 'draw') armHold(stroke)
    }
  }

  function up(event: PointerEvent) {
    const touch = touches.get(event.pointerId)
    if (touch) {
      event.stopPropagation()
      if (event.type !== 'pointerup' || Math.hypot(event.clientX - touch.start.x, event.clientY - touch.start.y) > 8) rejected = true
      if (!multi && event.type === 'pointerup' && options().fingerErase) eraseBetween(touch.last, screen(event))
      touches.delete(event.pointerId)
      try { if (container.hasPointerCapture(event.pointerId)) container.releasePointerCapture(event.pointerId) } catch { /* detached */ }
      if (!touches.size) {
        if (!rejected && performance.now() - touchStart <= 280) {
          if (maximumTouches === 2) options().reveal?.()
          if (maximumTouches === 3) editor.redo()
        }
        eraseMark = false
      }
      return
    }
    if (!stroke || stroke.pointer !== event.pointerId) return
    clearHold()
    if (event.type !== 'pointerup') stroke.canceled = true
    // Let even a held stroke's pointerup reach tldraw so its input/capture state resets.
    // Native drawing completes on its own queued pointerup; sideEffects handles that transaction.
  }
  function reset() {
    clearHold()
    if (stroke) stroke.canceled = true
    for (const id of touches.keys()) {
      try { if (container.hasPointerCapture(id)) container.releasePointerCapture(id) } catch { /* detached */ }
    }
    touches.clear(); rejected = true; multi = false
  }
  function listen(type: string, handler: EventListener) {
    container.addEventListener(type, handler, { capture: true })
    disposers.push(() => container.removeEventListener(type, handler, { capture: true }))
  }
  listen('pointerdown', down as EventListener)
  listen('pointermove', move as EventListener)
  listen('pointerup', up as EventListener)
  listen('pointercancel', up as EventListener)
  listen('lostpointercapture', ((event: PointerEvent) => {
    if (touches.has(event.pointerId)) { rejected = true; touches.delete(event.pointerId) }
  }) as EventListener)
  listen('focusout', (() => { if (!container.contains(document.activeElement)) reset() }) as EventListener)
  const onBlur = () => reset()
  window.addEventListener('blur', onBlur)
  disposers.push(() => window.removeEventListener('blur', onBlur))
  return () => {
    if (disposed) return
    disposed = true
    reset()
    for (const dispose of disposers.reverse()) dispose()
    stroke = undefined
  }
}
