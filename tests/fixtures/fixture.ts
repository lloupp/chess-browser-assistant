import {Chess,DEFAULT_POSITION} from 'chess.js';
const board=document.getElementById('board')!;
const symbols:Record<string,string>={k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟'};
let fen=DEFAULT_POSITION;
function render(next=fen){
  const chess=new Chess(next);fen=chess.fen();board.replaceChildren();
  const flipped=board.dataset.orientation==='black';
  for(let y=0;y<8;y++)for(let x=0;x<8;x++){const cell=document.createElement('div');cell.className='cell'+((x+y)%2?' dark':'');board.append(cell);}
  for(const piece of chess.board().flat())if(piece){
    const el=document.createElement('div'),file=piece.square.charCodeAt(0)-97,rank=Number(piece.square[1])-1;
    el.className=`piece ${piece.color}${piece.type} square-${file+1}${rank+1} ${piece.color==='w'?'white':'black'}`;
    el.style.left=(flipped?7-file:file)*12.5+'%';el.style.top=(flipped?rank:7-rank)*12.5+'%';el.textContent=symbols[piece.type];board.append(el);
  }
  board.dataset.fen=fen;document.getElementById('current')!.textContent=fen;
}
document.getElementById('initial')!.onclick=()=>render(DEFAULT_POSITION);
document.getElementById('e4')!.onclick=()=>{const c=new Chess();c.move('e4');render(c.fen());};
document.getElementById('e5')!.onclick=()=>{const c=new Chess();c.move('e4');c.move('e5');render(c.fen());};
document.getElementById('flip')!.onclick=()=>{board.dataset.orientation=board.dataset.orientation==='white'?'black':'white';render();};
document.getElementById('promotion')!.onclick=()=>render('7k/P7/8/8/8/8/8/7K w - - 0 1');
document.getElementById('mate')!.onclick=()=>render('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1');
document.getElementById('load')!.onclick=()=>{try{render((document.getElementById('custom') as HTMLInputElement).value);}catch(e){document.getElementById('current')!.textContent=String(e);}};
render();
