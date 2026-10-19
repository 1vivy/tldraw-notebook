import { useEffect, useId, useRef, useState, useReducer } from 'react'
import { cameraOptions, installNotebookCamera } from './camera'
import { chromeReducer, initialChrome } from './chrome-state'
import { useSync } from '@tldraw/sync'
import { createPortal } from 'react-dom'
import {
  Tldraw, uniqueId, useEditor, useValue, DefaultColorStyle, DefaultSizeStyle,
  DefaultFontStyle, DefaultDashStyle, PageRecordType,
  type TLAssetStore, type TLComponents, type Editor,
} from 'tldraw'
import { PAGE_W, PAGE_H, PAGE_GAP, RULE, MARGIN_X, sheetTop } from '../shared/geometry'
import { templates, templateFromMeta, sheetCount, resolveToday, localDate, datedMeta } from './notebook'
import { NotebookLassoTool, installInteractions } from './interaction'

import { parseRooms, type NotebookRoom } from './rooms'

const rooms = parseRooms(import.meta.env.VITE_NOTEBOOK_ROOMS)
const assets: TLAssetStore = {
  async upload(_asset, file) {
    const src = `/uploads/${encodeURIComponent(`${uniqueId()}-${file.name}`)}`
    const response = await fetch(src, { method: 'PUT', body: file,
      headers: { 'Content-Type': file.type || 'application/octet-stream' } })
    if (!response.ok) throw new Error(`Asset upload failed (${response.status})`)
    return { src }
  },
  resolve(asset) { return asset.props.src },
}
function currentSheets(editor: Editor) {
  let bottom = 0
  for (const shape of editor.getCurrentPageShapesSorted()) {
    const bounds = editor.getShapePageBounds(shape)
    if (bounds) bottom = Math.max(bottom, bounds.maxY)
  }
  return sheetCount(bottom)
}
function NotebookBackground() {
  const editor = useEditor()
  const camera = useValue('camera', () => editor.getCamera(), [editor])
  const count = useValue('sheets', () => currentSheets(editor), [editor])
  const template = useValue('paper', () => templateFromMeta(editor.getCurrentPage().meta), [editor])
  const id = useId().replace(/:/g, '')
  return <svg className="notebook-paper" aria-hidden="true" width="100%" height="100%">
    <defs>
      <pattern id={`${id}-ruled`} width={PAGE_W} height={RULE} patternUnits="userSpaceOnUse"><path d={`M0 ${RULE}H${PAGE_W}`} stroke="#bbd1df" fill="none" strokeWidth={.7}/></pattern>
      <pattern id={`${id}-grid`} width={RULE/2} height={RULE/2} patternUnits="userSpaceOnUse"><path d={`M${RULE/2} 0H0V${RULE/2}`} stroke="#c8d8df" fill="none" strokeWidth={.65}/></pattern>
      <pattern id={`${id}-dot`} width={RULE/2} height={RULE/2} patternUnits="userSpaceOnUse"><circle cx={RULE/4} cy={RULE/4} r={.9} fill="#b7c5cf"/></pattern>
    </defs>
    <rect width="100%" height="100%" fill="#e5e6e3"/>
    <g transform={`scale(${camera.z}) translate(${camera.x} ${camera.y})`}>
      {Array.from({ length: count }, (_, n) => <g key={n} transform={`translate(0 ${sheetTop(n)})`}>
        <rect width={PAGE_W} height={PAGE_H} rx="2" fill="#fffef9"/>
        {template !== 'blank' && <rect width={PAGE_W} height={PAGE_H} fill={`url(#${id}-${template})`}/>}
        {template === 'ruled' && <path d={`M${MARGIN_X} 0V${PAGE_H}`} stroke="#dba4a1" strokeWidth="1"/>}
        <text x={PAGE_W-22} y={PAGE_H-12} textAnchor="end" fontSize="10" fill="#9ba29b">{n+1}</text>
      </g>)}
    </g>
  </svg>
}
const colors = [ ['black','#25272b'], ['blue','#4465ad'], ['grey','#697174'], ['red','#c45252'], ['green','#4c8663'], ['violet','#9164b0'] ] as const
const sizes = ['s','m','l'] as const
const favorites = [ {color:'black',size:'s',dash:'draw',label:'Black fine'}, {color:'blue',size:'m',dash:'draw',label:'Blue medium'}, {color:'grey',size:'s',dash:'draw',label:'Graphite pencil'} ] as const
function PageThumbnail({id, template}: {id: import('tldraw').TLPageId; template: string}) {
  const editor = useEditor()
  const [src,setSrc] = useState('')
  const shapes = useValue('thumbnail shapes', () => editor.getSortedChildIdsForParent(id).map(id => editor.getShape(id)!).filter(Boolean), [editor,id])
  useEffect(() => {
    let alive = true
    const timer = setTimeout(() => {
      if (!shapes.length) {setSrc('');return}
      void editor.getSvgString(shapes, {background:false, padding:16}).then(result => {
        if(alive && result)setSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svg)}`)
      }).catch(() => {if(alive)setSrc('')})
    }, 300)
    return () => {alive=false;clearTimeout(timer)}
  }, [editor,shapes])
  return <span className={`paper-sample ${template}`}>{src && <img src={src} alt=""/>}</span>
}
function NotebookControls() {
  const editor = useEditor()
  const [panel, setPanel] = useState('')
  const [chrome, dispatchChrome] = useReducer(chromeReducer, initialChrome)
  const [edge, setEdge] = useState(() => {
    try { return localStorage.getItem('notebook-toolbar-edge') || 'auto' } catch { return 'auto' }
  })
  const [fingerDraws, setFingerDraws] = useState(() => {
    try { return localStorage.getItem('notebook-finger-draws') === 'true' } catch { return false }
  })
  useEffect(() => {
    editor.updateInstanceState({isPenMode: !fingerDraws})
    try { localStorage.setItem('notebook-finger-draws', String(fingerDraws)) } catch { /* storage disabled */ }
  }, [editor, fingerDraws])
  useEffect(() => {
    if (chrome.deadline === null) return
    const timer = setTimeout(() => dispatchChrome({type:'tick', now:performance.now()}), Math.max(1,Math.ceil(chrome.deadline-performance.now())+1))
    return () => clearTimeout(timer)
  }, [chrome.deadline])
  useEffect(() => {
    const container = editor.getContainer()
    const down = (e: PointerEvent) => {
      if(e.pointerType === 'pen' && ['draw','highlight'].includes(editor.getCurrentToolId())) dispatchChrome({type:'down',now:performance.now()})
    }
    const up = (e: PointerEvent) => { if(e.pointerType === 'pen') dispatchChrome({type:'up',now:performance.now()}) }
    container.addEventListener('pointerdown',down,true)
    window.addEventListener('pointerup',up,true); window.addEventListener('pointercancel',up,true)
    return () => {container.removeEventListener('pointerdown',down,true);window.removeEventListener('pointerup',up,true);window.removeEventListener('pointercancel',up,true)}
  }, [editor])
  function dock(e: React.PointerEvent<HTMLButtonElement>) {
    const distances = {left:e.clientX, right:innerWidth-e.clientX, top:e.clientY, bottom:innerHeight-e.clientY}
    e.currentTarget.parentElement!.style.translate = ''
    const next = Object.entries(distances).sort((a,b)=>a[1]-b[1])[0][0]
    setEdge(next)
    try { localStorage.setItem('notebook-toolbar-edge',next) } catch { /* storage disabled */ }
  }
  const [favorite, setFavorite] = useState(0)
  const [fingerErase, setFingerErase] = useState(false)
  const [scribbleErase, setScribbleErase] = useState(false)
  const [error, setError] = useState('')
  const file = useRef<HTMLInputElement>(null)
  const options = useRef({fingerErase, scribbleErase, fingerDraws, reveal: () => dispatchChrome({type:'show',now:performance.now()})})
  options.current = {fingerErase, scribbleErase, fingerDraws, reveal: () => dispatchChrome({type:'show',now:performance.now()})}
  const tool = useValue('tool', () => editor.getCurrentToolId(), [editor])
  const pages = useValue('pages', () => editor.getPages(), [editor])
  const page = useValue('page', () => editor.getCurrentPage(), [editor])
  useEffect(() => { editor.updateInstanceState({isPenMode:!fingerDraws}) }, [editor,page.id,fingerDraws])
  const undo = useValue('undo', () => editor.canUndo(), [editor])
  const redo = useValue('redo', () => editor.canRedo(), [editor])
  const selected = useValue('selection', () => editor.getSelectedShapeIds(), [editor])
  useEffect(() => { dispatchChrome({type:'block', now:performance.now(), blocked:!!panel || selected.length > 0}) }, [panel, selected.length])
  const read = useValue('last read', () => editor.getDocumentSettings().meta.lastBotRead, [editor])
  const activity = useValue('activity', () => Math.max(0, ...editor.getCurrentPageShapesSorted().map(s => {
    const value = s.meta.updatedAt ?? s.meta.createdAt
    return typeof value === 'number' ? value : typeof value === 'string' ? Date.parse(value) || 0 : 0
  })), [editor])
  const [now, setNow] = useState(Date.now())
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(timer) }, [])
  useEffect(() => installInteractions(editor, () => options.current), [editor])
  useEffect(() => {
    const create = editor.sideEffects.registerBeforeCreateHandler('shape', (shape, source) => {
      if (source !== 'user') return shape
      const { author: _author, ...meta } = shape.meta
      return {...shape, meta:{...meta, updatedAt:Date.now()}}
    })
    const change = editor.sideEffects.registerBeforeChangeHandler('shape', (_previous, shape, source) => {
      if (source !== 'user' || shape.meta.author === 'bot') return shape
      const { author: _author, ...meta } = shape.meta
      return {...shape, meta:{...meta, updatedAt:Date.now()}}
    })
    return () => {create();change()}
  }, [editor])
  useEffect(() => installNotebookCamera(editor), [editor])
  useEffect(() => {
    if (new URLSearchParams(location.search).get('page') === 'today') {
      const target = resolveToday(editor.getPages())
      if (target) editor.setCurrentPage(target.id)
    }
  }, [editor])
  useEffect(() => editor.sideEffects.registerAfterCreateHandler('shape', (shape, source) => {
    if (source === 'remote' && shape.meta.author === 'bot') {
      requestAnimationFrame(() => {
        const node = editor.getContainer().querySelector(`[data-shape-id="${shape.id}"]`)
        node?.animate([{opacity:0},{opacity:1}], {duration:600,easing:'ease-out'})
      })
    }
  }), [editor])
  const toggle = (name: string) => setPanel(p => p === name ? '' : name)
  function pen(i = favorite) {
    setFavorite(i); editor.setCurrentTool('draw')
    const f = favorites[i]
    editor.setStyleForNextShapes(DefaultColorStyle, f.color)
    editor.setStyleForNextShapes(DefaultSizeStyle, f.size)
    editor.setStyleForNextShapes(DefaultDashStyle, f.dash)
  }
  function addPage(dated: boolean) {
    const id = PageRecordType.createId()
    editor.createPage({id, name:dated ? `${localDate()} Dated` : 'Untitled notes',
      meta:dated ? datedMeta() : {kind:'notes',template:'ruled',createdBy:'user'}})
    editor.setCurrentPage(id); setPanel('pages')
  }
  function fit() {
    editor.setCamera({x:0,y:editor.getCamera().y,z:editor.getBaseZoom()}, {reset:true})
  }
  const readTime = typeof read === 'number' ? read : typeof read === 'string' ? Date.parse(read) : 0
  const reading = now - readTime < 60000 && now >= readTime
  return createPortal(<>
    <div className={`page-status ${chrome.hidden ? 'chrome-hidden' : ''}`} data-notebook-ui role="status"><strong>{page.name}</strong><span>{activity ? `Last activity ${new Date(activity).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}` : 'Ready for your first stroke'}</span>{reading && <span className="bot-active"><i/>Bot active</span>}</div>
    <button className="pages-tab" data-notebook-ui aria-label="Open pages" aria-expanded={panel==='pages'} onClick={() => toggle('pages')}>▤</button>
    {chrome.hidden && <button className={`toolbar-indicator dock-${edge}`} data-notebook-ui aria-label="Show toolbar" onClick={() => dispatchChrome({type:'show',now:performance.now()})}><i/></button>}
    <div className={`notebook-tools dock-${edge} ${chrome.hidden ? 'chrome-hidden' : ''}`} inert={chrome.hidden} data-notebook-ui role="toolbar" aria-label="Notebook tools" onPointerDown={e => {editor.markEventAsHandled(e);e.stopPropagation()}}>
      <button className="toolbar-handle" aria-label="Drag toolbar to an edge" onPointerDown={e => {e.currentTarget.dataset.startX=String(e.clientX);e.currentTarget.dataset.startY=String(e.clientY);e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e => {if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.parentElement!.style.translate=`${e.clientX-Number(e.currentTarget.dataset.startX)}px ${e.clientY-Number(e.currentTarget.dataset.startY)}px`}} onPointerUp={dock} onPointerCancel={e => {e.currentTarget.parentElement!.style.translate=''}}>⠿</button>
      <button aria-label="Pen options" aria-pressed={tool==='draw'} onClick={() => {pen();toggle('pen')}}><b>✎</b><span>Pen</span></button>
      <div className="favorites">{favorites.map((f,i) => <button key={f.label} className="favorite" aria-label={f.label} aria-pressed={tool==='draw'&&favorite===i} onClick={() => {pen(i);setPanel('')}}><i style={{background:colors.find(c=>c[0]===f.color)![1]}}/></button>)}</div>
      <button aria-label="Highlight" aria-pressed={tool==='highlight'} onClick={() => {editor.setCurrentTool('highlight');editor.setStyleForNextShapes(DefaultColorStyle,'yellow');editor.setStyleForNextShapes(DefaultSizeStyle,'m');toggle('highlight')}}><b>▰</b><span>Highlight</span></button>
      <button aria-label="Eraser" aria-pressed={tool==='eraser'} onClick={() => {editor.setCurrentTool('eraser');toggle('eraser')}}><b>▱</b><span>Eraser</span></button>
      <button aria-label="Lasso" aria-pressed={tool==='notebook-lasso'||tool==='select'} onClick={() => {editor.setCurrentTool('notebook-lasso');setPanel('')}}><b>◌</b><span>Lasso</span></button>
      <button disabled={!undo} aria-label="Undo" onClick={() => editor.undo()}><b>↶</b><span>Undo</span></button>
      <button disabled={!redo} aria-label="Redo" onClick={() => editor.redo()}><b>↷</b><span>Redo</span></button>
      <button aria-label="Fit width" onClick={fit}><b>↔</b><span>Fit width</span></button>
      <button aria-label="Pages" aria-expanded={panel==='pages'} onClick={() => toggle('pages')}><b>▤</b><span>Pages</span></button>
      <button aria-label="Paper" aria-expanded={panel==='paper'} onClick={() => toggle('paper')}><b>▦</b><span>Paper</span></button>
      <button aria-label="Image" onClick={() => file.current?.click()}><b>▧</b><span>Image</span></button>
      <button aria-label="Text" aria-pressed={tool==='text'} onClick={() => {editor.setStyleForNextShapes(DefaultFontStyle,'sans');editor.setStyleForNextShapes(DefaultSizeStyle,'m');editor.setCurrentTool('text');setPanel('')}}><b>T</b><span>Text</span></button>
    </div>
    {(panel || selected.length > 0) && <aside className={`tool-popover ${panel==='pages'?'page-strip':''}`} data-notebook-ui onPointerDown={e => {editor.markEventAsHandled(e);e.stopPropagation()}} aria-label="Tool options">
      <div className="popover-heading"><strong>{panel ? {pen:'Pen · pressure sensitive',highlight:'Highlighter',eraser:'Stroke eraser',pages:'Notebook sections',paper:'Paper template'}[panel] : 'Selection colour'}</strong><button aria-label="Close options" onClick={() => {setPanel('');editor.selectNone()}}>×</button></div>
      {(panel==='pen'||(!panel&&selected.length>0)) && <div className="swatches">{colors.map(([color,hex]) => <button key={color} aria-label={`${color} ink`} onClick={() => {editor.setStyleForNextShapes(DefaultColorStyle,color);if(selected.length)editor.setStyleForSelectedShapes(DefaultColorStyle,color)}}><i style={{background:hex}}/></button>)}{sizes.map((s,i) => <button key={s} aria-label={`${s} stroke width`} onClick={() => editor.setStyleForNextShapes(DefaultSizeStyle,s)}><i style={{background:'#303b39',width:3+i*3,height:3+i*3}}/></button>)}</div>}
      {panel==='pen' && <button aria-pressed={fingerDraws} onClick={() => setFingerDraws(v=>!v)}>Finger draws: {fingerDraws ? 'on' : 'off'}</button>}
      {panel==='highlight' && <div className="swatches">{(['yellow','green','light-red'] as const).map((c,i) => <button key={c} aria-label={['Yellow','Green','Pink'][i]} onClick={() => editor.setStyleForNextShapes(DefaultColorStyle,c)}><i style={{background:['#f3de62','#9dd394','#efa7bc'][i]}}/></button>)}</div>}
      {panel==='eraser' && <div className="eraser-options"><span className="eraser-ring" aria-hidden="true"/><label><input type="checkbox" checked={scribbleErase} onChange={e => setScribbleErase(e.target.checked)}/>Scribble to erase (pen)</label><label><input type="checkbox" checked={fingerErase} onChange={e => setFingerErase(e.target.checked)}/>Finger erases instead of pans</label></div>}
      {panel==='paper' && <div className="paper-options">{templates.map(t => <button key={t} aria-pressed={templateFromMeta(page.meta)===t} onClick={() => editor.updatePage({id:page.id,meta:{...page.meta,template:t}})}><span className={`paper-sample ${t}`}/>{t}</button>)}</div>}
      {panel==='pages' && <><div className="page-list">{pages.map(p => <div className="page-entry" key={p.id}><button className="page-link" aria-pressed={page.id===p.id} onClick={() => editor.setCurrentPage(p.id)}><PageThumbnail id={p.id} template={templateFromMeta(p.meta)}/><span>{p.name}<small>{p.meta.kind === 'dated' ? String(p.meta.date??'Dated') : 'Notes'}</small></span></button><button aria-label={`Rename ${p.name}`} onClick={() => {const name = window.prompt('Section name',p.name);if(name?.trim())editor.updatePage({id:p.id,name:name.trim()})}}>✎</button></div>)}</div><div className="page-actions"><button onClick={() => addPage(false)}>+ Notes page</button><button onClick={() => addPage(true)}>+ Dated page</button></div></>}
    </aside>}
    <input ref={file} hidden type="file" accept="image/*" multiple onChange={async e => {try {if(e.target.files?.length)await editor.putExternalContent({type:'files',files:Array.from(e.target.files),point:editor.getViewportPageBounds().center})}catch(err){setError(String(err))}e.target.value=''}}/>
    {error && <div className="upload-error" data-notebook-ui role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
  </>, editor.getContainer().parentElement!)
}
const components: TLComponents = { Background: NotebookBackground }
const tools = [NotebookLassoTool]
function Notebook({ room }: { room: NotebookRoom }) {
  const uri = new URL(`/connect/${encodeURIComponent(room.id)}`, window.location.origin)
  uri.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const store = useSync({uri:uri.toString(), assets})
  return <main className="notebook-shell"><header className="notebook-header"><a href="/">← Notebooks</a><h1>{room.label}</h1><span className={`connection-status ${store.status==='error'?'connection-error':''}`} role="status">{store.status==='synced-remote' ? store.connectionStatus==='online'?'Connected':'Reconnecting…' : store.status==='error'?'Connection failed — reload to retry':'Connecting…'}</span></header>
    <div className="notebook-canvas"><Tldraw store={store} hideUi initialState="draw" components={components} tools={tools} cameraOptions={cameraOptions} licenseKey={import.meta.env.VITE_TLDRAW_LICENSE_KEY} onMount={editor => {editor.updateInstanceState({isPenMode:true});editor.user.updateUserPreferences({colorScheme:'light'});editor.setStyleForNextShapes(DefaultColorStyle,'black');editor.setStyleForNextShapes(DefaultSizeStyle,'s');editor.setStyleForNextShapes(DefaultFontStyle,'sans');editor.setCurrentTool('draw')}}><NotebookControls/></Tldraw></div>
    <footer className="notebook-hint">Pencil to write · Finger to pan · Pinch to zoom</footer></main>
}
export default function App() {
  const path = window.location.pathname.replace(/\/$/,'')||'/'
  const roomId = /^\/r\/([a-zA-Z0-9_-]{1,80})$/.exec(path)?.[1]
  const room = roomId ? rooms.find(r => r.id === roomId) ?? {id:roomId,label:roomId} : undefined
  if(room)return <Notebook key={room.id} room={room}/>
  if(path!=='/')return <main className="room-index"><h1>Notebook not found</h1><a href="/">Back to notebooks</a></main>
  return <main className="room-index"><p className="eyebrow">A place for your thinking</p><h1>Notebooks<span>.</span></h1><p className="index-description">Pick a notebook, grab your pencil, and make room for an idea.</p><nav className="room-list" aria-label="Notebooks">{rooms.map((r,i) => <div className="room-card" key={r.id}><a href={`/r/${r.id}`} className="room-main"><span className="room-number" style={{color:r.color}}>0{i+1}</span><span><strong>{r.label}</strong><small>{r.detail}</small></span></a><a className="today-link" href={`/r/${r.id}?page=today`}>Today's page ↗</a></div>)}</nav><p className="index-footnote">Activity appears inside each notebook. Your pages sync while connected.</p></main>
}
