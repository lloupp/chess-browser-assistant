import {describe,it,expect} from 'vitest';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import {DIFFICULTIES,engineOptions,normalizedMode,timeControl} from '../src/game/config';
import {explainPlayedMove,gamePhase,guidanceFor} from '../src/game/coach';
import {normalizeSnapshot,replay,type GameSnapshot} from '../src/game/persistence';
import {centipawnLoss,grade,scoreToCp} from '../src/game/review';

describe('game configuration',()=>{
  it('maps real-strength profiles to safe UCI options',()=>{
    expect(DIFFICULTIES.beginner.elo).toBeGreaterThanOrEqual(1320);
    expect(DIFFICULTIES.master.elo).toBeGreaterThan(DIFFICULTIES.intermediate.elo);
    expect(engineOptions(DIFFICULTIES.intermediate,'precise')).toEqual({'UCI_LimitStrength':true,'UCI_Elo':1750});
    expect(engineOptions(DIFFICULTIES.intermediate,'human')).toEqual({'UCI_LimitStrength':false,'Skill Level':8});
    expect(timeControl('classic').incrementMs).toBe(10000);
  });
});

describe('game persistence',()=>{
  it('replays a persisted game without inventing state',()=>{
    const game=new Chess();game.move('e4');game.move('e5');
    const snapshot:GameSnapshot={version:2,startFen:DEFAULT_POSITION,moves:game.history(),side:'w',difficulty:'intermediate',style:'precise',mode:'play',timeControl:'none',whiteMs:0,blackMs:0,savedAt:1};
    expect(replay(snapshot).fen()).toBe(game.fen());
  });
  it('rejects corrupt move history and normalizes settings',()=>{
    expect(normalizeSnapshot({version:2,startFen:DEFAULT_POSITION,moves:['not-a-move']})).toBeUndefined();
    const normalized=normalizeSnapshot({version:2,startFen:DEFAULT_POSITION,moves:[],side:'wrong',difficulty:'unknown',style:'other',mode:'other',timeControl:'weird'});
    expect(normalized?.side).toBe('w');
    expect(normalized?.difficulty).toBe('intermediate');
  });
});

describe('post-game review',()=>{
  it('normalizes cp and mate scores and grades loss',()=>{
    expect(scoreToCp({type:'cp',value:42})).toBe(42);
    expect(scoreToCp({type:'mate',value:3})).toBeGreaterThan(90000);
    expect(centipawnLoss({type:'cp',value:50},{type:'cp',value:-20})).toBe(30);
    expect(grade(20)).toBe('Excelente');
    expect(grade(500)).toBe('Erro grave');
  });
});

describe('guided chess lessons',()=>{
  it('normalizes and persists guided mode while keeping other modes',()=>{
    expect(normalizedMode('guided')).toBe('guided');
    expect(normalizedMode('practice')).toBe('practice');
    expect(normalizedMode('play')).toBe('play');
    expect(normalizedMode('unknown')).toBe('play');
    const restored=normalizeSnapshot({
      version:2,startFen:DEFAULT_POSITION,moves:['e4','e5'],side:'w',
      difficulty:'beginner',style:'precise',mode:'guided',timeControl:'none'
    });
    expect(restored?.mode).toBe('guided');
    expect(restored && replay(restored).history()).toEqual(['e4','e5']);
  });
  it('teaches opening, check response and an endgame without an online service',()=>{
    const opening=new Chess();
    expect(gamePhase(opening)).toBe('Abertura');
    expect(guidanceFor(opening,'w').goal).toContain('centro');
    const inCheck=new Chess('7k/8/8/8/8/8/8/rK6 w - - 0 1');
    expect(guidanceFor(inCheck,'w').goal).toBe('Sair do xeque');
    const ending=new Chess('7k/8/8/8/8/8/8/K7 w - - 0 1');
    expect(gamePhase(ending)).toBe('Final');
    expect(guidanceFor(ending,'w').goal).toContain('rei');
  });
  it('offers justified feedback and an alternative only when analyzed',()=>{
    const game=new Chess();
    const before=game.fen();
    const played=game.move('e4');
    expect(explainPlayedMove(played,before,10)).toContain('Excelente: e4');
    expect(explainPlayedMove(played,before,210,'d4')).toContain('Stockfish sugere d4');
    expect(explainPlayedMove(played,before,undefined)).toContain('avaliação numérica não ficou disponível');
  });
});
