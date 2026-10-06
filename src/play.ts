import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';
import { UciEngine } from './engine/uci';
import { parseMove } from './chess/position';
import type { Color } from './types';
import {
  DIFFICULTIES,
  TIME_CONTROLS,
  difficulty,
  engineOptions,
  normalizedMode,
  normalizedSide,
  normalizedStyle,
  timeControl,
  type DifficultyId,
  type GameMode,
  type OpponentStyle,
  type TimeControlId
} from './game/config';
import {
  loadSnapshot,
  saveSnapshot,
  replay,
  type GameSnapshot
} from './game/persistence';
import { centipawnLoss, formatEvaluation, grade } from './game/review';

const $=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const glyphs:Record<string,string>={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
const pieceNames:Record<string,string>={k:'rei',q:'dama',r:'torre',b:'bispo',n:'cavalo',p:'peão'};

let chess=new Chess();
let startFen=DEFAULT_POSITION;
let side:Color='w';
let difficultyId:DifficultyId='intermediate';
let opponentStyle:OpponentStyle='precise';
let gameMode:GameMode='play';
let timeControlId:TimeControlId='none';
let selected:Square|undefined;
let pendingPromotion:{from:Square;to:Square}|undefined;
let mainEngine:UciEngine|undefined;
let mainEngineSignature='';
let auxEngine:UciEngine|undefined;
let generation=0;
let busyKind:'engine'|'hint'|'practice'|'review'|undefined;
let failed=false;
let hintMessage='';
let practiceMessage='';
let timeoutWinner:Color|undefined;
let whiteMs=0;
let blackMs=0;
let clockStartedAt:number|undefined;
let resumed=false;

const promotionDialog=$<HTMLDialogElement>('promotion');
const settingsDialog=$<HTMLDialogElement>('settings-dialog');
const toolsDialog=$<HTMLDialogElement>('tools-dialog');
const reviewDialog=$<HTMLDialogElement>('review-dialog');

function currentProfile(){return difficulty(difficultyId);}
function currentTimeControl(){return timeControl(timeControlId);}
function gameEnded(){return Boolean(timeoutWinner)||chess.isGameOver();}

function createEngine(){
  const worker=new Worker(new URL('engine/stockfish-18-lite-single.js',location.href));
  return new UciEngine({
    send:command=>worker.postMessage(command),
    listen:fn=>{worker.onmessage=event=>String(event.data).split('\n').forEach(fn);},
    failure:fn=>{worker.onerror=fn;},
    terminate:()=>worker.terminate()
  });
}

function disposeMain(reason='Análise cancelada'){
  if(mainEngine) mainEngine.dispose(reason);
  mainEngine=undefined;
  mainEngineSignature='';
}

function disposeAux(reason='Análise cancelada'){
  if(auxEngine) auxEngine.dispose(reason);
  auxEngine=undefined;
}

function cancelWork(reason='Análise cancelada'){
  generation++;
  disposeMain(reason);
  disposeAux(reason);
  busyKind=undefined;
}

async function ensureMainEngine(){
  const signature=difficultyId+':'+opponentStyle;
  if(mainEngine?.ready && mainEngineSignature===signature) return mainEngine;
  disposeMain();
  const engine=createEngine();
  mainEngine=engine;
  mainEngineSignature=signature;
  await engine.init(engineOptions(currentProfile(),opponentStyle));
  return engine;
}

async function strongAuxEngine(){
  disposeAux();
  const engine=createEngine();
  auxEngine=engine;
  await engine.init({'UCI_LimitStrength':false,'Skill Level':20});
  return engine;
}

function effectiveClocks(now=Date.now()){
  let w=whiteMs,b=blackMs;
  if(clockStartedAt!==undefined && currentTimeControl().initialMs>0 && !gameEnded()){
    const elapsed=Math.max(0,now-clockStartedAt);
    if(chess.turn()==='w') w=Math.max(0,w-elapsed);
    else b=Math.max(0,b-elapsed);
  }
  return {w,b};
}

function pauseClock(){
  if(clockStartedAt===undefined || currentTimeControl().initialMs===0 || gameEnded()) return;
  const now=Date.now(),values=effectiveClocks(now);
  whiteMs=values.w;blackMs=values.b;clockStartedAt=undefined;
}

function resumeClock(){
  if(currentTimeControl().initialMs>0 && !gameEnded() && clockStartedAt===undefined) clockStartedAt=Date.now();
}

function finishTurnClock(mover:Color){
  if(currentTimeControl().initialMs===0) return true;
  const now=Date.now(),values=effectiveClocks(now);
  whiteMs=values.w;blackMs=values.b;
  if((mover==='w'?whiteMs:blackMs)<=0){
    handleTimeout(mover);
    return false;
  }
  if(mover==='w') whiteMs+=currentTimeControl().incrementMs;
  else blackMs+=currentTimeControl().incrementMs;
  clockStartedAt=now;
  return true;
}

function formatClock(ms:number){
  const total=Math.max(0,Math.ceil(ms/1000));
  const minutes=Math.floor(total/60),seconds=total%60;
  return minutes+':'+String(seconds).padStart(2,'0');
}

function updateClocks(){
  const values=effectiveClocks();
  $('clock-white').textContent=currentTimeControl().initialMs?formatClock(values.w):'—';
  $('clock-black').textContent=currentTimeControl().initialMs?formatClock(values.b):'—';
  $('clock-white-wrap').classList.toggle('active',!gameEnded()&&chess.turn()==='w');
  $('clock-black-wrap').classList.toggle('active',!gameEnded()&&chess.turn()==='b');
  if(currentTimeControl().initialMs>0 && !gameEnded()){
    const loser=values.w<=0?'w':values.b<=0?'b':undefined;
    if(loser) handleTimeout(loser);
  }
}

function handleTimeout(loser:Color){
  if(timeoutWinner) return;
  const values=effectiveClocks();
  whiteMs=loser==='w'?0:values.w;
  blackMs=loser==='b'?0:values.b;
  timeoutWinner=loser==='w'?'b':'w';
  clockStartedAt=undefined;
  cancelWork('Tempo encerrado');
  saveGame();
  render();
}

function snapshot():GameSnapshot{
  const clocks=effectiveClocks();
  return {
    version:2,
    startFen,
    moves:chess.history(),
    side,
    difficulty:difficultyId,
    style:opponentStyle,
    mode:gameMode,
    timeControl:timeControlId,
    whiteMs:clocks.w,
    blackMs:clocks.b,
    ...(timeoutWinner?{timeoutWinner}:{}),
    savedAt:Date.now()
  };
}

function saveGame(){saveSnapshot(snapshot());}

function restoreSavedGame(){
  const saved=loadSnapshot();
  if(!saved) return false;
  try{
    chess=replay(saved);
    startFen=saved.startFen;
    side=saved.side;
    difficultyId=saved.difficulty;
    opponentStyle=saved.style;
    gameMode=saved.mode;
    timeControlId=saved.timeControl;
    whiteMs=saved.whiteMs;
    blackMs=saved.blackMs;
    timeoutWinner=saved.timeoutWinner;
    resumed=true;
    resumeClock();
    return true;
  }catch{return false;}
}

function statusText(){
  if(timeoutWinner) return timeoutWinner===side?'Tempo encerrado. Tu venceu.':'Tempo encerrado. Stockfish venceu.';
  if(chess.isCheckmate()) return chess.turn()===side?'Xeque-mate. Stockfish venceu.':'Xeque-mate. Tu venceu!';
  if(chess.isDraw()) return 'Partida empatada.';
  if(failed) return 'Não foi possível calcular. Tente novamente.';
  if(busyKind==='engine') return 'Stockfish está pensando…';
  if(busyKind==='hint') return 'Calculando uma dica…';
  if(busyKind==='practice') return 'Avaliando teu lance…';
  if(busyKind==='review') return 'Analisando a partida…';
  if(resumed){resumed=false;return 'Partida retomada. '+(chess.turn()===side?'Tua vez.':'Vez do Stockfish.');}
  return (chess.turn()===side?'Tua vez.':'Vez do Stockfish.')+(chess.isCheck()?' Xeque!':'');
}

function render(){
  const board=$('board');
  board.replaceChildren();
  board.dataset.fen=chess.fen();
  board.setAttribute('aria-busy',String(Boolean(busyKind)));
  const legal=selected?chess.moves({square:selected,verbose:true}):[];
  const history=chess.history({verbose:true}),last=history.at(-1);
  for(let row=0;row<8;row++) for(let col=0;col<8;col++){
    const file=side==='w'?col:7-col,rank=side==='w'?8-row:row+1;
    const square=(String.fromCharCode(97+file)+rank) as Square;
    const piece=chess.get(square);
    const button=document.createElement('button');
    button.type='button';
    button.dataset.square=square;
    button.disabled=Boolean(busyKind)||gameEnded()||chess.turn()!==side;
    button.className='square'+((file+rank)%2===0?' dark':'')+(piece?.color==='w'?' white-piece':'')+
      (square===selected?' selected':'')+(legal.some(move=>move.to===square)?' legal':'')+
      ((last?.from===square||last?.to===square)?' previous':'');
    button.textContent=piece?glyphs[piece.color+piece.type]:'';
    button.setAttribute('aria-label',square+(piece?' '+pieceNames[piece.type]+' '+(piece.color==='w'?'branca':'preta'):' vazia'));
    button.setAttribute('aria-pressed',String(square===selected));
    const coordinate=document.createElement('span');
    coordinate.className='coordinate';
    coordinate.textContent=square;
    button.append(coordinate);
    button.addEventListener('click',()=>clickSquare(square));
    board.append(button);
  }

  $('history').replaceChildren();
  const moves=chess.history();
  for(let i=0;i<moves.length;i+=2){
    const li=document.createElement('li');
    const moveNumber=Math.floor(i/2)+1;
    li.textContent=moveNumber+'. '+moves[i]+(moves[i+1]?' '+moves[i+1]:'');
    $('history').append(li);
  }

  $('status').textContent=statusText();
  $('last').textContent=last?'Último lance: '+last.san:'';
  $('practice-feedback').textContent=practiceMessage;
  $('hint-result').textContent=hintMessage;
  $('retry').hidden=!failed;
  $('hint').hidden=gameMode!=='practice'||gameEnded()||chess.turn()!==side;
  $('review').hidden=!gameEnded()||moves.length===0;
  $('undo').toggleAttribute('disabled',moves.length===0||busyKind==='review');
  $('game-badge').textContent=(gameMode==='practice'?'Prática':'Partida')+' · '+currentProfile().label.replace(/ ·.*/,'');
  updateClocks();
}

function clickSquare(square:Square){
  if(busyKind||failed||gameEnded()||chess.turn()!==side) return;
  if(selected){
    const moves=chess.moves({square:selected,verbose:true}).filter(move=>move.to===square);
    if(moves.length){
      if(moves.some(move=>move.promotion)){
        pendingPromotion={from:selected,to:square};
        promotionDialog.showModal();
        return;
      }
      humanMove(selected,square);
      return;
    }
  }
  selected=chess.get(square)?.color===side?square:undefined;
  render();
}

function humanMove(from:Square,to:Square,promotion?:string){
  if(gameEnded()||chess.turn()!==side) return;
  const beforeFen=chess.fen();
  if(!finishTurnClock(side)) return;
  const move=chess.move({from,to,...(promotion?{promotion}:{})});
  selected=undefined;
  hintMessage='';
  failed=false;
  saveGame();
  render();
  if(gameEnded()){pauseClock();saveGame();render();return;}
  if(gameMode==='practice') void assessThenReply(beforeFen,chess.fen(),move.san);
  else void computerMove();
}

async function assessThenReply(beforeFen:string,afterFen:string,playedSan:string){
  const token=++generation;
  busyKind='practice';
  render();
  let job:UciEngine|undefined;
  try{
    job=await strongAuxEngine();
    const best=await job.analyze(beforeFen,10,450);
    if(token!==generation) return;
    const after=await job.analyze(afterFen,10,450);
    if(token!==generation) return;
    const loss=centipawnLoss(best.score,after.score);
    const bestGame=new Chess(beforeFen);
    const bestMove=best.bestmove&&best.bestmove!=='(none)'?bestGame.move(parseMove(best.bestmove)):undefined;
    practiceMessage=grade(loss)+': '+playedSan+
      (bestMove&&bestMove.san!==playedSan?' · melhor: '+bestMove.san:'')+
      (loss!==undefined?' · perda '+(loss/100).toFixed(1):'');
  }catch{
    if(token===generation) practiceMessage='Não foi possível avaliar este lance.';
  }finally{
    if(auxEngine===job){job?.dispose();auxEngine=undefined;}
    if(token===generation){busyKind=undefined;saveGame();render();void computerMove();}
  }
}

async function computerMove(){
  if(gameEnded()||chess.turn()===side||busyKind) return;
  const token=++generation,fen=chess.fen();
  busyKind='engine';failed=false;render();
  try{
    const job=await ensureMainEngine();
    const profile=currentProfile();
    const result=await job.analyze(fen,profile.depth,profile.moveTime);
    if(token!==generation||chess.fen()!==fen||gameEnded()) return;
    const mover=chess.turn();
    if(!finishTurnClock(mover)) return;
    chess.move(parseMove(result.bestmove));
    if(gameEnded()) pauseClock();
    saveGame();
  }catch{
    if(token===generation&&!gameEnded()){
      failed=true;
      disposeMain();
    }
  }finally{
    if(token===generation){
      busyKind=undefined;
      render();
    }
  }
}

function resetClock(){
  const control=currentTimeControl();
  whiteMs=control.initialMs;
  blackMs=control.initialMs;
  clockStartedAt=control.initialMs>0?Date.now():undefined;
  timeoutWinner=undefined;
}

function startNewGame(fen=DEFAULT_POSITION){
  cancelWork();
  side=normalizedSide($<HTMLSelectElement>('color').value);
  difficultyId=difficulty($<HTMLSelectElement>('difficulty').value).id;
  opponentStyle=normalizedStyle($<HTMLSelectElement>('style').value);
  gameMode=normalizedMode($<HTMLSelectElement>('mode').value);
  timeControlId=timeControl($<HTMLSelectElement>('time-control').value).id;
  startFen=fen;
  chess=new Chess(fen);
  selected=undefined;
  pendingPromotion=undefined;
  failed=false;
  hintMessage='';
  practiceMessage='';
  resetClock();
  saveGame();
  render();
  if(settingsDialog.open) settingsDialog.close();
  if(chess.turn()!==side&&!gameEnded()) void computerMove();
}

function rematch(){
  syncSettings();
  startNewGame(startFen);
}

function undoMove(){
  if(chess.history().length===0||busyKind==='review') return;
  cancelWork();
  pauseClock();
  const turnBefore=chess.turn();
  if(turnBefore===side){
    chess.undo();
    if(chess.history().length) chess.undo();
  }else{
    chess.undo();
  }
  timeoutWinner=undefined;
  selected=undefined;
  failed=false;
  hintMessage='';
  practiceMessage='Lance desfeito.';
  resumeClock();
  saveGame();
  render();
  if(chess.turn()!==side&&!gameEnded()) void computerMove();
}

async function requestHint(){
  if(gameMode!=='practice'||busyKind||gameEnded()||chess.turn()!==side) return;
  const token=++generation,fen=chess.fen();
  busyKind='hint';hintMessage='';render();
  let job:UciEngine|undefined;
  try{
    job=await strongAuxEngine();
    const result=await job.analyze(fen,11,650);
    if(token!==generation||chess.fen()!==fen) return;
    const copy=new Chess(fen);
    const move=copy.move(parseMove(result.bestmove));
    hintMessage='Sugestão: '+move.san+' · avaliação '+formatEvaluation(result.score);
  }catch{
    if(token===generation) hintMessage='Dica indisponível agora.';
  }finally{
    if(auxEngine===job){job?.dispose();auxEngine=undefined;}
    if(token===generation){busyKind=undefined;render();}
  }
}

function syncSettings(){
  $<HTMLSelectElement>('color').value=side;
  $<HTMLSelectElement>('difficulty').value=difficultyId;
  $<HTMLSelectElement>('style').value=opponentStyle;
  $<HTMLSelectElement>('mode').value=gameMode;
  $<HTMLSelectElement>('time-control').value=timeControlId;
}

function exportedPgn(){
  const body=chess.pgn();
  if(startFen===DEFAULT_POSITION) return body;
  return '[SetUp "1"]\n[FEN "'+startFen+'"]\n\n'+body;
}

function openTools(){
  $<HTMLTextAreaElement>('fen-text').value=chess.fen();
  $<HTMLTextAreaElement>('pgn-text').value=exportedPgn();
  $('tool-message').textContent='';
  toolsDialog.showModal();
}

async function copyText(text:string,label:string){
  try{
    await navigator.clipboard.writeText(text);
    $('tool-message').textContent=label+' copiado.';
  }catch{
    const temp=document.createElement('textarea');
    temp.value=text;document.body.append(temp);temp.select();
    document.execCommand('copy');temp.remove();
    $('tool-message').textContent=label+' copiado.';
  }
}

function importFen(){
  const fen=$<HTMLTextAreaElement>('fen-text').value.trim();
  try{
    new Chess(fen);
    syncSettings();
    toolsDialog.close();
    startNewGame(fen);
  }catch{
    $('tool-message').textContent='FEN inválido.';
  }
}

function importPgn(){
  const pgn=$<HTMLTextAreaElement>('pgn-text').value.trim();
  try{
    const imported=new Chess();
    imported.loadPgn(pgn);
    const fenHeader=/\[FEN\s+"([^"]+)"\]/i.exec(pgn)?.[1]??DEFAULT_POSITION;
    new Chess(fenHeader);
    cancelWork();
    startFen=fenHeader;
    chess=imported;
    selected=undefined;failed=false;timeoutWinner=undefined;hintMessage='';practiceMessage='';
    resetClock();
    saveGame();
    toolsDialog.close();
    render();
    if(chess.turn()!==side&&!gameEnded()) void computerMove();
  }catch{
    $('tool-message').textContent='PGN inválido.';
  }
}

