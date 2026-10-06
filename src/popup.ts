import { defaults, readSettings, type Settings } from './types';
const status=document.querySelector<HTMLElement>('#status')!;
let settings:Settings={...defaults};
async function tabMessage(message:object) {
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(tab?.id===undefined)throw new Error('Abra um tabuleiro suportado');
  return chrome.tabs.sendMessage(tab.id,message);
}
async function refresh() {
  try {
    const data=await tabMessage({action:'status'});
    status.textContent=data.status.message+(data.status.fen?'\n'+data.status.fen:'');
  } catch {status.textContent='Abra Chess.com → Bots/Análise ou o tabuleiro local.';}
}
void chrome.storage.local.get('settings').then(data=>{
  settings=readSettings(data.settings);
  for(const key of ['enabled','overlay','evaluation'] as const) (document.getElementById(key) as HTMLInputElement).checked=settings[key];
  (document.getElementById('depth') as HTMLSelectElement).value=String(settings.depth);
  (document.getElementById('side') as HTMLSelectElement).value=settings.side;
});
document.querySelector('form')!.addEventListener('change',()=>{
  settings={enabled:(document.getElementById('enabled') as HTMLInputElement).checked,overlay:(document.getElementById('overlay') as HTMLInputElement).checked,evaluation:(document.getElementById('evaluation') as HTMLInputElement).checked,depth:Number((document.getElementById('depth') as HTMLSelectElement).value),side:(document.getElementById('side') as HTMLSelectElement).value as 'w'|'b'};
  void chrome.storage.local.set({settings});
});
document.getElementById('seed')!.addEventListener('click',()=>{
  void tabMessage({action:'seed',fen:(document.getElementById('fen') as HTMLInputElement).value}).then(r=>{status.textContent=r.error ?? 'FEN confirmado; analisando';}).catch(e=>{status.textContent=String(e);});
});
void refresh();const timer=setInterval(()=>void refresh(),1000);window.addEventListener('pagehide',()=>clearInterval(timer));

document.getElementById('play')!.addEventListener('click',()=>{void chrome.tabs.create({url:chrome.runtime.getURL('play.html')});});
