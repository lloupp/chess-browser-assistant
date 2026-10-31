import type { Result } from '../types';

export type MoveGrade='Excelente'|'Boa'|'Imprecisão'|'Erro'|'Erro grave';

export function scoreToCp(score:Result['score']):number|undefined {
  if (!score) return undefined;
  if (score.type==='cp') return score.value;
  // "mate 0" means the side to move is already checkmated.
  const sign=Math.sign(score.value)||-1;
  return sign*(100_000-Math.min(99,Math.abs(score.value))*100);
}

export function centipawnLoss(best:Result['score'],afterFromOpponent:Result['score']):number|undefined {
  const before=scoreToCp(best),after=scoreToCp(afterFromOpponent);
  if (before===undefined || after===undefined) return undefined;
  return Math.max(0,Math.round(before-(-after)));
}

export function grade(loss:number|undefined):MoveGrade {
  if (loss===undefined || loss<=25) return 'Excelente';
  if (loss<=80) return 'Boa';
  if (loss<=170) return 'Imprecisão';
  if (loss<=320) return 'Erro';
  return 'Erro grave';
}

export function formatEvaluation(score:Result['score']):string {
  if (!score) return '—';
  if (score.type==='mate') return (score.value>=0?'+':'')+'M'+score.value;
  const pawns=score.value/100;
  return (pawns>=0?'+':'')+pawns.toFixed(1);
}

// Win chance (0-100) for the side with this centipawn score, as used by common accuracy metrics.
export function winPercent(cp:number):number {
  return 50+50*(2/(1+Math.exp(-0.00368208*cp))-1);
}

// Accuracy (0-100) of one move from the best-move score and the opponent's score after the move.
export function moveAccuracy(best:Result['score'],afterFromOpponent:Result['score']):number|undefined {
  const before=scoreToCp(best),after=scoreToCp(afterFromOpponent);
  if (before===undefined || after===undefined) return undefined;
  const drop=Math.max(0,winPercent(before)-winPercent(-after));
  return Math.max(0,Math.min(100,103.1668*Math.exp(-0.04354*drop)-3.1669));
}

// Engine scores are relative to the side to move; this converts them to White's point of view.
export function whiteScore(score:Result['score'],turn:'w'|'b'):Result['score'] {
  if (!score || turn==='w') return score;
  return {type:score.type,value:-score.value};
}
