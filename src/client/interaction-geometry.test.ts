import assert from 'node:assert/strict'
import { test } from 'vitest'
import { containsPoint, enclosesBounds, isEraseScribble, isNearHorizontal } from './interaction-geometry'

const square = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
test('polygon includes boundary and rejects outside / degenerate lasso', () => {
  assert.equal(containsPoint(square, { x: 0, y: 50 }), true)
  assert.equal(containsPoint(square, { x: 99, y: 50 }), true)
  assert.equal(containsPoint(square, { x: 101, y: 50 }), false)
  assert.equal(containsPoint(square.slice(0, 2), { x: 10, y: 0 }), false)
})
test('selection requires all full bounds corners, not just center', () => {
  assert.equal(enclosesBounds(square, { x: 10, y: 10, w: 80, h: 80 }), true)
  assert.equal(enclosesBounds(square, { x: -10, y: 10, w: 100, h: 80 }), false)
  assert.equal(enclosesBounds([...square].reverse(), { x: 0, y: 0, w: 100, h: 100 }), true)
})
test('concave lasso is not treated as its bounding rectangle', () => {
  const lasso = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 20 }, { x: 20, y: 20 }, { x: 20, y: 100 }, { x: 0, y: 100 }]
  assert.equal(enclosesBounds(lasso, { x: 30, y: 30, w: 10, h: 10 }), false)
})
test('horizontal highlight accepts either direction, rejects short or bowed stroke', () => {
  assert.equal(isNearHorizontal([{ x: 100, y: 0 }, { x: 50, y: 3 }, { x: 0, y: 4 }]), true)
  assert.equal(isNearHorizontal([{ x: 0, y: 0 }, { x: 20, y: 0 }]), false)
  assert.equal(isNearHorizontal([{ x: 0, y: 0 }, { x: 50, y: 35 }, { x: 100, y: 0 }]), false)
})
test('scribble needs repeated reversals and compact long travel', () => {
  const zigzag = Array.from({ length: 10 }, (_, i) => ({ x: i % 2 ? 50 : 0, y: i * 2 }))
  assert.equal(isEraseScribble(zigzag), true)
  assert.equal(isEraseScribble(Array.from({ length: 10 }, (_, i) => ({ x: i * 20, y: i }))), false)
  assert.equal(isEraseScribble(zigzag.map(p => ({ x: p.x * 10, y: p.y }))), false)
})
test('dense pointer sampling still recognizes scribble', () => {
  const dense = Array.from({ length: 250 }, (_, i) => ({ x: Math.abs((i % 100) - 50), y: i / 30 }))
  assert.equal(isEraseScribble(dense), true)
})
