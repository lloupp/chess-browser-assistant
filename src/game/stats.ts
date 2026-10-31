import type { Chess } from 'chess.js';
import type { Color } from '../types';
import type { DifficultyId } from './config';

export const STATS_KEY='xadrez-local.stats.v1';

export type Outcome='win'|'draw'|'loss';
export interface ResultRecord { win:number; draw:number; loss:number }
export interface PlayerStats { records:Partial<Record<DifficultyId,ResultRecord>>; lastGameId?:string }

export function outcomeFor(game:Chess,side:Color,timeoutWinner?:Color):Outcome|undefined {
  if(timeoutWinner) return timeoutWinner===side?'win':'loss';
  if(game.isCheckmate()) return game.turn()===side?'loss':'win';
  if(game.isDraw()) return 'draw';
  return undefined;
}

function count(value:unknown){return typeof value==='number'&&Number.isInteger(value)&&value>=0?value:0;}

export function normalizeStats(value:unknown):PlayerStats {
  const raw=(value&&typeof value==='object'?value:{}) as Partial<PlayerStats>;
  const records:PlayerStats['records']={};
  if(raw.records&&typeof raw.records==='object'){
    for(const [id,rec] of Object.entries(raw.records)){
      const r=(rec??{}) as Partial<ResultRecord>;
      records[id as DifficultyId]={win:count(r.win),draw:count(r.draw),loss:count(r.loss)};
    }
  }
  return {records,...(typeof raw.lastGameId==='string'?{lastGameId:raw.lastGameId}:{})};
}

// Each game id is counted once, even if the final position is reached again after an undo.
export function withOutcome(stats:PlayerStats,level:DifficultyId,outcome:Outcome,gameId:string):PlayerStats {
  if(stats.lastGameId===gameId) return stats;
  const current=stats.records[level]??{win:0,draw:0,loss:0};
  return {records:{...stats.records,[level]:{...current,[outcome]:current[outcome]+1}},lastGameId:gameId};
}

export function formatRecord(record:ResultRecord|undefined):string {
  const r=record??{win:0,draw:0,loss:0};
  return r.win+'V · '+r.draw+'E · '+r.loss+'D';
}

export function loadStats(storage:Pick<Storage,'getItem'>=localStorage):PlayerStats {
  try { return normalizeStats(JSON.parse(storage.getItem(STATS_KEY)??'{}')); }
  catch { return normalizeStats({}); }
}

export function saveStats(stats:PlayerStats,storage:Pick<Storage,'setItem'>=localStorage) {
  try { storage.setItem(STATS_KEY,JSON.stringify(stats)); } catch { /* storage full or unavailable */ }
}
