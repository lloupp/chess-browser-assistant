import { Chess, DEFAULT_POSITION, type Move, type Square } from 'chess.js';
import { UciEngine } from './engine/uci';
import { parseMove, threatFen } from './chess/position';
import type { Color, Result } from './types';
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
import { centipawnLoss, formatEvaluation, grade, moveAccuracy, scoreToCp, whiteScore, winPercent, type MoveGrade } from './game/review';
import { explainPlayedMove, guidanceFor } from './game/coach';
import { openingName } from './game/openings';
import { materialSummary } from './game/material';
import { formatRecord, loadStats, outcomeFor, saveStats, withOutcome } from './game/stats';
import { isMuted, playSound, setMuted } from './ui/sound';

declare global { interface Window { AndroidShare?:{share(text:string):void}; AndroidScreen?:{keepOn(on:boolean):void} } }

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
let busyKind:'engine'|'hint'|'threat'|'practice'|'review'|undefined;
let failed=false;
let hintMessage='';
let practiceMessage='';
let coachMessage='';
let timeoutWinner:Color|undefined;
let whiteMs=0;
let blackMs=0;
let clockStartedAt:number|undefined;
let resumed=false;
interface Arrow{from:Square;to:Square;kind:'hint'|'threat'|'best'}
let arrow:Arrow|undefined;
let evaluation:{score:Result['score'];label:string}|undefined;
let viewPly:number|undefined;
let viewArrow:Arrow|undefined;
let gameId=newGameId();
let stats=loadStats();
let screenAwake=false;
let lastInteraction=Date.now();

const promotionDialog=$<HTMLDialogElement>('promotion');
const settingsDialog=$<HTMLDialogElement>('settings-dialog');
const toolsDialog=$<HTMLDialogElement>('tools-dialog');
const reviewDialog=$<HTMLDialogElement>('review-dialog');

function newGameId(){return Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
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
  playSound('end');
  recordResult();
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
    id:gameId,
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
    gameId=saved.id??newGameId();
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
  if(busyKind==='threat') return 'Procurando a ameaça do adversário…';
  if(busyKind==='practice') return gameMode==='guided'?'Professor está analisando teu lance…':'Avaliando teu lance…';
  if(busyKind==='review') return 'Analisando a partida…';
  if(resumed){resumed=false;return 'Partida retomada. '+(chess.turn()===side?'Tua vez.':'Vez do Stockfish.');}
  return (chess.turn()===side?'Tua vez.':'Vez do Stockfish.')+(chess.isCheck()?' Xeque!':'');
}

function positionAt(ply:number){
  const game=new Chess(startFen);
  for(const san of chess.history().slice(0,ply)) game.move(san);
  return game;
}

function squareCenter(square:Square){
  const file=square.charCodeAt(0)-97,rank=Number(square[1]);
  return {x:(side==='w'?file:7-file)+0.5,y:(side==='w'?8-rank:rank-1)+0.5};
}

function arrowElement(value:Arrow){
  const ns='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(ns,'svg');
  svg.setAttribute('viewBox','0 0 8 8');
  svg.setAttribute('class','board-arrow '+value.kind);
  svg.setAttribute('aria-hidden','true');
  const start=squareCenter(value.from),end=squareCenter(value.to);
  const length=Math.hypot(end.x-start.x,end.y-start.y),ux=(end.x-start.x)/length,uy=(end.y-start.y)/length;
  const baseX=end.x-ux*0.45,baseY=end.y-uy*0.45;
  const line=document.createElementNS(ns,'line');
  line.setAttribute('x1',String(start.x));line.setAttribute('y1',String(start.y));
  line.setAttribute('x2',String(baseX));line.setAttribute('y2',String(baseY));
  const head=document.createElementNS(ns,'polygon');
  head.setAttribute('points',[end.x,end.y,baseX-uy*0.3,baseY+ux*0.3,baseX+uy*0.3,baseY-ux*0.3].join(' '));
  svg.append(line,head);
  return svg;
}

function capturesText(types:string[],color:Color,advantage:number){
  const groups=new Map<string,number>();
  for(const type of types) groups.set(type,(groups.get(type)??0)+1);
  const glyphColor=color==='w'?'b':'w';
  const pieces=[...groups].map(([type,count])=>glyphs[glyphColor+type]+(count>1?count:'')).join('');
  return pieces+(advantage>0?' +'+advantage:'');
}

function plyLabel(ply:number,moves:string[]){
  return Math.floor((ply-1)/2)+1+(ply%2?'. ':'… ')+moves[ply-1];
}

