import type { Result } from '../types';

export type MoveGrade='Excelente'|'Boa'|'Imprecisão'|'Erro'|'Erro grave';

export function scoreToCp(score:Result['score']):number|undefined {
  if (!score) return undefined;
  if (score.type==='cp') return score.value;
  const sign=Math.sign(score.value)||1;
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
