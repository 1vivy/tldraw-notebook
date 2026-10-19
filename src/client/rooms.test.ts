import { describe, expect, it } from 'vitest'
import { parseRooms } from './rooms'

describe('room configuration', () => {
  it('defaults to generic notebooks', () => {
    expect(parseRooms()).toEqual([{id:'notebook',label:'Notebook'},{id:'scratch',label:'Scratch'}])
    expect(parseRooms(' ')).toEqual(parseRooms())
  })
  it('accepts comma-separated IDs', () => {
    expect(parseRooms('math, physics')).toEqual([{id:'math',label:'math'},{id:'physics',label:'physics'}])
  })
  it('preserves JSON labels and optional details', () => {
    expect(parseRooms('[{"id":"math","label":"Math","detail":"Notes","color":"#123456"}]')).toEqual([{id:'math',label:'Math',detail:'Notes',color:'#123456'}])
  })
  it('rejects invalid config instead of silently losing rooms', () => {
    for (const value of ['[', '[]', '[null]', '[{"id":"x","label":""}]', 'a,a', '../x', 'a,']) expect(() => parseRooms(value)).toThrow()
  })
})
