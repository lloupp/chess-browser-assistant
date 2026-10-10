// Pure teaching logic: parses engine output and turns evaluations into lessons.
const PIECE_NAMES = { p: 'peão', n: 'cavalo', b: 'bispo', r: 'torre', q: 'dama', k: 'rei' };
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE_CP = 10000;
const ARTICLE = { p: 'o', n: 'o', b: 'o', r: 'a', q: 'a', k: 'o' };
const the = (t) => `${ARTICLE[t]} ${PIECE_NAMES[t]}`;
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const RAYS = { b: DIAG, r: ORTHO, q: [...DIAG, ...ORTHO] };
const sqName = (f, r) => 'abcdefgh'[f] + (r + 1);

/** Parses a UCI "info" line into { depth, cp, mate, pv } or null. */
export function parseInfo(line) {
  if (!line.startsWith('info') || !line.includes(' score ')) return null;
  const depth = Number(/ depth (\d+)/.exec(line)?.[1] ?? 0);
  const cp = / score cp (-?\d+)/.exec(line);
  const mate = / score mate (-?\d+)/.exec(line);
  const pv = / pv (.+)$/.exec(line)?.[1].split(' ') ?? [];
  return { depth, cp: cp ? Number(cp[1]) : null, mate: mate ? Number(mate[1]) : null, pv };
}

/** Converts a score to centipawns from the side to move's point of view. */
export function toCp({ cp, mate }) {
  if (mate !== null && mate !== undefined) return mate > 0 ? MATE_CP - mate : -MATE_CP - mate;
  return cp;
}

/** Classifies how many centipawns the player lost compared to the best move. */
export function classify(lossCp) {
  if (lossCp <= 20) return { label: 'Ótimo lance', kind: 'best' };
  if (lossCp <= 60) return { label: 'Bom lance', kind: 'good' };
  if (lossCp <= 120) return { label: 'Imprecisão', kind: 'inaccuracy' };
  if (lossCp <= 300) return { label: 'Erro', kind: 'mistake' };
  return { label: 'Capivarada', kind: 'blunder' };
}

/** Formats a centipawn score (white's perspective) for display. */
export function formatEval(cpWhite) {
  if (Math.abs(cpWhite) >= MATE_CP - 500) {
    const n = MATE_CP - Math.abs(cpWhite);
    return `${cpWhite > 0 ? '+' : '-'}M${n}`;
  }
  return `${cpWhite >= 0 ? '+' : ''}${(cpWhite / 100).toFixed(1)}`;
}

/** Lists squares where `color` has a piece attacked and not defended (excluding king). */
export function hangingPieces(chess, color) {
  const enemy = color === 'w' ? 'b' : 'w';
  const out = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || sq.type === 'k') continue;
      const attackers = chess.attackers(sq.square, enemy);
      if (attackers.length === 0) continue;
      const defended = chess.attackers(sq.square, color).length > 0;
      const cheaperAttacker = attackers.some(
        (a) => PIECE_VALUES[chess.get(a).type] < PIECE_VALUES[sq.type],
      );
      if (!defended || cheaperAttacker) out.push({ square: sq.square, type: sq.type });
    }
  }
  return out;
}

/**
 * Enemy pieces the piece on `square` forks: attacked targets that are the king,
 * worth more than the attacker, or undefended. Returns [] unless there are 2+.
 */
export function forkTargets(chess, square) {
  const piece = chess.get(square);
  if (!piece) return [];
  const enemy = piece.color === 'w' ? 'b' : 'w';
  const targets = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== enemy) continue;
      if (!chess.attackers(sq.square, piece.color).includes(square)) continue;
      const valuable = sq.type === 'k' || PIECE_VALUES[sq.type] > PIECE_VALUES[piece.type];
      const loose = chess.attackers(sq.square, enemy).length === 0;
      if (valuable || loose) targets.push({ square: sq.square, type: sq.type });
    }
  }
  const rank = (t) => (t.type === 'k' ? 100 : PIECE_VALUES[t.type]);
  return targets.length >= 2 ? targets.sort((a, b) => rank(b) - rank(a)) : [];
}

/** Pins made by `color`'s sliders: an enemy piece shielding a more valuable piece (or king) behind it. */
export function findPins(chess, color) {
  const pins = [];
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq || sq.color !== color || !RAYS[sq.type]) continue;
      const f0 = sq.square.charCodeAt(0) - 97;
      const r0 = Number(sq.square[1]) - 1;
      for (const [df, dr] of RAYS[sq.type]) {
        let first = null;
        for (let f = f0 + df, r = r0 + dr; f >= 0 && f < 8 && r >= 0 && r < 8; f += df, r += dr) {
          const p = chess.get(sqName(f, r));
          if (!p) continue;
          if (p.color === color) break;
          if (!first) {
            if (p.type === 'k') break;
            first = { square: sqName(f, r), type: p.type };
            continue;
          }
          if (p.type === 'k' || PIECE_VALUES[p.type] > PIECE_VALUES[first.type]) {
            pins.push({ by: sq.square, pinned: first, behind: { square: sqName(f, r), type: p.type } });
          }
          break;
        }
      }
    }
  }
  return pins;
}

