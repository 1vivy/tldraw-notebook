import 'dotenv/config'
import { registerBot } from './bot'
import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import staticPlugin from '@fastify/static'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { NodeSqliteWrapper, SQLiteSyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import { b64Vecs, createTLSchema } from '@tldraw/tlschema'
import { getIndexAbove } from '@tldraw/utils'
const root = process.cwd()
mkdirSync(resolve(root,'data/assets'),{recursive:true})
const rooms = new Map<string, {room:TLSocketRoom<any>,db:DatabaseSync}>()
function validRoom(id:string){ if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Invalid room id'); return id }
export function loadRoom(id:string){
 validRoom(id)
 if(rooms.has(id)) return rooms.get(id)!.room
 const db=new DatabaseSync(resolve(root,'data',id+'.sqlite'))
 db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;')
 const storage=new SQLiteSyncStorage({sql:new NodeSqliteWrapper(db)})
 const room=new TLSocketRoom<any>({storage})
 rooms.set(id,{room,db})
 return room
}
async function initializedRoom(id:string){
 const room=loadRoom(id)
 if(!room.getCurrentSnapshot().documents.some((d:any)=>d.state.typeName==='page')){
  const schema=createTLSchema()
  await room.updateStore(s=>{s.put(schema.types.document.create({id:'document:document'} as any)); s.put(schema.types.page.create({id:'page:page',name:'Notebook',index:'a1'} as any))})
 }
 return room
}
function records(room:TLSocketRoom<any>){return room.getCurrentSnapshot().documents.map((d:any)=>d.state)}
function envelope(room:TLSocketRoom<any>,type:string,x:number,y:number,id?:string){
 const all=records(room), page=all.find((r:any)=>r.typeName==='page')
 const indices=all.filter((r:any)=>r.typeName==='shape'&&r.parentId===page.id).map((r:any)=>r.index).sort()
 return {id:id||'shape:'+randomUUID(),typeName:'shape',type,x,y,rotation:0,index:getIndexAbove(indices.at(-1)||'a0'),parentId:page.id,isLocked:false,opacity:1,meta:{author:'bot',placement:randomUUID(),updatedAt:new Date().toISOString()}}
}
function richText(text:string){return {type:'doc',content:text.split('\n').map(t=>({type:'paragraph',content:t?[{type:'text',text:t}]:[]}))}}
function decoded(shape:any,all:any[]){
 if(!['draw','highlight'].includes(shape.type)) return shape
 const transform=(point:any)=>{
  // Geometry is scaled by scaleX/Y; props.scale scales stroke width, not coordinates.
  let x=point.x*(shape.props.scaleX??1),y=point.y*(shape.props.scaleY??1)
  let node=shape
  for(let i=0;i<20;i++){
   const c=Math.cos(node.rotation||0),s=Math.sin(node.rotation||0)
   ;[x,y]=[node.x+c*x-s*y,node.y+s*x+c*y]
   const parent=all.find(r=>r.id===node.parentId&&r.typeName==='shape')
   if(!parent) break
   node=parent
  }
  return {x,y,z:point.z??0.5,pressure:point.z??0.5}
 }
 return {...shape,color:shape.props.color,size:shape.props.size,isComplete:shape.props.isComplete,segments:shape.props.segments.map((seg:any)=>({type:seg.type,points:b64Vecs.decodePoints(seg.path,seg.dim).map(transform)}))}
}
const app=Fastify({logger:true,bodyLimit:20*1024*1024,trustProxy:false})
await app.register(websocket)
app.addHook('preHandler',async(req,reply)=>{
 if(req.routeOptions.url?.startsWith('/bot/')){
  const host=req.headers.host||''
  if(!/^127\.0\.0\.1:5858$/.test(host)||Object.keys(req.headers).some(h=>h.startsWith('x-forwarded-')||h.startsWith('tailscale-')||h==='forwarded')) return reply.code(403).send({error:'Bot API is local-only'})
 }
})
app.get('/connect/:roomId',{websocket:true},(socket,req)=>{
 try {
  const id=(req.params as any).roomId,sessionId=(req.query as any).sessionId
  if(typeof sessionId!=='string'||sessionId.length>200) {socket.close(1008,'sessionId required');return}
  loadRoom(id).handleSocketConnect({sessionId,socket})
 }catch(e){socket.close(1008,'Invalid room')}
})
registerBot(app, initializedRoom, records, decoded)
app.post('/bot/:room/feedback',async(req,reply)=>{
 const body=req.body as any
 if(!body||typeof body.text!=='string'||body.text.length>20000||!Number.isFinite(body.x)||!Number.isFinite(body.y)||!['text','note'].includes(body.kind??'text')) return reply.code(400).send({error:'Expected text, numeric x/y, kind text|note'})
 const room=await initializedRoom((req.params as any).room),kind=body.kind??'text'
 const targetPage=body.page?records(room).find((r:any)=>r.typeName==='page'&&(r.id===body.page||r.name===body.page)):undefined
 if(body.page&&!targetPage)return reply.code(400).send({error:'Page not found'})
 const shape={...envelope(room,kind,body.x,body.y),props:kind==='note'?{color:'light-red',richText:richText(body.text),size:'m',font:'draw',align:'middle',verticalAlign:'middle',labelColor:'red',growY:0,fontSizeAdjustment:1,url:'',scale:1,textLastEditedBy:null}:{color:'red',size:'m',w:300,font:'draw',textAlign:'start',autoSize:true,scale:1,richText:richText(body.text)}}
 if(targetPage)shape.parentId=targetPage.id
 await room.updateStore(s=>s.put(shape))
 return {id:shape.id,shape:room.getRecord(shape.id)}
})
app.delete('/bot/:room/feedback/:id',async(req,reply)=>{
 const p=req.params as any,room=await initializedRoom(p.room),shape=room.getRecord(p.id)
 if(!shape) return reply.code(404).send({error:'Not found'})
 if(shape.meta?.author!=='bot') return reply.code(403).send({error:'Not bot feedback'})
 await room.updateStore(s=>s.delete(p.id));return {deleted:p.id}
})
await app.register(async uploads=>{
 uploads.addContentTypeParser('*',{parseAs:'buffer'},(_req,body,done)=>done(null,body))
 uploads.put('/uploads/:id',async(req,reply)=>{
  const id=(req.params as any).id
  if(!/^[\w. -]{1,250}$/.test(id)) return reply.code(400).send({error:'Invalid asset id'})
  writeFileSync(resolve(root,'data/assets',id),req.body as Buffer)
  return {ok:true}
 })
 uploads.get('/uploads/:id',async(req,reply)=>{
  const id=(req.params as any).id
  if(!/^[\w. -]{1,250}$/.test(id)) return reply.code(400).send()
  try{return reply.header('Content-Security-Policy',"default-src 'none'").header('X-Content-Type-Options','nosniff').type('application/octet-stream').send(readFileSync(resolve(root,'data/assets',id)))}catch{return reply.code(404).send()}
 })
})
await app.register(staticPlugin,{root:resolve(root,'dist/client'),wildcard:false})
app.get('/r/:room',async(_req,reply)=>reply.sendFile('index.html'))
app.addHook('onClose',async()=>{for(const {room,db} of rooms.values()){room.close();db.close()}})
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>void app.close().then(()=>process.exit(0)))
await app.listen({host:'127.0.0.1',port:5858})
