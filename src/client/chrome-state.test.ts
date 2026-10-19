import { describe,it,expect } from 'vitest'
import { chromeReducer as reduce, initialChrome } from './chrome-state'
describe('floating chrome',()=>{
 it('hides at 700ms and reveals 600ms after pen up',()=>{
  let s=reduce(initialChrome,{type:'down',now:0})
  s=reduce(s,{type:'tick',now:699});expect(s.hidden).toBe(false)
  s=reduce(s,{type:'tick',now:700});expect(s.hidden).toBe(true)
  s=reduce(s,{type:'up',now:900});s=reduce(s,{type:'tick',now:1499});expect(s.hidden).toBe(true)
  expect(reduce(s,{type:'tick',now:1500}).hidden).toBe(false)
 })
 it('keeps the initial hide deadline across consecutive short strokes',()=>{
  let s=reduce(initialChrome,{type:'down',now:0})
  s=reduce(s,{type:'up',now:100});s=reduce(s,{type:'down',now:200})
  expect(s.deadline).toBe(700)
  s=reduce(s,{type:'tick',now:700});expect(s.hidden).toBe(true)
  s=reduce(s,{type:'up',now:800});s=reduce(s,{type:'down',now:1000})
  expect(reduce(s,{type:'tick',now:1400}).hidden).toBe(true)
 })
 it('never hides with a popover open and reveals immediately on request',()=>{
  let s=reduce(initialChrome,{type:'down',now:0})
  s=reduce(s,{type:'block',now:10,blocked:true})
  expect(reduce(s,{type:'tick',now:900}).hidden).toBe(false)
  expect(s.deadline).toBe(null)
  s=reduce({...initialChrome,hidden:true},{type:'show',now:0})
  expect(s.hidden).toBe(false)
 })
 it('does not flash hidden after a brief isolated stroke',()=>{
  let s=reduce(initialChrome,{type:'down',now:0});s=reduce(s,{type:'up',now:20})
  s=reduce(s,{type:'tick',now:620});expect(s.hidden).toBe(false);expect(s.deadline).toBe(null)
 })
})
