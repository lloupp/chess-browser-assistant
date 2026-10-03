import {test,expect,chromium,type BrowserContext,type Page} from '@playwright/test';
import {resolve} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {Chess} from 'chess.js';
let context:BrowserContext,dir:string,id:string;
test.beforeAll(async()=>{
  dir=await mkdtemp(resolve(tmpdir(),'cba-e2e-'));
  context=await chromium.launchPersistentContext(dir,{channel:'chromium',headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox',`--disable-extensions-except=${resolve('dist')}`,`--load-extension=${resolve('dist')}`]});
  const worker=context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');id=new URL(worker.url()).host;
});
test.afterAll(async()=>{await context?.close();if(dir)await rm(dir,{recursive:true,force:true});});
async function activeStatus(page:Page){
  await page.bringToFront();
  const worker=context.serviceWorkers()[0];
  // No tabs permission is needed: identify the active tab by ID, never its URL.
  return worker.evaluate(async()=>{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(tab?.id===undefined)throw new Error('Active tab absent');return chrome.tabs.sendMessage(tab.id,{action:'status'});});
}
async function ready(page:Page){
  const expectedFen=await page.locator('#board').getAttribute('data-fen');
  await expect.poll(async()=>{const s=await activeStatus(page);return s?.status.message==='Stockfish pronto' && s.status.fen===expectedFen;}).toBe(true);
  return (await activeStatus(page)).status;
}
test('loaded MV3 → fixture → WASM worker → legal move → overlay → new position',async()=>{
  const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:8787/chess-board.html');
  let s=await ready(page);expect(new Chess(s.fen).moves({verbose:true}).some(m=>m.from+m.to+(m.promotion??'')===s.result.bestmove)).toBe(true);
  await expect(page.locator('#cba-overlay rect')).toHaveCount(2);
  expect(await page.locator('#cba-overlay').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
  const first=s.fen;await page.click('#e4');s=await ready(page);expect(s.fen).not.toBe(first);expect(s.fen.split(' ')[1]).toBe('b');
  await page.click('#e5');s=await ready(page);expect(s.fen.split(' ')[1]).toBe('w');
  const move=s.result.bestmove;await expect(page.locator(`#cba-overlay rect[data-square="${move.slice(0,2)}"]`)).toHaveCount(1);
  await page.click('#flip');await expect(page.locator('#board')).toHaveAttribute('data-orientation','black');await ready(page);
  const rect=page.locator(`#cba-overlay rect[data-square="${move.slice(0,2)}"]`);
  const actual=await rect.getAttribute('x'),board=await page.locator('#board').boundingBox();
  expect(Number(actual)).toBeCloseTo(board!.x+(7-(move.charCodeAt(0)-97))*board!.width/8,1);
  await page.click('#promotion');s=await ready(page);expect(s.result.bestmove).toMatch(/^a7a8[qrbn]$/);await expect(page.locator('#cba-overlay span')).toContainText('=');
  await page.click('#mate');await expect.poll(async()=>(await activeStatus(page))?.status.message).toBe('Partida encerrada');await expect(page.locator('#cba-overlay rect')).toHaveCount(0);
  expect(errors).toEqual([]);await page.close();
});
test('rapid changes discard stale result; popup settings stop and restart',async()=>{
  const page=await context.newPage();await page.goto('http://127.0.0.1:8787/chess-board.html');
  await page.click('#e4');await page.click('#e5');const s=await ready(page);expect(s.fen.split(' ')[5]).toBe('2');
  const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup.html`);await popup.locator('#enabled').uncheck();
  await expect.poll(async()=>(await activeStatus(page))?.status.message).toBe('Engine desligado');await expect(page.locator('#cba-overlay rect')).toHaveCount(0);
  await popup.locator('#enabled').check();await ready(page);await popup.close();await page.close();
});
test('Chess.com DOM adapter on allowed route; SPA human route removes suggestions',async()=>{
  const page=await context.newPage();
  const html=await (await context.request.get('http://127.0.0.1:8787/chess-board.html')).text();
  const js=await (await context.request.get('http://127.0.0.1:8787/fixture.js')).text();
  await page.route('https://www.chess.com/**',async route=>{
    if(route.request().url().endsWith('/fixture.js'))await route.fulfill({contentType:'text/javascript',body:js});
    else await route.fulfill({contentType:'text/html',body:html.replace('data-cba-local="training"','class="chessboard"')});
  });
  await page.goto('https://www.chess.com/play/computer');await ready(page);
  await page.click('#e4');await expect.poll(async()=>(await activeStatus(page))?.status.message).toBe('Aguardando adversário');
  await page.click('#e5');await ready(page);
  await page.evaluate(()=>{history.pushState({},'','/play/online');document.body.setAttribute('data-game-type','human');});
  await expect(page.locator('#cba-overlay')).toHaveCount(0);await expect.poll(async()=>(await activeStatus(page))?.status.message).toBe('Assistência desativada neste tipo de partida.');
  const worker=context.serviceWorkers()[0];
  await page.bringToFront();
  const denied=await worker.evaluate(async()=>{const [t]=await chrome.tabs.query({active:true,currentWindow:true});return chrome.tabs.sendMessage(t.id!,{action:'seed',fen:'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'});});expect(denied.error).toBeTruthy();await page.close();
});
