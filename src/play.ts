import { Chess, type Square } from 'chess.js';
import { UciEngine } from './engine/uci';
import { parseMove } from './chess/position';
const $ = <T extends HTMLElement>(id:string) => document.getElementById(id) as T;
const glyphs:Record<string,string>={wk:'♔',wq:'♕',wr:'♖',wb:'♗',wn:'♘',wp:'♙',bk:'♚',bq:'♛',br:'♜',bb:'♝',bn:'♞',bp:'♟'};
let chess=new Chess(), side='w', depth=4, selected:Square|undefined, pendingPromotion:{from:Square;to:Square}|undefined;
let engine:UciEngine|undefined, generation=0, busy=false, failed=false;
const dialog=$<HTMLDialogElement>('promotion');
function render(){
  const board=$('board');board.replaceChildren();board.dataset.fen=chess.fen();
  const legal=selected?chess.moves({square:selected,verbose:true}):[];
  const history=chess.history({verbose:true}),last=history.at(-1);
  for(let row=0;row<8;row++)for(let col=0;col<8;col++){
    const file=side==='w'?col:7-col,rank=side==='w'?8-row:row+1;
    const square=(String.fromCharCode(97+file)+rank) as Square,piece=chess.get(square);
    const button=document.createElement('button');button.type='button';button.dataset.square=square;
    button.className='square'+((file+rank)%2===0?' dark':'')+(piece?.color==='w'?' white-piece':'')+(square===selected?' selected':'')+(legal.some(m=>m.to===square)?' legal':'')+((last?.from===square||last?.to===square)?' previous':'');
    button.textContent=piece?glyphs[piece.color+piece.type]:'';button.setAttribute('aria-label',square+(piece?' '+(piece.color==='w'?'brancas':'pretas')+' '+piece.type:''));
    button.setAttribute('aria-pressed',String(square===selected));
    const coordinate=document.createElement('span');coordinate.className='coordinate';coordinate.textContent=square;button.append(coordinate);
    button.addEventListener('click',()=>clickSquare(square));board.append(button);
  }
  $('history').replaceChildren();const moves=chess.history();
  for(let i=0;i<moves.length;i+=2){const li=document.createElement('li');li.textContent=moves[i]+' '+(moves[i+1]??'');$('history').append(li);}
  $('last').textContent=last?'Último lance: '+last.san:'';
  $('retry').hidden=!failed;
  $('status').textContent=chess.isCheckmate()?(chess.turn()===side?'Xeque-mate. Stockfish venceu.':'Xeque-mate. Tu venceu!'):chess.isDraw()?'Partida empatada.':failed?'Falha ao iniciar ou calcular. Tente novamente.':busy?'Stockfish está pensando…':(chess.turn()===side?'Tua vez.':'Vez do Stockfish.')+(chess.isCheck()?' Xeque!':'');
}
function clickSquare(square:Square){
  if(busy||failed||chess.isGameOver()||chess.turn()!==side)return;
  if(selected){
    const moves=chess.moves({square:selected,verbose:true}).filter(m=>m.to===square);
    if(moves.length){if(moves.some(m=>m.promotion)){pendingPromotion={from:selected,to:square};dialog.showModal();return;}humanMove(selected,square);return;}
  }
  selected=chess.get(square)?.color===side?square:undefined;render();
}
function humanMove(from:Square,to:Square,promotion?:string){chess.move({from,to,...(promotion?{promotion}:{})});selected=undefined;render();void computerMove();}
async function computerMove(){
  if(chess.isGameOver()||chess.turn()===side||busy)return;
  const token=++generation,fen=chess.fen();busy=true;failed=false;render();
  let job:UciEngine|undefined;
  try{
    const worker=new Worker(new URL('engine/stockfish-18-lite-single.js',location.href));
    job=new UciEngine({send:cmd=>worker.postMessage(cmd),listen:fn=>{worker.onmessage=e=>String(e.data).split('\n').forEach(fn);},failure:fn=>{worker.onerror=fn;},terminate:()=>worker.terminate()});engine=job;
    await job.init();const result=await job.analyze(fen,depth);
    if(token!==generation||chess.fen()!==fen)return;
    chess.move(parseMove(result.bestmove));
  }catch{if(token===generation)failed=true;}
  finally{job?.dispose();if(engine===job)engine=undefined;if(token===generation){busy=false;render();}}
}
function newGame(){
  generation++;engine?.dispose();engine=undefined;busy=false;failed=false;selected=undefined;pendingPromotion=undefined;if(dialog.open)dialog.close();
  side=$<HTMLSelectElement>('color').value;depth=Number($<HTMLSelectElement>('level').value);chess=new Chess();render();void computerMove();
}
$('new').addEventListener('click',newGame);$('retry').addEventListener('click',()=>void computerMove());
for(const button of dialog.querySelectorAll<HTMLButtonElement>('button'))button.addEventListener('click',()=>{const move=pendingPromotion;pendingPromotion=undefined;dialog.close();if(move)humanMove(move.from,move.to,button.dataset.piece);});
dialog.addEventListener('cancel',()=>{pendingPromotion=undefined;});
window.addEventListener('pagehide',()=>{generation++;engine?.dispose();});
newGame();
