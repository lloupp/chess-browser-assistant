import type { Color } from '../types';

export type DifficultyId='beginner'|'casual'|'intermediate'|'strong'|'master';
export type OpponentStyle='precise'|'human';
export type GameMode='play'|'practice';
export type TimeControlId='none'|'blitz'|'rapid'|'classic';

export interface DifficultyProfile {
  id:DifficultyId;
  label:string;
  elo:number;
  skill:number;
  depth:number;
  moveTime:number;
}

export interface TimeControl {
  id:TimeControlId;
  label:string;
  initialMs:number;
  incrementMs:number;
}

export const DIFFICULTIES:Record<DifficultyId,DifficultyProfile>={
  beginner:{id:'beginner',label:'Iniciante · ~1320',elo:1320,skill:1,depth:6,moveTime:350},
  casual:{id:'casual',label:'Casual · ~1450',elo:1450,skill:4,depth:8,moveTime:500},
  intermediate:{id:'intermediate',label:'Intermediário · ~1750',elo:1750,skill:8,depth:10,moveTime:800},
  strong:{id:'strong',label:'Forte · ~2100',elo:2100,skill:13,depth:13,moveTime:1200},
  master:{id:'master',label:'Mestre · ~2500',elo:2500,skill:18,depth:16,moveTime:1800}
};

export const TIME_CONTROLS:Record<TimeControlId,TimeControl>={
  none:{id:'none',label:'Sem relógio',initialMs:0,incrementMs:0},
  blitz:{id:'blitz',label:'5 min',initialMs:5*60_000,incrementMs:0},
  rapid:{id:'rapid',label:'10 min',initialMs:10*60_000,incrementMs:0},
  classic:{id:'classic',label:'15 + 10',initialMs:15*60_000,incrementMs:10_000}
};

export function difficulty(value:unknown):DifficultyProfile {
  return typeof value==='string' && value in DIFFICULTIES
    ? DIFFICULTIES[value as DifficultyId]
    : DIFFICULTIES.intermediate;
}

export function timeControl(value:unknown):TimeControl {
  return typeof value==='string' && value in TIME_CONTROLS
    ? TIME_CONTROLS[value as TimeControlId]
    : TIME_CONTROLS.none;
}

export function normalizedSide(value:unknown):Color { return value==='b'?'b':'w'; }
export function normalizedStyle(value:unknown):OpponentStyle { return value==='human'?'human':'precise'; }
export function normalizedMode(value:unknown):GameMode { return value==='practice'?'practice':'play'; }

export function engineOptions(profile:DifficultyProfile,style:OpponentStyle):Record<string,string|number|boolean> {
  if (style==='human') {
    return {'UCI_LimitStrength':false,'Skill Level':profile.skill};
  }
  return {'UCI_LimitStrength':true,'UCI_Elo':profile.elo};
}
