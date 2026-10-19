import { Chess, type Move, type Square } from 'chess.js';
import type { Color } from '../types';
import { grade } from './review';

export type GamePhase = 'Abertura' | 'Meio-jogo' | 'Final';
export interface CoachGuidance { phase:GamePhase; goal:string; tip:string }

const VALUES:Record<string,number>={n:3,b:3,r:5,q:9};
const NAMES:Record<string,string>={n:'cavalo',b:'bispo',r:'torre',q:'dama'};

// Material takes precedence so positions imported from FEN are classified sensibly.
export function gamePhase(game:Chess):GamePhase {
  let material=0;
  for(const row of game.board()) for(const piece of row) {
    if(piece) material+=VALUES[piece.type]??0;
  }
  if(material<=18) return 'Final';
  return game.history().length<18 && material>=30?'Abertura':'Meio-jogo';
}

function exposedPiece(game:Chess,side:Color):string|undefined {
  const opponent:Color=side==='w'?'b':'w';
  for(const file of 'abcdefgh') for(let rank=1;rank<=8;rank++){
    const square=(file+rank) as Square;
    const piece=game.get(square);
    if(piece?.color!==side||!NAMES[piece.type]) continue;
    if(game.isAttacked(square,opponent)&&!game.isAttacked(square,side)) {
      return 'A tua '+NAMES[piece.type]+' em '+square+' parece atacada e sem defesa. Verifica se podes protegê-la ou movê-la.';
    }
  }
}

export function guidanceFor(game:Chess,side:Color):CoachGuidance {
  const phase=gamePhase(game);
  if(game.isCheck()&&game.turn()===side) return {
    phase,goal:'Sair do xeque',
    tip:'Procura um lance legal que afaste o rei, bloqueie o ataque ou capture a peça atacante.'
  };
  const danger=exposedPiece(game,side);
  if(danger) return {phase,goal:'Identificar ameaças',tip:danger};
  if(phase==='Abertura') return {
    phase,goal:'Controlar o centro e desenvolver peças',
    tip:'Observa as casas e4, d4, e5 e d5. Desenvolve cavalos e bispos e prepara o roque para proteger o rei.'
  };
  if(phase==='Meio-jogo') return {
    phase,goal:'Reconhecer ameaças e melhorar as peças',
    tip:'Antes de jogar, procura xeques, capturas e ataques. Confere peças sem defesa e busca casas mais ativas.'
  };
  return {
    phase,goal:'Ativar o rei e criar peões passados',
    tip:'Nos finais, aproxima o rei do centro quando for seguro e apoia peões que possam avançar sem oposição.'
  };
}

// Explanation of an observed move, not a claim that a specific tactic was proved.
export function explainPlayedMove(move:Move,beforeFen:string,loss:number|undefined,bestSan?:string):string {
  const phase=gamePhase(new Chess(beforeFen));
  const label=loss===undefined?'Lance registrado':grade(loss);
  let advice:string;
  if(loss!==undefined&&loss>170) {
    advice='O motor encontrou uma alternativa melhor. Revê possíveis xeques, capturas e peças sem defesa.';
  }else if(move.san.startsWith('O-O')) {
    advice='Fizeste o roque: em geral, ele melhora a segurança do rei e conecta as torres.';
  }else if(move.captured) {
    advice='Capturaste uma peça. Agora confere se a peça que capturou continua protegida.';
  }else if(phase==='Abertura'&&(move.piece==='n'||move.piece==='b')) {
    advice='Desenvolveste uma peça menor, algo importante para disputar o centro na abertura.';
  }else if(move.piece==='p'&&['d4','e4','d5','e5'].includes(move.to)) {
    advice='Esse peão ajuda a disputar o centro. Observa como as outras peças podem apoiá-lo.';
  }else if(phase==='Final'&&move.piece==='k') {
    advice='Nos finais, um rei ativo pode apoiar peões e controlar casas importantes.';
  }else {
    advice='Observa a resposta do adversário e verifica xeques, capturas e ameaças antes do próximo lance.';
  }
  const alternative=bestSan&&bestSan!==move.san?' O Stockfish sugere '+bestSan+' como alternativa.':'';
  const caveat=loss===undefined?' A avaliação numérica não ficou disponível.':'';
  return label+': '+move.san+'. '+advice+alternative+caveat;
}
