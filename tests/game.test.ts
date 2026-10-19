import {describe,it,expect} from 'vitest';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import {DIFFICULTIES,engineOptions,timeControl} from '../src/game/config';
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
