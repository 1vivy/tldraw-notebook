import { describe, expect, it } from 'vitest'
import { cameraOptions, clampCameraY, fitWidthZoom, notebookCamera, shouldSnapToFit } from './camera'
import { PAGE_H, PAGE_W, sheetTop } from '../shared/geometry'

describe('notebook camera math', () => {
  it('fits width with exactly eight screen pixels on either side', () => {
    const width = 836
    const fit = fitWidthZoom(width)
    expect(fit).toBe(1)
    expect((width - PAGE_W * fit) / 2).toBe(8)
    expect(fitWidthZoom(426)).toBe(.5)
    expect(fitWidthZoom(0)).toBeGreaterThan(0)
  })
  it('enforces fit minimum, three-times-fit maximum and centered horizontal lock', () => {
    for (const z of [.01, .5, 1, 2, 8]) {
      const camera = notebookCamera({ x: 500, y: -20, z }, 426, PAGE_H)
      expect(camera.z).toBeGreaterThanOrEqual(.5)
      expect(camera.z).toBeLessThanOrEqual(1.5)
      expect((PAGE_W / 2 + camera.x) * camera.z).toBe(213)
    }
    expect(cameraOptions.zoomSteps).toEqual([1, 1.5, 2, 3])
    expect(cameraOptions.constraints?.behavior).toEqual({ x: 'fixed', y: 'free' })
  })
  it('clamps the viewport top from zero through the last sheet bottom', () => {
    const bottom = sheetTop(2) + PAGE_H
    expect(clampCameraY(20, bottom)).toBe(0)
    expect(clampCameraY(-100, bottom)).toBe(-100)
    expect(clampCameraY(-bottom - 500, bottom)).toBe(-bottom)
    // No viewport-height subtraction: a blank viewport after the paper is allowed.
    expect(notebookCamera({ x: 0, y: -bottom, z: 1 }, 836, bottom).y).toBe(-bottom)
    expect(clampCameraY(-500, 0)).toBe(0)
  })
  it('snaps only zooms within eight percent above fit', () => {
    expect(shouldSnapToFit(1, 1)).toBe(false)
    expect(shouldSnapToFit(.9, 1)).toBe(false)
    expect(shouldSnapToFit(1.04, 1)).toBe(true)
    expect(shouldSnapToFit(1.08, 1)).toBe(true)
    expect(shouldSnapToFit(1.081, 1)).toBe(false)
    expect(shouldSnapToFit(2, 1)).toBe(false)
    expect(shouldSnapToFit(.52, .5)).toBe(true)
    expect(shouldSnapToFit(1, 0)).toBe(false)
  })
})
