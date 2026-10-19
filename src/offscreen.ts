import { UciEngine } from './engine/uci';
import type { Request } from './types';
// One foreground analysis owner: bounded CPU/memory even with many tabs.
let current:{owner:number;token:number;engine:UciEngine}|undefined;
const latest=new Map<number,number>();
chrome.runtime.onMessage.addListener((m:Request,sender,respond)=>{
  if (m?.target!=='offscreen' || sender.id!==chrome.runtime.id || sender.tab || m.owner===undefined || m.token===undefined) return;
  if (m.token < (latest.get(m.owner) ?? -1)) {respond({error:'Análise obsoleta'});return;}
  latest.set(m.owner,m.token);
  if(m.action==='cancel') {
    if(current?.owner===m.owner){current.engine.dispose();current=undefined;}
    if(m.token===Number.MAX_SAFE_INTEGER) latest.delete(m.owner);
    respond({cancelled:true});return;
  }
  if(m.action!=='analyze' || !m.fen || !Number.isInteger(m.depth)) {respond({error:'Pedido inválido'});return;}
  current?.engine.dispose();
  const worker=new Worker(chrome.runtime.getURL('engine/stockfish-18-lite-single.js'));
  const engine=new UciEngine({send:command=>worker.postMessage(command),listen:fn=>{worker.onmessage=e=>String(e.data).split('\n').forEach(fn);},failure:fn=>{worker.onerror=fn;},terminate:()=>worker.terminate()});
  const job={owner:m.owner,token:m.token,engine};current=job;
  void (async()=>{
    await engine.init();
    return {result:await engine.analyze(m.fen!,m.depth!)};
  })().then(respond).catch(e=>respond({error:(e as Error).message})).finally(()=>{
    engine.dispose();if(current===job) current=undefined;
  });
  return true;
});
