import { PAGE_H, PAGE_GAP } from '../shared/geometry'
export const templates = ['ruled', 'grid', 'dot', 'blank'] as const
export type Template = typeof templates[number]
export function templateFromMeta(meta: Record<string, unknown>): Template {
  return templates.includes(meta.template as Template) ? meta.template as Template : 'ruled'
}
export function sheetCount(bottom: number): number {
  return Math.max(1, Math.floor((Math.max(0, bottom) + PAGE_H / 3 + PAGE_GAP) / (PAGE_H + PAGE_GAP)) + 1)
}
export function resolveToday<T extends { meta: Record<string, unknown> }>(pages: readonly T[]): T | undefined {
  return pages.filter(p => p.meta.kind === 'dated').sort((a,b) => String(a.meta.date ?? '').localeCompare(String(b.meta.date ?? ''))).at(-1) ?? pages.at(-1)
}
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
export function datedMeta(date = localDate()) {
  return { kind: 'dated', date, template: 'ruled', createdBy: 'user' }
}
