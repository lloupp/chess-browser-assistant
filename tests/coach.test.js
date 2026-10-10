import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { parseInfo, toCp, classify, formatEval, hangingPieces, lesson, worstMoves, forkTargets, findPins, openingAdvice, describeTactic } from '../src/coach.js';

describe('parseInfo', () => {
  it('reads cp score and pv', () => {
    const i = parseInfo('info depth 12 seldepth 18 multipv 1 score cp -34 nodes 1 pv e7e5 g1f3');
    expect(i).toEqual({ depth: 12, cp: -34, mate: null, pv: ['e7e5', 'g1f3'] });
  });
  it('reads mate score', () => {
    expect(parseInfo('info depth 5 score mate 2 pv d8h4').mate).toBe(2);
  });
  it('ignores non-score lines', () => {
    expect(parseInfo('info string NNUE loaded')).toBeNull();
    expect(parseInfo('bestmove e2e4')).toBeNull();
  });
});

describe('toCp / classify / formatEval', () => {
  it('ranks shorter mates higher', () => {
    expect(toCp({ cp: null, mate: 1 })).toBeGreaterThan(toCp({ cp: null, mate: 3 }));
    expect(toCp({ cp: null, mate: -1 })).toBeLessThan(-9000);
  });
  it('classifies by centipawn loss', () => {
    expect(classify(0).kind).toBe('best');
    expect(classify(50).kind).toBe('good');
    expect(classify(100).kind).toBe('inaccuracy');
    expect(classify(200).kind).toBe('mistake');
    expect(classify(900).kind).toBe('blunder');
  });
  it('formats evals', () => {
    expect(formatEval(125)).toBe('+1.3');
    expect(formatEval(-40)).toBe('-0.4');
    expect(formatEval(toCp({ mate: 2 }))).toBe('+M2');
  });
});

describe('hangingPieces', () => {
  it('finds an undefended attacked piece', () => {
    const c = new Chess('4k3/8/8/3q4/8/8/3R4/K7 w - - 0 1'); // rook d2 attacked by queen d5, undefended
    expect(hangingPieces(c, 'w')).toEqual([{ square: 'd2', type: 'r' }]);
  });
  it('flags a piece attacked by a cheaper piece even if defended', () => {
    const c = new Chess('4k3/8/2p5/3Q4/8/8/8/3RK3 w - - 0 1');
    expect(hangingPieces(c, 'w').map((h) => h.square)).toContain('d5');
  });
  it('is empty in the start position', () => {
    expect(hangingPieces(new Chess(), 'w')).toEqual([]);
  });
});

describe('lesson', () => {
  it('praises the engine move', () => {
    const c = new Chess();
    const played = c.move('e4');
    const best = new Chess().move('e4');
    const l = lesson({ bestCp: 30, playedCp: 30, played, best, bestMate: null, after: c });
    expect(l.kind).toBe('best');
    expect(l.text).toMatch(/exatamente/);
  });
  it('explains a blunder: missed capture and hanging piece', () => {
    const fen = '4k3/8/8/3q4/8/8/3R4/K7 w - - 0 1';
    const c = new Chess(fen);
    const bad = c.move('Rd4'); // rook stays attacked by the queen, undefended
    const best = new Chess(fen).move('Rxd5');
    const l = lesson({ bestCp: 900, playedCp: -500, played: bad, best, bestMate: null, after: c });
    expect(l.kind).toBe('blunder');
    expect(l.text).toContain('Melhor era Rxd5, capturando dama');
    expect(l.text).toContain('torre em d4');
  });
  it('mentions an available mate', () => {
    const fen = '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1';
    const c = new Chess(fen);
    const played = c.move('Kf2');
    const best = new Chess(fen).move('Ra8#');
    const l = lesson({ bestCp: 9999, playedCp: 0, played, best, bestMate: 1, after: c });
    expect(l.text).toContain('Havia mate em 1 começando com Ra8#');
  });
});

describe('worstMoves', () => {
  it('keeps only costly moves, worst first, limited', () => {
    const notes = [
      { kind: 'best', loss: 0 }, { kind: 'mistake', loss: 200 },
      { kind: 'blunder', loss: 700 }, { kind: 'inaccuracy', loss: 90 }, { kind: 'good', loss: 40 },
    ];
    expect(worstMoves(notes).map((n) => n.loss)).toEqual([700, 200, 90]);
    expect(worstMoves(notes, 1)).toHaveLength(1);
  });
});

