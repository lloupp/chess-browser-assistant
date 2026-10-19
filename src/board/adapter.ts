import type { Orientation } from '../types';
import { FairPlayGuard } from '../guard';
export interface Snapshot { placement:string; exactFen?:string }
export interface BoardAdapter {
  element:HTMLElement;
  readPosition():Snapshot;
  getOrientation():Orientation;
  squareToScreen(square:string):{x:number;y:number;size:number};
  observeChanges(callback:()=>void):()=>void;
  isAllowedContext():boolean;
}
export function coordinate(square:string, rect:{left:number;top:number;width:number;height:number}, orientation:Orientation) {
  if (!/^[a-h][1-8]$/.test(square) || rect.width<=0 || rect.height<=0 || Math.abs(rect.width-rect.height)>2) throw new Error('Geometria inválida');
  const file=square.charCodeAt(0)-97, rank=Number(square[1])-1;
  const x=orientation==='white'?file:7-file, y=orientation==='white'?7-rank:rank;
  return {x:rect.left+(x+.5)*rect.width/8,y:rect.top+(y+.5)*rect.height/8,size:rect.width/8};
}
export class DomAdapter implements BoardAdapter {
  constructor(public element:HTMLElement, private local:boolean, private doc:Document=document) {}
  static detect(doc:Document=document):DomAdapter|undefined {
    const local=doc.querySelector<HTMLElement>('[data-cba-local="training"]');
    const board=local ?? doc.querySelector<HTMLElement>('wc-chess-board, chess-board, .chessboard');
    return board ? new DomAdapter(board,Boolean(local),doc) : undefined;
  }
  isAllowedContext() { return FairPlayGuard.check(this.doc.location.href,this.doc).allowed; }
  getOrientation():Orientation { return this.element.classList.contains('flipped') || this.element.dataset.orientation==='black' ? 'black':'white'; }
  readPosition():Snapshot {
    const grid=Array.from({length:8},()=>Array<string>(8).fill(''));
    const root=this.element.shadowRoot ?? this.element;
    const pieces=root.querySelectorAll<HTMLElement>('.piece');
    if (!pieces.length) throw new Error('Peças não encontradas no DOM suportado');
    for (const el of pieces) {
      // Animated transient pieces must settle before any analysis.
      const code=[...el.classList].find(c=>/^[wb][kqrbnp]$/.test(c));
      const sq=[...el.classList].find(c=>/^square-[1-8][1-8]$/.test(c));
      if (!code || !sq) throw new Error('Peça sem código/casa reconhecível');
      const file=Number(sq[7])-1, rank=8-Number(sq[8]);
      if (grid[rank][file]) throw new Error('Duas peças na mesma casa');
      grid[rank][file]=code[0]==='w'?code[1].toUpperCase():code[1];
    }
    const placement=grid.map(row=>{
      let text='',empty=0;
      for (const piece of row) { if (!piece) empty++; else {if (empty) text+=empty; empty=0;text+=piece;} }
      return text+(empty||'');
    }).join('/');
    // Only our explicitly supported local board defines a trusted complete-FEN attribute.
    return {placement,...(this.local && this.element.dataset.fen ? {exactFen:this.element.dataset.fen}:{})};
  }
  squareToScreen(square:string) {return coordinate(square,this.element.getBoundingClientRect(),this.getOrientation());}
  observeChanges(callback:()=>void) {
    const observer=new MutationObserver(callback);
    observer.observe(this.element.shadowRoot ?? this.element,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-fen','data-orientation']});
    return ()=>observer.disconnect();
  }
}
