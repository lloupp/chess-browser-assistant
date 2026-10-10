import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { parseInfo, toCp, classify, formatEval, hangingPieces, lesson } from '../src/coach.js';

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
