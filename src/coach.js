// Pure teaching logic: parses engine output and turns evaluations into lessons.
const PIECE_NAMES = { p: 'peão', n: 'cavalo', b: 'bispo', r: 'torre', q: 'dama', k: 'rei' };
const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const MATE_CP = 10000;

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
 * Builds the lesson for the player's move.
 * @param {object} p
 * @param {number} p.bestCp   eval (player's view) of the best move
 * @param {number} p.playedCp eval (player's view) after the played move
 * @param {object} p.played   chess.js move object of the played move
 * @param {object|null} p.best chess.js move object of the engine's best move
 * @param {number|null} p.bestMate mate-in-N available before the move (player's view)
 * @param {import('chess.js').Chess} p.after position after the played move
 */
export function lesson({ bestCp, playedCp, played, best, bestMate, after }) {
  const loss = Math.max(0, bestCp - playedCp);
  const verdict = classify(loss);
  const tips = [];
  const sameMove = best && best.lan === played.lan;

  if (!sameMove && verdict.kind !== 'best' && verdict.kind !== 'good') {
    if (bestMate && bestMate > 0) tips.push(`Havia mate em ${bestMate} começando com ${best.san}.`);
    else if (best) {
      let why = '';
      if (best.captured) why = `, capturando ${PIECE_NAMES[best.captured]}`;
      else if (best.san.includes('+')) why = ', dando xeque';
      tips.push(`Melhor era ${best.san}${why}.`);
    }
    const hanging = hangingPieces(after, played.color);
    if (hanging.length) {
      const h = hanging[0];
      tips.push(`Atenção: seu ${PIECE_NAMES[h.type]} em ${h.square} pode ser capturado com vantagem.`);
    }
  } else if (sameMove) {
    tips.push('Foi exatamente o lance que o motor escolheria.');
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
