import {describe,it,expect} from 'vitest';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import {OPENING_LINES,openingName} from '../src/game/openings';
import {materialSummary} from '../src/game/material';
import {formatRecord,normalizeStats,outcomeFor,withOutcome} from '../src/game/stats';
import {moveAccuracy,whiteScore,winPercent} from '../src/game/review';
import {threatFen} from '../src/chess/position';
import {normalizeSnapshot} from '../src/game/persistence';

describe('opening names',()=>{
  it('contains only legal lines from the initial position',()=>{
    for(const line of OPENING_LINES){
      const game=new Chess();
      expect(()=>line.moves.forEach(san=>game.move(san)),line.name).not.toThrow();
    }
  });
  it('picks the longest matching line',()=>{
    expect(openingName([])).toBeUndefined();
    expect(openingName(['e4','c5'])).toBe('Defesa Siciliana');
    expect(openingName(['e4','e5','Nf3','Nc6','Bb5','a6','Ba4'])).toBe('Espanhola: Variante Morphy');
    expect(openingName(['d4','Nf6','c4','c5','d5','b5'])).toBe('Gambito Benko');
    expect(openingName(['a3'])).toBeUndefined();
  });
});

describe('material summary',()=>{
  it('lists captured pieces and the balance',()=>{
    const game=new Chess();
    for(const san of ['e4','d5','exd5','Qxd5','Nc3','Qe5+']) game.move(san);
    expect(materialSummary(game,DEFAULT_POSITION)).toEqual({capturedBy:{w:['p'],b:['p']},advantage:0});
    for(const san of ['Be2','Qxe2+','Qxe2']) game.move(san);
    const summary=materialSummary(game,DEFAULT_POSITION);
    expect(summary.capturedBy.w).toEqual(['q','p']);
    expect(summary.capturedBy.b).toEqual(['b','p']);
    expect(summary.advantage).toBe(6);
  });
  it('uses the starting FEN as baseline',()=>{
    const fen='4k3/8/8/8/8/8/8/R3K3 w - - 0 1';
    expect(materialSummary(new Chess(fen),fen)).toEqual({capturedBy:{w:[],b:[]},advantage:5});
  });
});

describe('local record',()=>{
  it('detects the outcome from the player point of view',()=>{
    const mate=new Chess();
    for(const san of ['f3','e5','g4','Qh4#']) mate.move(san);
    expect(outcomeFor(mate,'b')).toBe('win');
    expect(outcomeFor(mate,'w')).toBe('loss');
    expect(outcomeFor(new Chess(),'w')).toBeUndefined();
    expect(outcomeFor(new Chess(),'w','w')).toBe('win');
    expect(outcomeFor(new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'),'w')).toBe('draw');
  });
  it('counts each game once and survives corrupt data',()=>{
    let stats=normalizeStats({records:{beginner:{win:'x',draw:2}}});
    expect(stats.records.beginner).toEqual({win:0,draw:2,loss:0});
    stats=withOutcome(stats,'beginner','win','g1');
    stats=withOutcome(stats,'beginner','win','g1');
    stats=withOutcome(stats,'master','loss','g2');
    expect(formatRecord(stats.records.beginner)).toBe('1V · 2E · 0D');
    expect(formatRecord(stats.records.master)).toBe('0V · 0E · 1D');
    expect(formatRecord(undefined)).toBe('0V · 0E · 0D');
  });
  it('keeps the game id in saved snapshots',()=>{
    expect(normalizeSnapshot({startFen:DEFAULT_POSITION,moves:[],id:'abc'})?.id).toBe('abc');
    expect(normalizeSnapshot({startFen:DEFAULT_POSITION,moves:[],id:7})?.id).toBeUndefined();
  });
});

describe('accuracy and evaluation bar',()=>{
  it('maps scores to win chances and accuracy',()=>{
    expect(winPercent(0)).toBeCloseTo(50);
    expect(winPercent(1000)).toBeGreaterThan(95);
    expect(moveAccuracy({type:'cp',value:30},{type:'cp',value:-30})).toBeGreaterThan(99);
    expect(moveAccuracy({type:'cp',value:30},{type:'cp',value:500})!).toBeLessThan(30);
    expect(moveAccuracy(undefined,{type:'cp',value:0})).toBeUndefined();
  });
  it('converts engine scores to White perspective',()=>{
    expect(whiteScore({type:'cp',value:120},'b')).toEqual({type:'cp',value:-120});
    expect(whiteScore({type:'mate',value:2},'w')).toEqual({type:'mate',value:2});
  });
});

describe('opponent threat',()=>{
  it('passes the turn to the opponent and clears en passant',()=>{
    const game=new Chess();game.move('e4');
    expect(threatFen(game.fen())).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
  });
  it('refuses when the side to move is in check',()=>{
    expect(threatFen('7k/8/8/8/8/8/8/rK6 w - - 0 1')).toBeUndefined();
  });
});
