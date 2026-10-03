export interface Context { allowed:boolean; kind:'computer'|'analysis'|'local'|'blocked' }
export function allowedRoute(url:string):boolean {
  try {
    const u=new URL(url);
    return (u.origin==='http://127.0.0.1:8787' && u.pathname==='/chess-board.html') || (u.protocol==='https:' && u.hostname==='www.chess.com' && (/^\/play\/computer\/?$/.test(u.pathname) || /^\/analysis(?:\/|$)/.test(u.pathname)));
  } catch {return false;}
}
export class FairPlayGuard {
  static check(url: string, doc: Document): Context {
    const u = new URL(url);
    if (u.origin === 'http://127.0.0.1:8787' && u.pathname === '/chess-board.html' && doc.querySelector('[data-cba-local="training"]')) return {allowed:true,kind:'local'};
    if (u.protocol !== 'https:' || u.hostname !== 'www.chess.com') return {allowed:false,kind:'blocked'};
    // Exact route allowlist; unknown routes fail closed. Human-game evidence wins.
    if (doc.querySelector('[data-game-type="live"], [data-game-type="human"], .live-game, #live-game')) return {allowed:false,kind:'blocked'};
    if (/^\/play\/computer\/?$/.test(u.pathname)) return {allowed:true,kind:'computer'};
    if (/^\/analysis(?:\/|$)/.test(u.pathname)) return {allowed:true,kind:'analysis'};
    return {allowed:false,kind:'blocked'};
  }
}
