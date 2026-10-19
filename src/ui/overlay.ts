import type { BoardAdapter } from '../board/adapter';
import { parseMove } from '../chess/position';
import type { Result } from '../types';
export class Overlay {
  private host:HTMLDivElement;
  private root:ShadowRoot;
  private resize:ResizeObserver;
  private result?:Result;
  private evaluation=false;
  constructor(private adapter:BoardAdapter) {
    this.host=document.createElement('div');this.host.id='cba-overlay';
    this.host.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483646;contain:strict';
    this.root=this.host.attachShadow({mode:'open'});document.documentElement.append(this.host);
    this.resize=new ResizeObserver(()=>this.render());this.resize.observe(adapter.element);
    window.addEventListener('scroll',this.reposition,true);window.addEventListener('resize',this.reposition);
  }
  private reposition=()=>this.render();
  clear() {this.result=undefined;this.root.replaceChildren();}
  show(result:Result,evaluation:boolean) {this.result=result;this.evaluation=evaluation;this.render();}
  private render() {
    this.root.replaceChildren();if(!this.result || ['(none)','0000'].includes(this.result.bestmove)) return;
    const move=parseMove(this.result.bestmove),a=this.adapter.squareToScreen(move.from),b=this.adapter.squareToScreen(move.to);
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('width','100%');svg.setAttribute('height','100%');svg.style.pointerEvents='none';
    for (const [square,p] of [[move.from,a],[move.to,b]] as const) {
      const rect=document.createElementNS(ns,'rect');rect.dataset.square=square;
      rect.setAttribute('x',String(p.x-p.size/2));rect.setAttribute('y',String(p.y-p.size/2));rect.setAttribute('width',String(p.size));rect.setAttribute('height',String(p.size));rect.setAttribute('fill','#17c78b55');svg.append(rect);
    }
    const line=document.createElementNS(ns,'line');
    for(const [key,value] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#00a86b','stroke-width':Math.max(4,a.size/10)})) line.setAttribute(key,String(value));
    svg.append(line);
    const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy),size=a.size*.25;
    const arrow=document.createElementNS(ns,'polygon');arrow.setAttribute('points',`${b.x},${b.y} ${b.x-dx/len*size-dy/len*size/2},${b.y-dy/len*size+dx/len*size/2} ${b.x-dx/len*size+dy/len*size/2},${b.y-dy/len*size-dx/len*size/2}`);arrow.setAttribute('fill','#00a86b');svg.append(arrow);
    const label=document.createElement('span'),board=this.adapter.element.getBoundingClientRect();
    label.style.cssText=`position:fixed;left:${board.left}px;top:${Math.max(0,board.top)}px;background:#122b25;color:white;font:13px system-ui;padding:4px 8px;border-radius:4px;pointer-events:none`;
    const s=this.result.score;
    label.textContent=`${move.from} → ${move.to}${move.promotion?' = '+move.promotion.toUpperCase():''} · d${this.result.depth}${this.evaluation && s ? ' · '+(s.type==='mate'?'M'+s.value:(s.value/100).toFixed(2)):''}`;
    this.root.append(svg,label);
  }
  destroy() {this.resize.disconnect();window.removeEventListener('scroll',this.reposition,true);window.removeEventListener('resize',this.reposition);this.host.remove();}
}
