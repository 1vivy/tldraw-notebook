/** Page-space contract shared by the browser and bot. */
export const PAGE_W = 820
export const RULE = 32
export const MARGIN_X = 72
export const TEXT_X = 88
export const TEXT_W = 672
export const PAGE_H = 1088
export const PAGE_GAP = 48
export const sheetTop = (n: number): number => n * (PAGE_H + PAGE_GAP)