function render(){
  const board=$('board');
  board.replaceChildren();
  const viewing=viewPly!==undefined;
  const shown=viewing?positionAt(viewPly??0):chess;
  board.dataset.fen=shown.fen();
  board.setAttribute('aria-busy',String(Boolean(busyKind)));
  const legal=selected&&!viewing?chess.moves({square:selected,verbose:true}):[];
  const history=shown.history({verbose:true}),last=history.at(-1);
  for(let row=0;row<8;row++) for(let col=0;col<8;col++){
    const file=side==='w'?col:7-col,rank=side==='w'?8-row:row+1;
    const square=(String.fromCharCode(97+file)+rank) as Square;
    const piece=shown.get(square);
    const button=document.createElement('button');
    button.type='button';
    button.dataset.square=square;
    button.disabled=viewing||Boolean(busyKind)||gameEnded()||chess.turn()!==side;
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
  const drawn=viewing?viewArrow:arrow;
  if(drawn) board.append(arrowElement(drawn));

  $('history').replaceChildren();
  const moves=chess.history();
  for(let i=0;i<moves.length;i+=2){
    const li=document.createElement('li');
    for(const ply of [i+1,i+2]){
      if(!moves[ply-1]) continue;
      const button=document.createElement('button');
      button.type='button';
      button.className='ply';
      button.textContent=moves[ply-1];
      button.setAttribute('aria-current',String(viewPly===ply));
      button.addEventListener('click',()=>showPly(ply));
      li.append(button);
    }
    $('history').append(li);
  }
  $('view-bar').hidden=!viewing;
  if(viewing){
    const ply=viewPly??0;
    $('view-label').textContent=viewArrow?'Antes de '+plyLabel(ply+1,moves):ply===0?'Posição inicial':'Após '+plyLabel(ply,moves);
    $('view-prev').toggleAttribute('disabled',viewPly===0);
  }

  const material=materialSummary(shown,startFen);
  $('captures-white').textContent=capturesText(material.capturedBy.w,'w',material.advantage);
  $('captures-black').textContent=capturesText(material.capturedBy.b,'b',-material.advantage);
  const opening=startFen===DEFAULT_POSITION?openingName(moves):undefined;
  $('opening').textContent=opening?'Abertura: '+opening:'';
  const cp=evaluation?scoreToCp(evaluation.score):undefined;
  $('eval-bar').hidden=gameMode==='play'||cp===undefined;
  if(evaluation&&cp!==undefined){
    $('eval-fill').style.width=winPercent(cp).toFixed(1)+'%';
    $('eval-label').textContent='Avaliação '+formatEvaluation(evaluation.score)+' · '+evaluation.label;
  }
  $('sound').textContent=isMuted()?'🔇':'🔊';
  $('sound').setAttribute('aria-pressed',String(isMuted()));
  $('sound').setAttribute('aria-label',isMuted()?'Ativar sons':'Silenciar sons');

  $('status').textContent=statusText();
  $('last').textContent=last?'Último lance: '+last.san:'';
  $('practice-feedback').textContent=gameMode==='practice'?practiceMessage:'';
  $('hint-result').textContent=hintMessage;
  $('coach-panel').hidden=gameMode!=='guided';
  if(gameMode==='guided'){
    const guidance=guidanceFor(chess,side);
    $('coach-phase').textContent=guidance.phase;
    $('coach-goal').textContent=guidance.goal;
    $('coach-tip').textContent=guidance.tip;
    $('coach-feedback').textContent=coachMessage;
    $('coach-feedback').hidden=!coachMessage;
  }
  $('retry').hidden=!failed;
  $('hint').hidden=gameMode==='play'||gameEnded()||chess.turn()!==side;
  $('threat').hidden=$('hint').hidden;
  $('review').hidden=!gameEnded()||moves.length===0;
  $('undo').toggleAttribute('disabled',moves.length===0||busyKind==='review');
  $('game-badge').textContent=(gameMode==='guided'?'Guiado':gameMode==='practice'?'Prática':'Partida')+' · '+currentProfile().label.replace(/ ·.*/,'');
  updateClocks();
}

function showPly(ply:number|undefined){
  viewPly=ply===undefined||ply>=chess.history().length?undefined:Math.max(0,ply);
  viewArrow=undefined;
  selected=undefined;
  render();
}

function afterMove(move:Move){
  playSound(chess.isGameOver()?'end':chess.isCheck()?'check':move.captured?'capture':'move');
  recordResult();
}

function recordResult(){
  const outcome=outcomeFor(chess,side,timeoutWinner);
  if(!outcome) return;
  stats=withOutcome(stats,difficultyId,outcome,gameId);
  saveStats(stats);
}

function syncKeepAwake(){
  const wanted=!gameEnded()&&!document.hidden&&Date.now()-lastInteraction<5*60_000;
  if(wanted===screenAwake) return;
  screenAwake=wanted;
  try{window.AndroidScreen?.keepOn(wanted);}catch{/* bridge unavailable */}
}

function updateRecord(){
  const id=difficulty($<HTMLSelectElement>('difficulty').value).id;
  $('record').textContent='Teu retrospecto neste nível: '+formatRecord(stats.records[id])+'.';
}

function clickSquare(square:Square){
  if(viewPly!==undefined||busyKind||failed||gameEnded()||chess.turn()!==side) return;
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
  afterMove(move);
  selected=undefined;
  arrow=undefined;
  hintMessage='';
  coachMessage=gameMode==='guided'?'Analisando teu lance…':'';
  failed=false;
  saveGame();
  render();
  if(gameEnded()){
    if(gameMode==='guided') coachMessage=chess.isCheckmate()
      ? 'Xeque-mate! Excelente oportunidade para rever como o ataque ao rei foi construído.'
      : 'Partida encerrada. Revê os lances para reforçar o aprendizado.';
    pauseClock();saveGame();render();return;
  }
  if(gameMode==='practice'||gameMode==='guided') void assessThenReply(beforeFen,chess.fen(),move.san);
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
    evaluation={score:whiteScore(after.score,new Chess(afterFen).turn()),label:'após '+playedSan};
    if(gameMode==='guided'){
      const played=new Chess(beforeFen).move(playedSan);
      coachMessage=explainPlayedMove(played,beforeFen,loss,bestMove?.san);
    }else{
      practiceMessage=grade(loss)+': '+playedSan+
        (bestMove&&bestMove.san!==playedSan?' · melhor: '+bestMove.san:'')+
        (loss!==undefined?' · perda '+(loss/100).toFixed(1):'');
    }
  }catch{
    if(token===generation){
      if(gameMode==='guided') coachMessage='Não foi possível avaliar este lance. Continua a jogar e usa as orientações da fase.';
      else practiceMessage='Não foi possível avaliar este lance.';
    }
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
    afterMove(chess.move(parseMove(result.bestmove)));
    arrow=undefined;
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

function clearAnnotations(){
  arrow=undefined;
  evaluation=undefined;
  viewPly=undefined;
  viewArrow=undefined;
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
  gameId=newGameId();
  clearAnnotations();
  selected=undefined;
  pendingPromotion=undefined;
  failed=false;
  hintMessage='';
  practiceMessage='';
  coachMessage='';
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
  clearAnnotations();
  selected=undefined;
  failed=false;
  hintMessage='';
  practiceMessage='Lance desfeito.';
  coachMessage=gameMode==='guided'?'Lance desfeito. Observa a posição e procura outra ideia.':'';
  resumeClock();
  saveGame();
  render();
  if(chess.turn()!==side&&!gameEnded()) void computerMove();
}

async function requestHint(){
  if(gameMode==='play'||busyKind||gameEnded()||chess.turn()!==side) return;
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
    arrow={from:move.from,to:move.to,kind:'hint'};
    evaluation={score:whiteScore(result.score,chess.turn()),label:'posição atual'};
  }catch{
    if(token===generation) hintMessage='Dica indisponível agora.';
  }finally{
    if(auxEngine===job){job?.dispose();auxEngine=undefined;}
    if(token===generation){busyKind=undefined;render();}
  }
}

async function requestThreat(){
  if(gameMode==='play'||busyKind||gameEnded()||chess.turn()!==side) return;
  const fen=chess.fen(),swapped=threatFen(fen);
  if(!swapped){
    arrow=undefined;
    hintMessage='Estás em xeque: a ameaça imediata é o próprio xeque.';
    render();
    return;
  }
  const token=++generation;
  busyKind='threat';hintMessage='';render();
  let job:UciEngine|undefined;
  try{
    job=await strongAuxEngine();
    const result=await job.analyze(swapped,10,500);
    if(token!==generation||chess.fen()!==fen) return;
    const move=new Chess(swapped).move(parseMove(result.bestmove));
    arrow={from:move.from,to:move.to,kind:'threat'};
    hintMessage='Ameaça: se fosse a vez do adversário, ele jogaria '+move.san+
      (move.captured?', capturando '+pieceNames[move.captured]:'')+'.';
  }catch{
    if(token===generation) hintMessage='Não foi possível identificar a ameaça agora.';
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
    gameId=newGameId();
    clearAnnotations();
    selected=undefined;failed=false;timeoutWinner=undefined;hintMessage='';practiceMessage='';coachMessage='';
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
    if(window.AndroidShare){window.AndroidShare.share(text);$('tool-message').textContent='Abrindo compartilhamento…';}
    else if(navigator.share) await navigator.share({title:'Xadrez Local',text});
    else await copyText(text,'Partida');
  }catch(error){
    if((error as DOMException).name!=='AbortError') await copyText(text,'Partida');
  }
}

interface ReviewLine{ply:number;moveNumber:number;san:string;best:string;bestArrow?:Arrow;loss?:number;accuracy?:number;label:MoveGrade}

async function reviewGame(){
  if(chess.history().length===0||busyKind) return;
  const token=++generation;
  busyKind='review';render();
  reviewDialog.showModal();
  $('review-list').replaceChildren();
  $('review-summary').textContent='Preparando análise local…';
  $('review-counts').textContent='';
  const allMoves=chess.history();
  const positions:{ply:number;moveNumber:number;san:string;before:string;after:string}[]=[];
  const cursor=new Chess(startFen);
  for(let i=0;i<allMoves.length;i++){
    const before=cursor.fen(),move=cursor.move(allMoves[i]);
    if(move.color===side) positions.push({ply:i,moveNumber:Math.floor(i/2)+1,san:move.san,before,after:cursor.fen()});
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
      lines.push({
        ply:position.ply,moveNumber:position.moveNumber,san:position.san,best:bestMove?.san??'—',
        ...(bestMove?{bestArrow:{from:bestMove.from,to:bestMove.to,kind:'best' as const}}:{}),
        loss,accuracy:moveAccuracy(best.score,after.score),label:grade(loss)
      });
    }
    if(token!==generation) return;
    const valid=lines.filter(line=>line.loss!==undefined);
    const average=valid.length?Math.round(valid.reduce((sum,line)=>sum+(line.loss??0),0)/valid.length):undefined;
    const accuracies=lines.flatMap(line=>line.accuracy===undefined?[]:[line.accuracy]);
    const accuracy=accuracies.length?Math.round(accuracies.reduce((sum,value)=>sum+value,0)/accuracies.length):undefined;
    $('review-summary').textContent='Análise concluída'+(accuracy!==undefined?' · precisão '+accuracy+'%':'')+
      (average!==undefined?' · perda média '+(average/100).toFixed(1):'')+'.';
    const grades:MoveGrade[]=['Excelente','Boa','Imprecisão','Erro','Erro grave'];
    $('review-counts').textContent=grades.map(label=>label+' '+lines.filter(line=>line.label===label).length).join(' · ');
    for(const line of [...lines].sort((a,b)=>(b.loss??-1)-(a.loss??-1)).slice(0,8)){
      const li=document.createElement('li');
      const button=document.createElement('button');
      button.type='button';
      const strong=document.createElement('strong');
      strong.textContent=line.label;
      button.append(strong,document.createTextNode(' · '+line.moveNumber+'. '+line.san+
        (line.best!=='—'&&line.best!==line.san?' → melhor '+line.best:'')+
        (line.loss!==undefined?' · '+(line.loss/100).toFixed(1):'')));
      button.addEventListener('click',()=>{
        reviewDialog.close();
        showPly(line.ply);
        viewArrow=line.bestArrow;
        render();
      });
      li.append(button);
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

$('new').addEventListener('click',()=>{syncSettings();updateRecord();settingsDialog.showModal();});
$('difficulty').addEventListener('change',updateRecord);
$('settings-form').addEventListener('submit',event=>{event.preventDefault();startNewGame();});
$('settings-cancel').addEventListener('click',()=>settingsDialog.close());
$('retry').addEventListener('click',()=>{failed=false;void computerMove();});
$('undo').addEventListener('click',undoMove);
$('rematch').addEventListener('click',rematch);
$('hint').addEventListener('click',()=>void requestHint());
$('threat').addEventListener('click',()=>void requestThreat());
$('sound').addEventListener('click',()=>{setMuted(!isMuted());render();});
$('view-prev').addEventListener('click',()=>showPly((viewPly??chess.history().length)-1));
$('view-next').addEventListener('click',()=>showPly((viewPly??chess.history().length)+1));
$('view-live').addEventListener('click',()=>showPly(undefined));
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

for(const type of ['pointerdown','keydown']) document.addEventListener(type,()=>{lastInteraction=Date.now();});

setInterval(()=>{updateClocks();syncKeepAwake();},250);

if(!restoreSavedGame()){
  timeControlId='none';
  resetClock();
}
syncSettings();
render();
if(chess.turn()!==side&&!gameEnded()) void computerMove();
