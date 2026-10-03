// @vitest-environment node
import {it,expect} from 'vitest';
import {JSDOM} from 'jsdom';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Chess,DEFAULT_POSITION} from 'chess.js';
// The browser E2E remains separate. This exercises built content/background/offscreen
// message routing with real Stockfish; DOM and extension APIs are simulated.
it('built extension routes full position through offscreen to real Stockfish and overlay',async()=>{
  const url='http://127.0.0.1:8787/chess-board.html',extension='chrome-extension://testid/';
  const dom=new JSDOM('<div id="board" data-cba-local="training"></div>',{url,runScripts:'outside-only',pretendToBeVisual:true});
  const offscreen=new JSDOM('',{url:extension+'offscreen.html',runScripts:'outside-only'});
  const background=new JSDOM('',{url:extension+'background.js',runScripts:'outside-only'});
  type Listener=(m:Record<string,unknown>,s:object,r:(value:unknown)=>void)=>boolean|void;
  const listeners={content:[] as Listener[],background:[] as Listener[],offscreen:[] as Listener[]};
  function dispatch(target:keyof typeof listeners,message:Record<string,unknown>,sender:object):Promise<unknown>{return new Promise((resolve,reject)=>{
    const deliver=()=>{
      let answered=false;for(const fn of listeners[target])if(fn(message,sender,result=>{answered=true;resolve(result);})===true)answered=true;
      if(!answered)reject(new Error('No listener'));
    };
    // Deliberately deliver cancellation after the newer analysis request.
    if(target==='offscreen' && message.action==='cancel')setTimeout(deliver,80);else deliver();
  });}
  const errors:string[]=[],processes:ReturnType<typeof spawn>[]=[];let workers=0;
  const changes:Array<(changes:object,area:string)=>void>=[];
  const board=dom.window.document.getElementById('board')!;
  board.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:400,bottom:400,width:400,height:400,toJSON(){return {};}});
  function render(fen:string){
    const c=new Chess(fen);board.replaceChildren();
    for(const piece of c.board().flat())if(piece){const p=dom.window.document.createElement('div');p.className=`piece ${piece.color}${piece.type} square-${piece.square.charCodeAt(0)-96}${piece.square[1]}`;board.append(p);}
    board.setAttribute('data-fen',c.fen());
  }
  for(const [name,env] of Object.entries({content:dom,background,offscreen}) as Array<[keyof typeof listeners,JSDOM]>){
    const sender=name==='content'?{id:'testid',url,tab:{id:1}}:{id:'testid',url:extension+name+'.html'};
    Object.assign(env.window,{chrome:{runtime:{id:'testid',getURL:(p:string)=>extension+p,onMessage:{addListener:(fn:Listener)=>listeners[name].push(fn)},sendMessage:(m:Record<string,unknown>)=>dispatch(m.target as keyof typeof listeners,m,sender)},storage:{local:{get:async()=>({}),set:async(value:object)=>changes.forEach(fn=>fn({settings:{newValue:(value as {settings:unknown}).settings}},'local'))},onChanged:{addListener:(fn:typeof changes[number])=>changes.push(fn)}},tabs:{onRemoved:{addListener:()=>{}}},offscreen:{hasDocument:async()=>true}},ResizeObserver:class{observe(){}disconnect(){}}});
    env.window.addEventListener('error',e=>errors.push(e.message));
  }
  Object.assign(offscreen.window,{Worker:class{
    onmessage?:(e:{data:string})=>void;onerror?:()=>void;
    child=spawn(process.execPath,['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
    lines=createInterface({input:this.child.stdout});
    constructor(){workers++;processes.push(this.child);this.lines.on('line',line=>this.onmessage?.({data:line}));this.child.on('error',()=>this.onerror?.());}
    postMessage(c:string){this.child.stdin.write(c+'\n');}
    terminate(){this.lines.close();this.child.kill();}
  }});
  try {
    render(DEFAULT_POSITION);
    background.window.eval(await readFile('dist/background.js','utf8'));offscreen.window.eval(await readFile('dist/offscreen.js','utf8'));dom.window.eval(await readFile('dist/content.js','utf8'));
    const get=async()=>await dispatch('content',{action:'status'},{}) as {status:{message:string;fen:string;result:{bestmove:string}}};
    await expect.poll(async()=>(await get()).status.message,{timeout:10000}).toBe('Stockfish pronto');
    let state=(await get()).status;expect(state.fen).toBe(DEFAULT_POSITION);expect(()=>new Chess(state.fen).move({from:state.result.bestmove.slice(0,2),to:state.result.bestmove.slice(2,4)})).not.toThrow();
    expect(dom.window.document.getElementById('cba-overlay')!.shadowRoot!.querySelectorAll('rect').length).toBe(2);
    const before=workers;await new Promise(r=>setTimeout(r,300));expect(workers).toBe(before);
    const c=new Chess();c.move('e4');render(c.fen());c.move('e5');render(c.fen());
    await Promise.resolve();
    expect((await get()).status.message).not.toBe('Stockfish pronto');
    expect((await get()).status.result).toBeUndefined();
    await expect.poll(async()=>(await get()).status.fen,{timeout:10000}).toBe(c.fen());await expect.poll(async()=>(await get()).status.message,{timeout:10000}).toBe('Stockfish pronto');
    state=(await get()).status;expect(state.fen).toBe(c.fen());expect(workers).toBeGreaterThan(before);
    changes.forEach(fn=>fn({settings:{newValue:{enabled:false}}},'local'));await expect.poll(async()=>(await get()).status.message).toBe('Engine desligado');
    expect(dom.window.document.getElementById('cba-overlay')!.shadowRoot!.querySelectorAll('rect').length).toBe(0);
    expect(errors).toEqual([]);
  }finally{dom.window.dispatchEvent(new dom.window.Event('pagehide'));dom.window.close();offscreen.window.close();background.window.close();processes.forEach(p=>p.kill());}
});
