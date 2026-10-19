import { describe, expect, it } from 'vitest'
import { PAGE_W, RULE, MARGIN_X, TEXT_X, TEXT_W, PAGE_H, PAGE_GAP, sheetTop } from '../shared/geometry'
import { sheetCount, templateFromMeta, resolveToday, datedMeta, localDate } from './notebook'
describe('shared geometry', () => {
  it('matches the page-space contract', () => {
    expect([PAGE_W,RULE,MARGIN_X,TEXT_X,TEXT_W,PAGE_H,PAGE_GAP]).toEqual([820,32,72,88,672,1088,48])
    expect(sheetTop(0)).toBe(0); expect(sheetTop(2)).toBe(2272)
  })
  it('extends at the last sheet bottom third and handles distant content', () => {
    expect(sheetCount(0)).toBe(1)
    expect(sheetCount(PAGE_H*2/3-1)).toBe(1)
    expect(sheetCount(PAGE_H*2/3)).toBe(2)
    expect(sheetCount(sheetTop(4)+PAGE_H*2/3)).toBe(6)
  })
})
describe('page metadata', () => {
  it('defaults invalid and missing templates to ruled', () => {
    expect(templateFromMeta({})).toBe('ruled'); expect(templateFromMeta({template:'unknown'})).toBe('ruled')
    for(const template of ['ruled','grid','dot','blank'])expect(templateFromMeta({template})).toBe(template)
  })
  it('uses local dates and creates user dateds without authorship', () => {
    expect(localDate(new Date(2026,9,18,23))).toBe('2026-10-18')
    expect(datedMeta('2026-10-18')).toEqual({kind:'dated',date:'2026-10-18',template:'ruled',createdBy:'user'})
  })
  it('resolves newest dated irrespective of section order, else last page', () => {
    const pages = [{meta:{kind:'dated',date:'2026-10-20'}},{meta:{kind:'dated',date:'2026-10-19'}},{meta:{kind:'notes'}}]
    expect(resolveToday(pages)).toBe(pages[0]);expect(resolveToday(pages.slice(2))).toBe(pages[2]);expect(resolveToday([])).toBeUndefined()
  })
})