/** Opening principle the move breaks (first 10 moves), or null. */
export function openingAdvice(played, moveNumber) {
  if (moveNumber > 10) return null;
  if (played.piece === 'q' && moveNumber <= 5 && !played.captured) {
    return 'Princípio de abertura: evite sair com a dama cedo; ela vira alvo e você perde tempo.';
  }
  if (played.piece === 'k' && !played.san.startsWith('O-O')) {
    return 'Princípio de abertura: mantenha o rei seguro e procure rocar.';
  }
  if (played.piece === 'p' && /^[ah]/.test(played.from) && !played.captured) {
    return 'Princípio de abertura: prefira desenvolver cavalos e bispos e ocupar o centro a mexer peões da borda.';
  }
  return null;
}

/** Short description of the tactic (fork or new pin) a move creates, or ''. */
export function describeTactic(move, posAfter, posBefore) {
  const fork = forkTargets(posAfter, move.to);
  if (fork.length) return `um garfo em ${fork.map((t) => PIECE_NAMES[t.type]).join(' e ')}`;
  const before = new Set(findPins(posBefore, move.color).map((p) => p.pinned.square));
  const pin = findPins(posAfter, move.color).find((p) => p.by === move.to && !before.has(p.pinned.square));
  if (pin) return `cravando ${the(pin.pinned.type)} em ${pin.pinned.square} ${pin.behind.type === 'k' ? 'no' : 'contra ' + ARTICLE[pin.behind.type]} ${PIECE_NAMES[pin.behind.type]}`;
  return '';
}

/**
 * Builds the lesson for the player's move.
 * @param {object} p
 * @param {number} p.bestCp   eval (player's view) of the best move
 * @param {number} p.playedCp eval (player's view) after the played move
 * @param {object} p.played   chess.js move object of the played move
 * @param {object|null} p.best chess.js move object of the engine's best move
 * @param {number|null} p.bestMate mate-in-N available before the move (player's view)
 * @param {import('chess.js').Chess} p.after position after the played move
 * @param {import('chess.js').Chess} [p.before] position before the move (enables tactic/opening notes)
 * @param {import('chess.js').Chess} [p.afterBest] position after the best move
 */
export function lesson({ bestCp, playedCp, played, best, bestMate, after, before, afterBest }) {
  const loss = Math.max(0, bestCp - playedCp);
  const verdict = classify(loss);
  const tips = [];
  const sameMove = best && best.lan === played.lan;

  if (!sameMove && verdict.kind !== 'best' && verdict.kind !== 'good') {
    if (bestMate && bestMate > 0) tips.push(`Havia mate em ${bestMate} começando com ${best.san}.`);
    else if (best) {
      let why = '';
      const tactic = afterBest && before ? describeTactic(best, afterBest, before) : '';
      if (tactic) why = `, ${tactic}`;
      else if (best.captured) why = `, capturando ${PIECE_NAMES[best.captured]}`;
      else if (best.san.includes('+')) why = ', dando xeque';
      tips.push(`Melhor era ${best.san}${why}.`);
    }
    const hanging = hangingPieces(after, played.color);
    if (hanging.length) {
      const h = hanging[0];
      tips.push(`Atenção: ${ARTICLE[h.type] === 'a' ? 'sua' : 'seu'} ${PIECE_NAMES[h.type]} em ${h.square} pode ser capturad${ARTICLE[h.type]} com vantagem.`);
    }
    const isOpening = before && before.board().flat().filter(Boolean).length >= 24;
    const advice = isOpening ? openingAdvice(played, before.moveNumber()) : null;
    if (advice) tips.push(advice);
  } else if (sameMove) {
    tips.push('Foi exatamente o lance que o motor escolheria.');
  }
  if (before && (verdict.kind === 'best' || verdict.kind === 'good')) {
    const tactic = describeTactic(played, after, before);
    if (tactic) tips.push(`Boa tática: ${tactic}!`);
  }
  if (played.captured && verdict.kind === 'best') tips.push(`Boa captura de ${PIECE_NAMES[played.captured]}.`);

  return { ...verdict, loss, text: tips.join(' ') };
}

export { PIECE_NAMES };

/** Picks the player's costliest moves (inaccuracy or worse), worst first. */
export function worstMoves(notes, limit = 5) {
  return notes
    .filter((n) => n.kind === 'inaccuracy' || n.kind === 'mistake' || n.kind === 'blunder')
    .sort((a, b) => b.loss - a.loss)
    .slice(0, limit);
}
