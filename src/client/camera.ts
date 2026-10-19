import { react, type Editor, type TLCameraOptions } from 'tldraw'
import { PAGE_W, PAGE_H, sheetTop } from '../shared/geometry'
import { sheetCount } from './notebook'

const GUTTER = 8
const SNAP_MS = 150
export const cameraOptions: Partial<TLCameraOptions> = {
  wheelBehavior: 'pan', zoomSteps: [1, 1.5, 2, 3],
  constraints: {
    bounds: { x: 0, y: 0, w: PAGE_W, h: PAGE_H },
    padding: { x: GUTTER, y: 0 }, origin: { x: .5, y: 0 },
    initialZoom: 'fit-x', baseZoom: 'fit-x',
    // Vertical limits are asymmetric: the last sheet may reach the viewport top.
    behavior: { x: 'fixed', y: 'free' },
  },
}

export function fitWidthZoom(width: number): number {
  return Math.max(1, width - 2 * GUTTER) / PAGE_W
}
export function clampCameraY(y: number, bottom: number): number {
  return Math.min(0, Math.max(-Math.max(0, bottom), y)) || 0
}
/** Only snap close to fit, never interrupt intentional intermediate zooms. */
export function shouldSnapToFit(zoom: number, fit: number): boolean {
  return fit > 0 && zoom > fit * 1.0001 && zoom <= fit * 1.08
}
export function notebookCamera(camera: { x: number; y: number; z: number }, width: number, bottom: number) {
  const fit = fitWidthZoom(width)
  const z = Math.min(3 * fit, Math.max(fit, camera.z))
  return { x: (width / z - PAGE_W) / 2, y: clampCameraY(camera.y, bottom), z }
}

