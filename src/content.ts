import { DomAdapter } from './board/adapter';
import { PositionTracker, validated } from './chess/position';
import { FairPlayGuard } from './guard';
import { debounce } from './debounce';
import { Overlay } from './ui/overlay';
import { defaults, readSettings, type Settings, type Status, type Result } from './types';
let settings:Settings={...defaults},status:Status={message:'Aguardando tabuleiro'},adapter:DomAdapter|undefined,overlay:Overlay|undefined;
let cleanup:(()=>void)|undefined,token=Date.now(),lastFen='',lastResult:Result|undefined,route=location.href,stopped=false;
const tracker=new PositionTracker();
function cancel() {
  token++;overlay?.clear();lastResult=undefined;
  void chrome.runtime.sendMessage({target:'background',action:'cancel',token}).catch(()=>{});
}
function invalidate() {cancel();lastFen='';run();}
function publish(message:string,fen?:string,result?:Result) {status={message,fen,result,ready:Boolean(result)};}
async function analyze() {
  if(stopped)return;
  const context=FairPlayGuard.check(location.href,document);
  if (!context.allowed) {cancel();publish('Assistência desativada neste tipo de partida.');return;}
  if(!settings.enabled){cancel();publish('Engine desligado');return;}
  if(!adapter?.element.isConnected){publish('Aguardando tabuleiro');return;}
  try {
    const snapshot=adapter.readPosition(),fen=tracker.read(snapshot.placement,snapshot.exactFen);
    if(fen===lastFen) {if(lastResult && settings.overlay)overlay?.show(lastResult,settings.evaluation);return;}
    lastFen=fen;
    const chess=validated(fen);
    if(chess.isGameOver()){cancel();publish('Partida encerrada',fen);return;}
    if(context.kind==='computer' && chess.turn()!==settings.side){cancel();publish('Aguardando adversário',fen);return;}
    cancel();const revision=token;
    publish('Stockfish carregando / analisando',fen);
    const response=await chrome.runtime.sendMessage({target:'background',action:'analyze',fen,depth:settings.depth,token:revision});
    if(revision!==token || !FairPlayGuard.check(location.href,document).allowed || stopped || !settings.enabled)return;
    if(response?.error)throw new Error(response.error);
    if(!response?.result)throw new Error('Resposta do engine ausente');
    lastResult=response.result;
    publish('Stockfish pronto',fen,lastResult);
    if(settings.overlay)overlay?.show(lastResult!,settings.evaluation);
  } catch(e) {cancel();lastFen='';publish((e as Error).message);}
}
const run=debounce(()=>void analyze(),180);
function attach() {
  if(stopped)return;
  if(location.href!==route){route=location.href;tracker.reset();invalidate();}
  if(!FairPlayGuard.check(location.href,document).allowed){
    if(status.message!=='Assistência desativada neste tipo de partida.'){cancel();lastFen='';publish('Assistência desativada neste tipo de partida.');}
    cleanup?.();cleanup=undefined;overlay?.destroy();overlay=undefined;adapter=undefined;return;
  }
  const found=DomAdapter.detect();
  if(found?.element===adapter?.element)return;
  cleanup?.();overlay?.destroy();cancel();tracker.reset();lastFen='';adapter=found;
  if(!adapter){publish('Aguardando tabuleiro');return;}
  overlay=new Overlay(adapter);
  cleanup=adapter.observeChanges(()=>{
    // Orientation-only updates preserve analysis; actual piece changes cancel immediately.
    try {const s=adapter!.readPosition();if(lastFen && s.placement===lastFen.split(' ')[0] && (!s.exactFen || s.exactFen===lastFen)){if(lastResult && settings.overlay)overlay?.show(lastResult,settings.evaluation);return;}} catch { /* Transient animation: cancel until it settles. */ }
    cancel();lastFen='';run();
  });run();
}
const discovery=debounce(attach,80);
const observer=new MutationObserver(records=>{
  if(!FairPlayGuard.check(location.href,document).allowed){attach();return;}
  if(records.some(r=>!(r.target instanceof Element && r.target.closest('#cba-overlay')))) discovery();
});
observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['data-game-type','class']});
window.addEventListener('popstate',attach);window.addEventListener('hashchange',attach);
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local' && changes.settings){settings=readSettings(changes.settings.newValue);invalidate();}});
chrome.runtime.onMessage.addListener((m,_sender,respond)=>{
  if(m?.action==='status'){attach();respond({status,settings});return;}
  if(m?.action==='seed'){
    try {
      if(!FairPlayGuard.check(location.href,document).allowed || !adapter)throw new Error('Contexto não permitido');
      tracker.seed(String(m.fen),adapter.readPosition().placement);invalidate();respond({ok:true});
    }catch(e){respond({error:(e as Error).message});}
  }
});
void chrome.storage.local.get('settings').then(data=>{settings=readSettings(data.settings);attach();});
window.addEventListener('pagehide',()=>{stopped=true;cancel();cleanup?.();overlay?.destroy();observer.disconnect();run.cancel();discovery.cancel();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
