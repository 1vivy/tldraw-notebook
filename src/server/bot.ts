import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { spawn } from 'node:child_process'
import { createTLSchema, b64Vecs } from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'
import { PAGE_H, PAGE_GAP } from './geometry'

const schema = createTLSchema()
const root = process.cwd()
const python = process.env.NOTEBOOK_PYTHON || resolve(root, '../../tools-venv/bin/python3')
const cli = process.env.NOTEBOOK_CLI || resolve(root, '../../scripts/notebook_bot.py')
function fail(message:string):never { throw Object.assign(new Error(message), {statusCode:400}) }
function finite(n:any, name:string) { if (!Number.isFinite(n)) fail(`Invalid ${name}`); return n as number }
function positive(n:any, name:string) { finite(n,name); if(n<=0) fail(`Invalid ${name}`); return n }
export function textDoc(text:string) { return {type:'doc',content:text.split('\n').map(text=>({type:'paragraph',content:text?[{type:'text',text}]:[]}))} }
function py(args:string[], input:Buffer|string):Promise<string> {
 return new Promise((ok,no)=>{
  const child=spawn(python,args,{stdio:['pipe','pipe','pipe']}); let stdout='',stderr=''
  const timer=setTimeout(()=>{child.kill();no(new Error('Renderer timed out'))},60000)
  child.stdout.on('data',d=>{stdout+=d;if(stdout.length>80*1024*1024) child.kill()});child.stderr.on('data',d=>stderr+=d)
  child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);code===0?ok(stdout):no(new Error(stderr||'Renderer failed'))});child.stdin.on('error',()=>{});child.stdin.end(input)
 })
}
// Existing timestamp convention: shape.meta.updatedAt (ISO or epoch milliseconds).
// Unknown user timestamps remain null: reads do not pretend old ink is new.
function stamp(r:any):number|null { const v=r.meta?.updatedAt; if(v===undefined||v===null)return null;const t=typeof v==='number'?v:Date.parse(v);return Number.isFinite(t)?t:null }
function pageOf(shape:any,all:any[]):string|undefined { let r=shape;for(let n=0;n<100;n++){const parent=all.find(p=>p.id===r.parentId);if(!parent)return undefined;if(parent.typeName==='page')return parent.id;r=parent} }
function choose(all:any[],id?:string) { const pages=all.filter(r=>r.typeName==='page').sort((a,b)=>a.index.localeCompare(b.index));const page=id?pages.find(p=>p.id===id||p.name===id):pages[0];if(!page)fail('Page not found');return page }
function assetsFor(all:any[],shapes:any[],embed=false) {
 const ids=new Set(shapes.map(s=>s.props?.assetId));return all.filter(r=>r.typeName==='asset'&&ids.has(r.id)).map(r=>{
  if(!embed)return r
  const src=r.props?.src
  if(typeof src==='string'&&src.startsWith('/uploads/')){const id=decodeURIComponent(src.slice(9));if(!/^[\w. -]{1,250}$/.test(id))fail('Invalid asset id');return {...r,base64:readFileSync(resolve(root,'data/assets',id)).toString('base64')}}
  return r
 })
}
export function registerBot(app:any, initializedRoom:any, records:any, decoded:any) {
 app.get('/bot/:room/pages',async(req:any)=>{
  const room=await initializedRoom(req.params.room),all=records(room)
  return {pages:all.filter((r:any)=>r.typeName==='page').map((page:any)=>{
   const shapes=all.filter((s:any)=>s.typeName==='shape'&&pageOf(s,all)===page.id)
   const latest=(test:any)=>{const ts=shapes.filter(test).map(stamp).filter((v:any)=>v!==null);return ts.length?Math.max(...ts):null}
   return {...page,shapeCount:shapes.length,lastUserStroke:latest((s:any)=>!s.meta?.author&&['draw','highlight','line'].includes(s.type)),lastBotWrite:latest((s:any)=>s.meta?.author==='bot')}
  })}
 })
 app.post('/bot/:room/pages',async(req:any)=>{
  const b=req.body;if(!b||typeof b.name!=='string'||!b.name.trim()||b.name.length>200)fail('Expected name')
  const m=b.meta??{};if(!['ruled','grid','dot','blank'].includes(m.template??'ruled')||!['dated','notes','scratch'].includes(m.kind??'notes'))fail('Invalid page metadata')
  if(m.date!==undefined&&!/^\d{4}-\d{2}-\d{2}$/.test(m.date))fail('Invalid date')
  const room=await initializedRoom(req.params.room);let page:any
  await room.updateStore((s:any)=>{const pages=s.getAll().filter((r:any)=>r.typeName==='page').map((r:any)=>r.index).sort();page=schema.types.page.create({id:'page:'+randomUUID(),name:b.name,index:getIndexAbove(pages.at(-1)),meta:{kind:m.kind??'notes',...(m.date?{date:m.date}:{}),template:m.template??'ruled',createdBy:'bot',sheets:1}} as any);s.put(page)})
  return {page:room.getRecord(page.id)}
 })
 app.get('/bot/:room/shapes',async(req:any)=>{
  const room=await initializedRoom(req.params.room),all=records(room),page=choose(all,req.query.page)
  const since=req.query.since===undefined?null:(/^\d+$/.test(req.query.since)?Number(req.query.since):Date.parse(req.query.since));if(since!==null&&!Number.isFinite(since))fail('Invalid since')
  const shapes=all.filter((r:any)=>r.typeName==='shape'&&(!req.query.page||pageOf(r,all)===page.id)&&(since===null||stamp(r)===null||stamp(r)!>=since))
  return {room:req.params.room,page,shapes:shapes.map((s:any)=>decoded(s,all)),assets:assetsFor(all,shapes,true)}
 })
 app.get('/bot/:room/activity',async(req:any)=>{
  const room=await initializedRoom(req.params.room),all=records(room),now=Date.now()
  return {timestampSource:'shape.meta.updatedAt',lastBotRead:all.find((r:any)=>r.typeName==='document')?.meta?.lastBotRead??null,pages:all.filter((r:any)=>r.typeName==='page').map((page:any)=>{
   const shapes=all.filter((r:any)=>r.typeName==='shape'&&pageOf(r,all)===page.id),times=shapes.filter((s:any)=>!s.meta?.author&&['draw','highlight','line'].includes(s.type)).map(stamp).filter((v:any)=>v!==null)
   return {id:page.id,name:page.name,lastUserStroke:times.length?Math.max(...times):null,strokes:Object.fromEntries([5,15,60].map(n=>[n,times.filter((t:number)=>t>=now-n*60000).length])),openPlacements:[...new Set(shapes.filter((s:any)=>s.meta?.author==='bot').map((s:any)=>s.meta.placement).filter(Boolean))]}
  })}
 })
 app.post('/bot/:room/mark-read',async(req:any)=>{
  const room=await initializedRoom(req.params.room),lastBotRead=Date.now()
  await room.updateStore((s:any)=>{const doc=s.get('document:document');s.put({...doc,meta:{...doc.meta,lastBotRead}})})
  return {lastBotRead}
 })
 app.post('/bot/:room/place',async(req:any)=>{
  const b=req.body,items=Array.isArray(b)?b:b?.shapes,placement=b?.placement??randomUUID()
  if(!Array.isArray(items)||items.length===0||items.length>500||typeof placement!=='string'||!/^[\w .:-]{1,200}$/.test(placement))fail('Expected {placement?,shapes:[...]}')
  const room=await initializedRoom(req.params.room),all=records(room),prepared:any[]=[],assetWrites:any[]=[]
  for(const item of items){
   const page=choose(all,item.page),x=finite(item.x,'x'),y=finite(item.y,'y'),type=item.type
   let props:any,actual=type,color=item.color??(item.role==='problem'?'black':'red')
   if(type==='text'||type==='mark'){
    actual='text';const text=type==='mark'?(item.glyph??item.text):item.text
    if(type==='mark'&&!['✓','✗','?'].includes(text))fail('Invalid mark')
    if(!item.richText&&(typeof text!=='string'||text.length>100000))fail('Expected text or richText')
    props={color:type==='mark'?'red':color,size:type==='mark'?'l':item.size??'s',font:item.font??'sans',textAlign:'start',autoSize:item.autoSize??(item.w===undefined),w:positive(item.w??672,'w'),scale:1,richText:item.richText??textDoc(text)}
   }else if(type==='box'){
    actual='geo';props={geo:'rectangle',w:positive(item.w??item.width,'w'),h:positive(item.h??item.height,'h'),color:'red',dash:'dashed',fill:'none',size:'s',font:'sans',align:'middle',verticalAlign:'middle',richText:textDoc(''),labelColor:'red',growY:0,url:'',scale:1,flipX:false,flipY:false}
   }else if(type==='line'){
    const dx=item.x2!==undefined?finite(item.x2,'x2')-x:finite(item.w??item.width??100,'w'),dy=item.y2!==undefined?finite(item.y2,'y2')-y:finite(item.h??0,'h')
    props={color,size:item.size??'s',dash:item.dash??'solid',spline:'line',scale:1,points:{a1:{id:'a1',index:'a1',x:0,y:0},a2:{id:'a2',index:'a2',x:dx,y:dy}}}
   }else if(type==='highlight'){
    const w=positive(item.w??item.width,'w'),h=positive(item.h??item.height??24,'h');props={color:item.color??'yellow',size:'m',segments:[{type:'straight',dim:2,path:b64Vecs.encodePoints([{x:0,y:h/2},{x:w,y:h/2}],2)}],isComplete:true,isPen:false,scale:h/24,scaleX:1,scaleY:1}
   }else if(type==='image'){
    const raw=item.path?readFileSync(item.path):typeof item.base64==='string'?Buffer.from(item.base64.replace(/^data:[^;]+;base64,/,''),'base64'):fail('Expected image path or base64')
    if(raw.length===0||raw.length>16*1024*1024)fail('Invalid image size')
    const info=JSON.parse(await py(['-c','import sys,io,json;from PIL import Image;im=Image.open(io.BytesIO(sys.stdin.buffer.read()));im.verify();print(json.dumps({"w":im.width,"h":im.height,"mime":Image.MIME.get(im.format,"image/png")}))'],raw))
    const id=randomUUID(),assetId='asset:'+id,w=positive(item.w??item.width??672,'w')
    assetWrites.push({id,raw});prepared.push({id:assetId,typeName:'asset',type:'image',meta:{author:'bot',placement},props:{name:basename(item.path??id),src:'/uploads/'+id,w:info.w,h:info.h,mimeType:info.mime,isAnimated:false,fileSize:raw.length}})
    props={w,h:w*info.h/info.w,playing:true,url:'',assetId,crop:null,flipX:false,flipY:false,altText:item.altText??''}
   }else fail('Unknown placement type')
   const siblings=[...all,...prepared].filter((s:any)=>s.typeName==='shape'&&s.parentId===page.id).map((s:any)=>s.index).sort()
   const shape={id:'shape:'+randomUUID(),typeName:'shape',type:actual,parentId:page.id,x,y,rotation:0,index:getIndexAbove(siblings.at(-1)),isLocked:false,opacity:1,meta:{author:'bot',placement,updatedAt:new Date().toISOString()},props}
   schema.types.shape.validate(shape as any);prepared.push(shape)
  }
  for(const a of assetWrites)writeFileSync(resolve(root,'data/assets',a.id),a.raw)
  await room.updateStore((s:any)=>{
   for(const r of prepared)s.put(r)
   for(const id of new Set(prepared.filter(r=>r.typeName==='shape').map(r=>r.parentId))){const page=s.get(id),bottom=Math.max(...prepared.filter(r=>r.parentId===id).map(r=>r.y+(r.props.h??64)));const sheets=Math.max(page.meta?.sheets??1,Math.ceil((bottom+PAGE_H/3)/(PAGE_H+PAGE_GAP)));s.put({...page,meta:{...page.meta,sheets}})}
  })
  return {placement,ids:prepared.filter(r=>r.typeName==='shape').map(r=>r.id)}
 })
 app.delete('/bot/:room/placement/:id',async(req:any)=>{
  const room=await initializedRoom(req.params.room);let deleted:string[]=[]
  await room.updateStore((s:any)=>{deleted=s.getAll().filter((r:any)=>r.typeName==='shape'&&r.meta?.author==='bot'&&r.meta?.placement===req.params.id).map((r:any)=>r.id);for(const id of deleted)s.delete(id)})
  return {placement:req.params.id,deleted}
 })
 app.get('/bot/:room/export',async(req:any)=>{
  const room=await initializedRoom(req.params.room),all=records(room),page=choose(all,req.query.page),shapes=all.filter((r:any)=>r.typeName==='shape'&&pageOf(r,all)===page.id),assets=assetsFor(all,shapes,true)
  const rendered=JSON.parse(await py([cli,'render-data'],JSON.stringify({shapes:shapes.map((s:any)=>decoded(s,all)),assets,page})))
  return {tldr:{records:[...all.filter((r:any)=>r.typeName==='document'),page,...shapes,...assets],schema:schema.serialize()},png:rendered.png}
 })
}
