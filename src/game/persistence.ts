import { Chess, DEFAULT_POSITION } from 'chess.js';
import type { Color } from '../types';
import {
  difficulty,
  normalizedMode,
  normalizedSide,
  normalizedStyle,
  timeControl,
  type DifficultyId,
  type GameMode,
  type OpponentStyle,
  type TimeControlId
} from './config';

export const STORAGE_KEY='xadrez-local.game.v2';

export interface GameSnapshot {
  version:2;
  startFen:string;
  moves:string[];
  side:Color;
  difficulty:DifficultyId;
  style:OpponentStyle;
  mode:GameMode;
  timeControl:TimeControlId;
  whiteMs:number;
  blackMs:number;
  timeoutWinner?:Color;
  savedAt:number;
}

function finiteMs(value:unknown,fallback:number) {
  return typeof value==='number' && Number.isFinite(value) && value>=0 ? Math.round(value) : fallback;
}

export function replay(snapshot:GameSnapshot):Chess {
  const game=new Chess(snapshot.startFen);
  for (const san of snapshot.moves) game.move(san);
  return game;
}

export function normalizeSnapshot(value:unknown):GameSnapshot|undefined {
  if (!value || typeof value!=='object') return undefined;
  const raw=value as Partial<GameSnapshot>;
  const startFen=typeof raw.startFen==='string'?raw.startFen:DEFAULT_POSITION;
  const moves=Array.isArray(raw.moves) && raw.moves.every(move=>typeof move==='string') ? raw.moves : [];
  const profile=difficulty(raw.difficulty);
  const clock=timeControl(raw.timeControl);
  const snapshot:GameSnapshot={
    version:2,
    startFen,
    moves:moves as string[],
    side:normalizedSide(raw.side),
    difficulty:profile.id,
    style:normalizedStyle(raw.style),
    mode:normalizedMode(raw.mode),
    timeControl:clock.id,
    whiteMs:finiteMs(raw.whiteMs,clock.initialMs),
    blackMs:finiteMs(raw.blackMs,clock.initialMs),
    ...(raw.timeoutWinner==='w'||raw.timeoutWinner==='b'?{timeoutWinner:raw.timeoutWinner}:{}),
    savedAt:typeof raw.savedAt==='number'&&Number.isFinite(raw.savedAt)?raw.savedAt:Date.now()
  };
  try { replay(snapshot); } catch { return undefined; }
  return snapshot;
}

export function loadSnapshot(storage:Pick<Storage,'getItem'|'removeItem'>=localStorage):GameSnapshot|undefined {
  const text=storage.getItem(STORAGE_KEY);
  if (!text) return undefined;
  try {
    const snapshot=normalizeSnapshot(JSON.parse(text));
    if (!snapshot) storage.removeItem(STORAGE_KEY);
    return snapshot;
  } catch {
    storage.removeItem(STORAGE_KEY);
    return undefined;
  }
}

export function saveSnapshot(snapshot:GameSnapshot,storage:Pick<Storage,'setItem'>=localStorage) {
  storage.setItem(STORAGE_KEY,JSON.stringify(snapshot));
}

export function clearSnapshot(storage:Pick<Storage,'removeItem'>=localStorage) {
  storage.removeItem(STORAGE_KEY);
}
