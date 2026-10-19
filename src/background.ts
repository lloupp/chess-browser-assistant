import { allowedRoute } from './guard';
import type { Request } from './types';
let creating:Promise<void>|undefined;
async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  creating ??= chrome.offscreen.createDocument({url:'offscreen.html',reasons:[chrome.offscreen.Reason.WORKERS],justification:'Executar Stockfish WASM em Worker local sem bloquear a página'}).finally(()=>{creating=undefined;});
  await creating;
}
chrome.runtime.onMessage.addListener((message:Request,sender,respond)=>{
  if (message?.target!=='background' || sender.id!==chrome.runtime.id || sender.tab?.id===undefined) return;
  const owner=sender.tab.id;
  if (!['analyze','cancel'].includes(message.action) || !Number.isSafeInteger(message.token)) {respond({error:'Mensagem inválida'});return;}
  if (message.action==='analyze' && !allowedRoute(sender.url ?? '')) {respond({error:'Assistência desativada neste tipo de partida.'});return;}
  void (async()=>{
    await ensureOffscreen();
    return chrome.runtime.sendMessage({...message,target:'offscreen',owner});
  })().then(respond).catch(e=>respond({error:String(e)}));
  return true;
});
chrome.tabs.onRemoved.addListener(owner=>{
  void chrome.offscreen.hasDocument().then(exists=>exists && chrome.runtime.sendMessage({target:'offscreen',action:'cancel',owner,token:Number.MAX_SAFE_INTEGER})).catch(()=>{});
});
