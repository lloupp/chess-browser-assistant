import { Chess } from 'chess.js';
import type { Color } from '../types';

const VALUES:Record<string,number>={p:1,n:3,b:3,r:5,q:9,k:0};
const ORDER=['q','r','b','n','p'] as const;

export interface MaterialSummary {
  // Piece types each color has taken from the opponent, most valuable first.
  capturedBy:Record<Color,string[]>;
  // Material balance in pawns, positive when White is ahead.
  advantage:number;
}

function counts(game:Chess){
  const result={w:{} as Record<string,number>,b:{} as Record<string,number>};
  for(const piece of game.board().flat()) if(piece) result[piece.color][piece.type]=(result[piece.color][piece.type]??0)+1;
  return result;
}

// The start position is the baseline, so games begun from a FEN do not show missing pieces as captures.
export function materialSummary(game:Chess,startFen:string):MaterialSummary {
  const now=counts(game),start=counts(new Chess(startFen));
  const capturedBy:Record<Color,string[]>={w:[],b:[]};
  let advantage=0;
  for(const color of ['w','b'] as Color[]){
    const opponent:Color=color==='w'?'b':'w';
    for(const type of ORDER){
      const missing=Math.max(0,(start[opponent][type]??0)-(now[opponent][type]??0));
      for(let i=0;i<missing;i++) capturedBy[color].push(type);
    }
    for(const [type,count] of Object.entries(now[color])) advantage+=(color==='w'?1:-1)*VALUES[type]*count;
  }
  return {capturedBy,advantage};
}
