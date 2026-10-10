import { Chess } from 'chess.js';
import { Engine } from './engine.js';
import { lesson, formatEval } from './coach.js';

const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const $ = (id) => document.getElementById(id);

const coach = new Engine();    // full strength, used for teaching
const opponent = new Engine(); // weakened, plays against you
let chess = new Chess();
let player = 'w';
let selected = null;
let lastMove = null;
let hintSquares = [];
let busy = false;
const notes = []; // lesson per player move, aligned with history

function squareName(file, rank) { return 'abcdefgh'[file] + (rank + 1); }

function render() {
  const board = $('board');
  board.innerHTML = '';
  const targets = selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : [];
  for (let r = 7; r >= 0; r--) {
    for (let f = 0; f < 8; f++) {
      const rank = player === 'w' ? r : 7 - r;
      const file = player === 'w' ? f : 7 - f;
      const sq = squareName(file, rank);
      const el = document.createElement('div');
      el.className = `sq ${(file + rank) % 2 ? 'l' : 'd'}`;
      el.dataset.square = sq;
      if (sq === selected) el.classList.add('sel');
      if (lastMove && (sq === lastMove.from || sq === lastMove.to)) el.classList.add('last');
      if (hintSquares.includes(sq)) el.classList.add('hint');
      if (targets.includes(sq)) el.classList.add('target');
      const piece = chess.get(sq);
      if (piece) {
        el.textContent = GLYPHS[piece.type];
        el.classList.add(piece.color === 'w' ? 'pw' : 'pb');
      }
      el.onclick = () => onSquare(sq);
      board.appendChild(el);
    }
  }
  const hist = chess.history();
  $('history').innerHTML = '';
  for (let i = 0; i < hist.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = `${hist[i]} ${hist[i + 1] ?? ''}`;
    $('history').appendChild(li);
  }
  $('undo').disabled = busy || chess.history().length < 2;
  $('hint').disabled = busy || chess.turn() !== player || chess.isGameOver();
}

function setEval(cpWhite) {
  const clamped = Math.max(-800, Math.min(800, cpWhite));
  const whiteShare = 50 + clamped / 16;
  $('evalfill').style.height = `${player === 'w' ? whiteShare : 100 - whiteShare}%`;
  $('evalbar').title = `Avaliação: ${formatEval(cpWhite)}`;
}

function status(text) { $('status').textContent = text; }

function gameOverText() {
  if (chess.isCheckmate()) return chess.turn() === player ? 'Xeque-mate. Você perdeu — revise os lances marcados.' : 'Xeque-mate! Você venceu!';
  if (chess.isDraw()) return 'Empate.';
  return '';
}

function onSquare(sq) {
  if (busy || chess.turn() !== player || chess.isGameOver()) return;
  const piece = chess.get(sq);
  if (selected) {
    const move = chess.moves({ square: selected, verbose: true }).find((m) => m.to === sq);
    if (move) return playerMove({ from: selected, to: sq, promotion: 'q' });
  }
  selected = piece && piece.color === player ? sq : null;
  render();
}

async function playerMove(m) {
  busy = true;
  selected = null;
  hintSquares = [];
  const before = chess.fen();
  render();
  status('Professor analisando seu lance…');
  const bestInfo = await coach.analyze(before);
  const played = chess.move(m);
  lastMove = played;
  render();

  let playedCp;
  if (chess.isCheckmate()) playedCp = 10000;
  else if (chess.isDraw()) playedCp = 0;
  else playedCp = -(await coach.analyze(chess.fen())).cp;

  const best = bestInfo.bestmove ? new Chess(before).move(bestInfo.bestmove) : null;
  const l = lesson({ bestCp: bestInfo.cp, playedCp, played, best, bestMate: bestInfo.mate, after: new Chess(chess.fen()) });
  notes.push(l);
  $('feedback').innerHTML = `<span class="tag ${l.kind}">${played.san}: ${l.label}</span> <span>${l.text}</span>`;
  setEval(player === 'w' ? playedCp : -playedCp);

  if (chess.isGameOver()) return finish();
  status('Adversário pensando…');
  const reply = await opponent.analyze(chess.fen(), 'go movetime 400');
  lastMove = chess.move(reply.bestmove);
  if (chess.isGameOver()) return finish();
  busy = false;
  status(chess.inCheck() ? 'Sua vez — você está em xeque!' : 'Sua vez.');
  render();
}

function finish() {
  busy = false;
  const bad = notes.filter((n) => n.kind === 'mistake' || n.kind === 'blunder').length;
  status(`${gameOverText()} Erros/capivaradas na partida: ${bad}.`);
  render();
}

async function newGame() {
  busy = true;
  chess = new Chess();
  player = $('color').value;
  selected = null; lastMove = null; hintSquares = []; notes.length = 0;
  opponent.setOption('Skill Level', $('level').value);
  $('feedback').innerHTML = 'Faça seu lance. Após cada jogada, o professor explica se foi bom e o que seria melhor.';
  setEval(0);
  render();
  if (player === 'b') {
    status('Adversário pensando…');
    lastMove = chess.move((await opponent.analyze(chess.fen(), 'go movetime 400')).bestmove);
  }
  busy = false;
  status('Sua vez.');
  render();
}

$('new').onclick = newGame;
$('hint').onclick = async () => {
  busy = true; render();
  status('Procurando a melhor ideia…');
  const { bestmove } = await coach.analyze(chess.fen());
  const m = new Chess(chess.fen()).move(bestmove);
  hintSquares = [m.from];
  $('feedback').innerHTML = `Dica: considere mover ${m.piece === 'p' ? 'o peão' : 'a peça'} de <b>${m.from}</b>${m.captured ? ' — há algo para capturar' : ''}.`;
  busy = false;
  status('Sua vez.');
  render();
};
$('undo').onclick = () => {
  chess.undo(); chess.undo(); notes.pop();
  lastMove = null; hintSquares = []; selected = null;
  $('feedback').textContent = 'Lance desfeito. Tente de novo.';
  render();
};

coach.ready.then(() => newGame());
render();
