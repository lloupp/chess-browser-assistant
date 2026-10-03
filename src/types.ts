export type Color = 'w' | 'b';
export type Orientation = 'white' | 'black';
export interface Settings { enabled: boolean; overlay: boolean; evaluation: boolean; depth: number; side: Color }
export const defaults: Settings = {enabled:true, overlay:true, evaluation:true, depth:12, side:'w'};
export function readSettings(value:unknown):Settings {
  const v=(value && typeof value==='object'?value:{}) as Partial<Settings>;
  return {enabled:typeof v.enabled==='boolean'?v.enabled:defaults.enabled,overlay:typeof v.overlay==='boolean'?v.overlay:defaults.overlay,evaluation:typeof v.evaluation==='boolean'?v.evaluation:defaults.evaluation,depth:[8,12,18].includes(v.depth!)?v.depth!:12,side:v.side==='b'?'b':'w'};
}
export interface Result { bestmove:string; ponder?:string; depth:number; score?:{type:'cp'|'mate'; value:number} }
export interface Status { message:string; fen?:string; ready?:boolean; result?:Result }
export type Request = {target:'background'|'offscreen'; action:'analyze'|'cancel'; fen?:string; depth?:number; owner?:number; token?:number};