async function shareGame(){
  const text='Xadrez Local\nFEN: '+chess.fen()+'\n\n'+exportedPgn();
  try{
    if(navigator.share) await navigator.share({title:'Xadrez Local',text});
    else await copyText(text,'Partida');
  }catch(error){
    if((error as DOMException).name!=='AbortError') await copyText(text,'Partida');
  }
}

interface ReviewLine{moveNumber:number;san:string;best:string;loss?:number;label:string}

async function reviewGame(){
  if(chess.history().length===0||busyKind) return;
  const token=++generation;
  busyKind='review';render();
  reviewDialog.showModal();
  $('review-list').replaceChildren();
  $('review-summary').textContent='Preparando análise local…';
  const allMoves=chess.history();
  const positions:{moveNumber:number;san:string;before:string;after:string}[]=[];
  const cursor=new Chess(startFen);
  for(let i=0;i<allMoves.length;i++){
    const before=cursor.fen(),move=cursor.move(allMoves[i]);
    if(move.color===side) positions.push({moveNumber:Math.floor(i/2)+1,san:move.san,before,after:cursor.fen()});
  }
  const lines:ReviewLine[]=[];
  let job:UciEngine|undefined;
  try{
    job=await strongAuxEngine();
    for(let i=0;i<positions.length;i++){
      if(token!==generation) return;
      $('review-summary').textContent='Analisando '+(i+1)+' de '+positions.length+' lances teus…';
      const position=positions[i];
      const best=await job.analyze(position.before,10,350);
      if(token!==generation) return;
      const after=await job.analyze(position.after,10,350);
      const loss=centipawnLoss(best.score,after.score);
      const bestGame=new Chess(position.before);
      const bestMove=best.bestmove&&best.bestmove!=='(none)'?bestGame.move(parseMove(best.bestmove)):undefined;
      lines.push({moveNumber:position.moveNumber,san:position.san,best:bestMove?.san??'—',loss,label:grade(loss)});
    }
    if(token!==generation) return;
    const valid=lines.filter(line=>line.loss!==undefined);
    const average=valid.length?Math.round(valid.reduce((sum,line)=>sum+(line.loss??0),0)/valid.length):undefined;
    $('review-summary').textContent='Análise concluída'+(average!==undefined?' · perda média '+(average/100).toFixed(1):'')+'.';
    for(const line of [...lines].sort((a,b)=>(b.loss??-1)-(a.loss??-1)).slice(0,8)){
      const li=document.createElement('li');
      const strong=document.createElement('strong');
      strong.textContent=line.label;
      li.append(strong,document.createTextNode(' · '+line.moveNumber+'. '+line.san+
        (line.best!=='—'&&line.best!==line.san?' → melhor '+line.best:'')+
        (line.loss!==undefined?' · '+(line.loss/100).toFixed(1):'')));
      $('review-list').append(li);
    }
  }catch{
    if(token===generation) $('review-summary').textContent='A análise foi interrompida.';
  }finally{
    if(auxEngine===job){job?.dispose();auxEngine=undefined;}
    if(token===generation){busyKind=undefined;render();}
  }
}