/** Install once per editor; all state is tab-local and scoped to room + page. */
export function installNotebookCamera(editor: Editor): () => void {
  const container = editor.getContainer()
  const room = window.location.pathname
  let disposed = false
  let queued = false
  let page = ''
  let width = 0
  let height = 0
  let bottom = PAGE_H
  let last = { x: 0, y: 0, z: 1 }
  let timer: ReturnType<typeof setTimeout> | undefined
  const pointers = new Map<number, { x: number; y: number; time: number; valid: boolean }>()
  let previousTap: { x: number; y: number; time: number } | undefined
  const key = (id: string) => `notebook-camera:${encodeURIComponent(room)}:${id}`
  function save() {
    if (!page) return
    try { sessionStorage.setItem(key(page), JSON.stringify(last)) } catch { /* storage may be disabled */ }
  }
  function restore(id: string) {
    try {
      const value = JSON.parse(sessionStorage.getItem(key(id)) ?? 'null')
      if (value && ['x', 'y', 'z'].every(k => typeof value[k] === 'number' && Number.isFinite(value[k])) && value.z > 0) return value as typeof last
    } catch { /* malformed or unavailable storage */ }
    return { x: 0, y: 0, z: fitWidthZoom(width) }
  }
  function clearSnap() { clearTimeout(timer); timer = undefined }
  function snapLater() {
    clearSnap()
    if (pointers.size || !shouldSnapToFit(last.z, fitWidthZoom(width))) return
    timer = setTimeout(() => {
      timer = undefined
      if (disposed || pointers.size || !shouldSnapToFit(editor.getZoomLevel(), fitWidthZoom(width))) return
      const camera = editor.getCamera()
      editor.setCamera(notebookCamera({ ...camera, z: fitWidthZoom(width) }, width, bottom), { animation: { duration: SNAP_MS } })
    }, SNAP_MS)
  }
  function sync() {
    queued = false
    if (disposed) return
    const id = editor.getCurrentPageId()
    const viewport = editor.getViewportScreenBounds()
    if (viewport.w <= 0 || viewport.h <= 0) return
    const changedPage = id !== page
    const resized = width !== viewport.w || height !== viewport.h
    if (changedPage) { save(); clearSnap(); previousTap = undefined; pointers.clear() }
    width = viewport.w; height = viewport.h
    let maxY = 0
    for (const shape of editor.getCurrentPageShapesSorted()) {
      const bounds = editor.getShapePageBounds(shape)
      if (bounds) maxY = Math.max(maxY, bounds.maxY)
    }
    const nextBottom = sheetTop(sheetCount(maxY) - 1) + PAGE_H
    const changedBounds = bottom !== nextBottom
    bottom = nextBottom
    if (changedPage || changedBounds || resized) {
      editor.setCameraOptions({ ...cameraOptions, constraints: {
        ...cameraOptions.constraints!, bounds: { x: 0, y: 0, w: PAGE_W, h: bottom },
      } })
    }
    const current = changedPage ? restore(id) : editor.getCamera()
    page = id
    const target = notebookCamera(resized && !changedPage ? { ...current, z: fitWidthZoom(width) } : current, width, bottom)
    const actual = editor.getCamera()
    if (actual.x !== target.x || actual.y !== target.y || actual.z !== target.z) editor.setCamera(target, { immediate: true })
    last = target
    save()
    snapLater()
  }
  function schedule() {
    if (disposed || queued) return
    queued = true
    queueMicrotask(sync)
  }
  // Before-change also covers native pinch/inertia, whose camera moves may use force.
  const stopClamp = editor.sideEffects.registerBeforeChangeHandler('camera', (_old, next) => {
    if (!width) return next
    return { ...next, ...notebookCamera(next, width, bottom) }
  })
  sync()
  // Read reactive geometry, viewport and page state, including remote shape changes.
  const stopWatch = react('notebook camera', () => {
    editor.getCurrentPageId()
    editor.getViewportScreenBounds()
    editor.getCamera()
    for (const shape of editor.getCurrentPageShapesSorted()) editor.getShapePageBounds(shape)
    schedule()
  })
  function ignored(event: PointerEvent) {
    return event.target instanceof Element && !!event.target.closest('[data-notebook-ui], button, input, textarea, select, a')
  }
  function down(event: PointerEvent) {
    if (ignored(event)) return
    clearSnap()
    if (event.pointerType !== 'touch') { previousTap = undefined; return }
    if (pointers.size) {
      for (const pointer of pointers.values()) pointer.valid = false
      previousTap = undefined
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, time: performance.now(), valid: pointers.size === 0 })
  }
  function move(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId)
    if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      pointer.valid = false; previousTap = undefined
    }
  }
  function up(event: PointerEvent) {
    const pointer = pointers.get(event.pointerId)
    pointers.delete(event.pointerId)
    const now = performance.now()
    if (!pointer || !pointer.valid || event.type !== 'pointerup' || now - pointer.time > 280 ||
      Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) {
      previousTap = undefined; snapLater(); return
    }
    if (previousTap && now - previousTap.time <= 320 && Math.hypot(event.clientX - previousTap.x, event.clientY - previousTap.y) <= 24) {
      previousTap = undefined
      const camera = editor.getCamera(), fit = fitWidthZoom(width)
      const z = camera.z < fit * 1.5 ? fit * 2 : fit
      const localY = event.clientY - editor.getViewportScreenBounds().y
      // Keep the tapped vertical position anchored; horizontal position remains locked.
      const y = camera.y + localY / z - localY / camera.z
      editor.setCamera(notebookCamera({ ...camera, y, z }, width, bottom), { animation: { duration: SNAP_MS } })
    } else previousTap = { x: event.clientX, y: event.clientY, time: now }
    snapLater()
  }
  function blur() { pointers.clear(); previousTap = undefined; clearSnap(); save() }
  const listeners: [string, EventListener][] = [
    ['pointerdown', down as EventListener], ['pointermove', move as EventListener],
    ['pointerup', up as EventListener], ['pointercancel', up as EventListener],
  ]
  // Observe only: never interfere with native TouchEvent/GestureEvent pinch.
  for (const [type, listener] of listeners) container.addEventListener(type, listener, true)
  window.addEventListener('blur', blur)
  window.addEventListener('pagehide', save)
  return () => {
    if (disposed) return
    last = notebookCamera(editor.getCamera(), width || 1, bottom)
    save(); disposed = true; clearSnap(); pointers.clear()
    stopWatch(); stopClamp()
    for (const [type, listener] of listeners) container.removeEventListener(type, listener, true)
    window.removeEventListener('blur', blur)
    window.removeEventListener('pagehide', save)
  }
}
