export interface Point { x: number; y: number }

/** Even/odd polygon containment, with the boundary included. */
export function containsPoint(polygon: readonly Point[], point: Point): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j], b = polygon[i]
    const cross = (point.x - a.x) * (b.y - a.y) - (point.y - a.y) * (b.x - a.x)
    if (Math.abs(cross) < 1e-7 && point.x >= Math.min(a.x, b.x) &&
      point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) &&
      point.y <= Math.max(a.y, b.y)) return true
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

export function enclosesBounds(polygon: readonly Point[], bounds: { x: number; y: number; w: number; h: number }): boolean {
  return [
    { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.w, y: bounds.y },
    { x: bounds.x + bounds.w, y: bounds.y + bounds.h }, { x: bounds.x, y: bounds.y + bounds.h },
  ].every(point => containsPoint(polygon, point))
}

/** Deliberately conservative, screen-pixel heuristic; not handwriting recognition. */
export function isEraseScribble(points: readonly Point[]): boolean {
  if (points.length < 8) return false
  let length = 0, turns = 0
  let previous: Point | undefined
  let anchor = points[0]
  for (let i = 1; i < points.length; i++) {
    const vector = { x: points[i].x - anchor.x, y: points[i].y - anchor.y }
    const distance = Math.hypot(vector.x, vector.y)
    if (distance < 6) continue
    anchor = points[i]
    length += distance
    if (previous && (previous.x * vector.x + previous.y * vector.y) /
      (Math.hypot(previous.x, previous.y) * distance) < -0.45) turns++
    previous = vector
  }
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const width = Math.max(...xs) - Math.min(...xs), height = Math.max(...ys) - Math.min(...ys)
  return turns >= 3 && length >= 100 && length >= 3 * Math.max(width, height) && Math.max(width, height) <= 220
}

export function isNearHorizontal(points: readonly Point[]): boolean {
  if (points.length < 2) return false
  const start = points[0], end = points[points.length - 1]
  const dx = end.x - start.x
  return Math.abs(dx) >= 24 && points.every(p => Math.abs(p.y - start.y) <= Math.max(5, Math.abs(dx) * 0.12))
}
