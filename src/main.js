import { Chess } from 'chess.js';
import { Engine } from './engine.js';
import { lesson, formatEval, worstMoves } from './coach.js';

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
const notes = []; // lesson per player move: { fen, san, bestSan, kind, label, text, loss }
let practice = null; // { fen, bestSan } while retrying a position from the review

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
      board.appendChild(el);
    }
  }
  // Pair moves into numbered rows, honoring the move number and side to move of the starting FEN.
  const hist = chess.history({ verbose: true });
  const start = new Chess(hist.length ? hist[0].before : chess.fen());
  const sans = hist.map((m) => m.san);
  const rows = start.turn() === 'b' ? ['…', ...sans] : sans;
  const ol = $('history');
  ol.innerHTML = '';
  ol.start = start.moveNumber();
  for (let i = 0; i < rows.length; i += 2) {
    const li = document.createElement('li');
    li.textContent = `${rows[i]} ${rows[i + 1] ?? ''}`;
    ol.appendChild(li);
  }
  $('undo').disabled = busy || !!practice || chess.history().length < 2;
  $('review-btn').disabled = busy || notes.length === 0;
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

async function onSquare(sq) {
  if (busy || chess.turn() !== player || chess.isGameOver()) return;
  const piece = chess.get(sq);
  if (selected) {
    const move = chess.moves({ square: selected, verbose: true }).find((m) => m.to === sq);
    if (move) {
      const from = selected;
      const promotion = move.promotion ? await choosePromotion() : undefined;
      return playerMove({ from, to: sq, promotion });
    }
  }
  selected = piece && piece.color === player ? sq : null;
  render();
}

function choosePromotion() {
  const box = $('promo');
  box.hidden = false;
  return new Promise((resolve) => {
    box.querySelectorAll('button').forEach((b) => {
      b.onclick = () => { box.hidden = true; resolve(b.dataset.piece); };
    });
  });
}

/** Plays the player's move and returns the coach's lesson for it. */
async function grade(m) {
  const before = chess.fen();
  const bestInfo = await coach.analyze(before);
  const played = chess.move(m);
  lastMove = played;
  render();

  let playedCp;
  if (chess.isCheckmate()) playedCp = 10000;
  else if (chess.isDraw()) playedCp = 0;
  else playedCp = -(await coach.analyze(chess.fen())).cp;

  const afterBest = new Chess(before);
  const best = bestInfo.bestmove ? afterBest.move(bestInfo.bestmove) : null;
  const l = lesson({
    bestCp: bestInfo.cp, playedCp, played, best, bestMate: bestInfo.mate,
    after: new Chess(chess.fen()), before: new Chess(before), afterBest,
  });
  setEval(player === 'w' ? playedCp : -playedCp);
  return { ...l, fen: before, san: played.san, bestSan: best?.san ?? null };
}

function showLesson(l) {
  $('feedback').innerHTML = `<span class="tag ${l.kind}">${l.san}: ${l.label}</span> <span>${l.text}</span>`;
}

async function playerMove(m) {
  busy = true;
  selected = null;
  hintSquares = [];
  render();
  status('Professor analisando seu lance…');
  const l = await grade(m);
  showLesson(l);
  if (practice) return practiceResult(l);
  notes.push(l);

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
  showReview();
  render();
}

/** Lists the costliest moves; each can be replayed from the position before it. */
function showReview() {
  const worst = worstMoves(notes);
  const box = $('review');
  box.hidden = false;
  if (!worst.length) {
    box.innerHTML = '<h2>Revisão</h2><p>Nenhum erro relevante nesta partida. Parabéns!</p>';
    return;
  }
  box.innerHTML = '<h2>Revisão — tente de novo</h2><ul></ul>';
  for (const n of worst) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.textContent = 'Refazer';
    btn.onclick = () => startPractice(n);
    li.innerHTML = `<span class="tag ${n.kind}">${n.san}</span> ${n.label} `;
    li.appendChild(btn);
    box.querySelector('ul').appendChild(li);
  }
}

function startPractice(n) {
  practice = n;
  chess = new Chess(n.fen);
  selected = null; lastMove = null; hintSquares = [];
  $('feedback').textContent = `Nesta posição você jogou ${n.san}. Encontre um lance melhor.`;
  status('Treino: sua vez.');
  render();
}

function practiceResult(l) {
  busy = false;
  if (l.kind === 'best' || l.kind === 'good') {
    status(`Acertou! (${practice.bestSan ? `o motor jogaria ${practice.bestSan}` : 'boa escolha'})`);
  } else {
    chess = new Chess(practice.fen);
    lastMove = null;
    status('Ainda não. Tente outro lance (ou use a Dica).');
  }
  render();
}

/** Start position: optional ?fen=... in the URL (e.g. to practice an endgame), else the standard one. */
function startPosition() {
  const fen = new URLSearchParams(location.search).get('fen');
  if (fen) {
    try { return new Chess(fen); } catch { return null; }
  }
  return new Chess();
}

async function newGame() {
  busy = true;
  chess = startPosition();
  const badFen = !chess;
  chess ??= new Chess();
  player = $('color').value;
  selected = null; lastMove = null; hintSquares = []; notes.length = 0; practice = null;
  $('review').hidden = true;
  opponent.setOption('Skill Level', $('level').value);
  $('feedback').textContent = badFen
    ? 'FEN inválida na URL; começando da posição inicial.'
    : 'Faça seu lance. Após cada jogada, o professor explica se foi bom e o que seria melhor.';
  setEval(0);
  render();
  if (chess.isGameOver()) return finish();
  if (chess.turn() !== player) {
    status('Adversário pensando…');
    lastMove = chess.move((await opponent.analyze(chess.fen(), 'go movetime 400')).bestmove);
  }
  busy = false;
  status('Sua vez.');
  render();
}

// Pointer input: a tap acts as a click (select / move); pressing a piece and moving drags it.
let drag = null; // { from, x, y, ghost }
const squareAt = (x, y) => document.elementFromPoint(x, y)?.closest('#board .sq')?.dataset.square;

$('board').addEventListener('pointerdown', (e) => {
  const from = e.target.closest('.sq')?.dataset.square;
  const piece = from && chess.get(from);
  if (busy || chess.turn() !== player || chess.isGameOver() || !piece || piece.color !== player) return;
  drag = { from, x: e.clientX, y: e.clientY, ghost: null };
});
window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
    const src = document.querySelector(`[data-square="${drag.from}"]`);
    drag.ghost = src.cloneNode(true);
    drag.ghost.className = `ghost ${src.classList.contains('pw') ? 'pw' : 'pb'}`;
    drag.ghost.style.fontSize = getComputedStyle(src).fontSize;
    document.body.appendChild(drag.ghost);
    src.classList.add('dragging');
    selected = drag.from;
  }
  drag.ghost.style.left = `${e.clientX}px`;
  drag.ghost.style.top = `${e.clientY}px`;
});
window.addEventListener('pointerup', (e) => {
  const target = squareAt(e.clientX, e.clientY);
  const wasDrag = drag?.ghost;
  if (wasDrag) {
    drag.ghost.remove();
    selected = drag.from;
  }
  drag = null;
  if (target && (!wasDrag || target !== selected)) onSquare(target);
  else if (wasDrag) render();
});

$('new').onclick = newGame;
$('review-btn').onclick = showReview;
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
