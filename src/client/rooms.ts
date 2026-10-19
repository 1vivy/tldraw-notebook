export interface NotebookRoom {
  id: string
  label: string
  detail?: string
  color?: string
}
const defaults: NotebookRoom[] = [{id:'notebook',label:'Notebook'}, {id:'scratch',label:'Scratch'}]

/** Build-time index configuration; not a server access-control list. */
export function parseRooms(value?: string): NotebookRoom[] {
  if (!value?.trim()) return defaults.map(room => ({...room}))
  let entries: unknown
  try {
    entries = value.trim().startsWith('[') ? JSON.parse(value) : value.split(',').map(id => ({id:id.trim(),label:id.trim()}))
  } catch {
    throw new Error('NOTEBOOK_ROOMS must be a JSON array or comma-separated room IDs')
  }
  if (!Array.isArray(entries) || !entries.length) throw new Error('NOTEBOOK_ROOMS must contain at least one room')
  const ids = new Set<string>()
  return entries.map(entry => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid room configuration')
    const {id,label,detail,color} = entry as NotebookRoom
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(id) || ids.has(id) || typeof label !== 'string' || !label.trim() || (detail !== undefined && typeof detail !== 'string') || (color !== undefined && typeof color !== 'string')) throw new Error('Invalid or duplicate room configuration')
    ids.add(id)
    return {id,label,...(detail !== undefined ? {detail} : {}),...(color !== undefined ? {color} : {})}
  })
}