function cancelReview(){
  if(busyKind==='review') cancelWork();
  reviewDialog.close();
  render();
}

for(const [id,profile] of Object.entries(DIFFICULTIES)){
  const option=document.createElement('option');option.value=id;option.textContent=profile.label;$('difficulty').append(option);
}
for(const [id,control] of Object.entries(TIME_CONTROLS)){
  const option=document.createElement('option');option.value=id;option.textContent=control.label;$('time-control').append(option);
}

$('new').addEventListener('click',()=>{syncSettings();settingsDialog.showModal();});
$('settings-form').addEventListener('submit',event=>{event.preventDefault();startNewGame();});
$('settings-cancel').addEventListener('click',()=>settingsDialog.close());
$('retry').addEventListener('click',()=>{failed=false;void computerMove();});
$('undo').addEventListener('click',undoMove);
$('rematch').addEventListener('click',rematch);
$('hint').addEventListener('click',()=>void requestHint());
$('tools').addEventListener('click',openTools);
$('tools-close').addEventListener('click',()=>toolsDialog.close());
$('copy-fen').addEventListener('click',()=>void copyText(chess.fen(),'FEN'));
$('copy-pgn').addEventListener('click',()=>void copyText(exportedPgn(),'PGN'));
$('import-fen').addEventListener('click',importFen);
$('import-pgn').addEventListener('click',importPgn);
$('share').addEventListener('click',()=>void shareGame());
$('review').addEventListener('click',()=>void reviewGame());
$('review-close').addEventListener('click',cancelReview);

for(const button of promotionDialog.querySelectorAll<HTMLButtonElement>('button')){
  button.addEventListener('click',()=>{
    const move=pendingPromotion;
    pendingPromotion=undefined;
    promotionDialog.close();
    if(move) humanMove(move.from,move.to,button.dataset.piece);
  });
}
promotionDialog.addEventListener('cancel',()=>{pendingPromotion=undefined;});

document.addEventListener('visibilitychange',()=>{
  if(document.hidden){pauseClock();saveGame();}
  else {resumeClock();render();}
});
window.addEventListener('pagehide',()=>{
  pauseClock();saveGame();cancelWork();
});

setInterval(updateClocks,250);

if(!restoreSavedGame()){
  timeControlId='none';
  resetClock();
}
syncSettings();
render();
if(chess.turn()!==side&&!gameEnded()) void computerMove();
