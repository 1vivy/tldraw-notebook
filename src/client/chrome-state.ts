export type ChromeState = { hidden: boolean; pen: boolean; blocked: boolean; deadline: number | null; hideAt: number | null; revealAt: number | null }
export const initialChrome: ChromeState = { hidden:false, pen:false, blocked:false, deadline:null, hideAt:null, revealAt:null }
export type ChromeEvent = { type:'down'|'up'|'show'|'tick'; now:number } | { type:'block'; now:number; blocked:boolean }
export function chromeReducer(state: ChromeState, event: ChromeEvent): ChromeState {
  const s = {...state}
  switch(event.type) {
    case 'block': s.blocked=event.blocked; if(s.blocked) {s.hidden=false;s.hideAt=null;s.revealAt=null} else if(s.pen) s.hideAt=event.now+700; break
    case 'down': s.pen=true;s.revealAt=null;if(!s.blocked&&!s.hidden&&s.hideAt===null)s.hideAt=event.now+700;break
    case 'up': s.pen=false;if(!s.blocked)s.revealAt=event.now+600;break
    case 'show': s.hidden=false;s.hideAt=s.pen&&!s.blocked?event.now+700:null;s.revealAt=null;break
    case 'tick':
      if(!s.blocked) {
        if(s.revealAt!==null&&event.now>=s.revealAt) {s.hidden=false;s.hideAt=null;s.revealAt=null}
        else if(s.hideAt!==null&&event.now>=s.hideAt) {s.hidden=true;s.hideAt=null}
      }
  }
  const deadlines=[s.hideAt,s.revealAt].filter((n):n is number=>n!==null)
  s.deadline=s.blocked||!deadlines.length?null:Math.min(...deadlines)
  return s
}