describe('tactics', () => {
  it('detects a knight fork of king and rook', () => {
    const c = new Chess('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1');
    const m = c.move('Nc7+');
    expect(forkTargets(c, 'c7').map((t) => t.type).sort()).toEqual(['k', 'r']);
    expect(describeTactic(m, c, new Chess('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'))).toBe('um garfo em rei e torre');
  });
  it('does not call a single attack a fork', () => {
    const c = new Chess('4k3/8/8/3N4/8/8/8/4K3 w - - 0 1');
    c.move('Nc7+');
    expect(forkTargets(c, 'c7')).toEqual([]);
  });
  it('detects a new pin against the king', () => {
    const fen = '4k3/8/2n5/8/8/8/8/4KB2 w - - 0 1';
    const c = new Chess(fen);
    const m = c.move('Bb5');
    expect(findPins(c, 'w')).toEqual([{ by: 'b5', pinned: { square: 'c6', type: 'n' }, behind: { square: 'e8', type: 'k' } }]);
    expect(describeTactic(m, c, new Chess(fen))).toBe('cravando o cavalo em c6 no rei');
  });
  it('ignores a slider behind a less valuable piece', () => {
    const c = new Chess('4k3/8/2q5/8/p7/8/8/R3K3 w - - 0 1'); // rook a1 -> pawn a4 -> nothing valuable
    expect(findPins(c, 'w')).toEqual([]);
  });
});

describe('openingAdvice', () => {
  const mv = (fen, san) => new Chess(fen).move(san);
  const e4e5 = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  it('flags an early queen sortie', () => {
    expect(openingAdvice(mv(e4e5, 'Qh5'), 2)).toMatch(/dama cedo/);
  });
  it('flags a king walk but not castling', () => {
    expect(openingAdvice(mv(e4e5, 'Ke2'), 2)).toMatch(/rocar/);
    const castle = mv('rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'O-O');
    expect(openingAdvice(castle, 4)).toBeNull();
  });
  it('flags rim pawn moves, not central development', () => {
    expect(openingAdvice(mv(e4e5, 'h4'), 2)).toMatch(/borda/);
    expect(openingAdvice(mv(e4e5, 'Nf3'), 2)).toBeNull();
  });
  it('is silent after move 10', () => {
    expect(openingAdvice(mv(e4e5, 'Qh5'), 11)).toBeNull();
  });
});

describe('lesson with tactics', () => {
  it('names the missed fork', () => {
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
    const after = new Chess(fen);
    const played = after.move('Kd2');
    const afterBest = new Chess(fen);
    const best = afterBest.move('Nc7+');
    const l = lesson({ bestCp: 500, playedCp: 0, played, best, bestMate: null, after, before: new Chess(fen), afterBest });
    expect(l.text).toContain('Melhor era Nc7+, um garfo em rei e torre.');
  });
  it('praises a fork the player found', () => {
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
    const after = new Chess(fen);
    const played = after.move('Nc7+');
    const l = lesson({ bestCp: 500, playedCp: 500, played, best: played, bestMate: null, after, before: new Chess(fen), afterBest: after });
    expect(l.text).toContain('Boa tática: um garfo em rei e torre!');
  });
  it('adds an opening principle to a costly early queen move', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
    const after = new Chess(fen);
    const played = after.move('Qh5');
    const afterBest = new Chess(fen);
    const best = afterBest.move('Nf3');
    const l = lesson({ bestCp: 40, playedCp: -60, played, best, bestMate: null, after, before: new Chess(fen), afterBest });
    expect(l.kind).toBe('inaccuracy');
    expect(l.text).toMatch(/dama cedo/);
  });
});

describe('lesson outside the opening', () => {
  it('gives no opening advice in an endgame, even at move 1', () => {
    const fen = 'r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1';
    const after = new Chess(fen);
    const played = after.move('Kd2');
    const l = lesson({ bestCp: 500, playedCp: 0, played, best: null, bestMate: null, after, before: new Chess(fen) });
    expect(l.text).not.toMatch(/Princípio/);
  });
});
