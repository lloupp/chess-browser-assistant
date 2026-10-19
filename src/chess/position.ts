import { Chess, DEFAULT_POSITION, type Square } from 'chess.js';
export const placement = (fen:string) => fen.split(' ')[0];
export function parseMove(uci:string) {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci);
  if (!m) throw new Error('Movimento UCI inválido');
  return {from:m[1] as Square,to:m[2] as Square,...(m[3] ? {promotion:m[3]} : {})};
}
export function validated(fen:string): Chess {
  if (fen.trim().split(/\s+/).length !== 6) throw new Error('FEN precisa dos seis campos');
  const chess = new Chess(fen);
  const pieces = chess.board().flat().filter(p=>p !== null);
  if (pieces.filter(p=>p.color==='w').length > 16 || pieces.filter(p=>p.color==='b').length > 16) throw new Error('Peças demais');
  // The player who just moved cannot leave their king attacked.
  const other = chess.turn()==='w'?'b':'w';
  const king = pieces.find(p=>p.type==='k' && p.color===other);
  if (!king || chess.isAttacked(king.square, chess.turn())) throw new Error('Rei adversário em xeque: posição ilegal');
  const fields = fen.split(' ');
  const rights: Record<string,[Square,string,Square,string]> = {K:['e1','wk','h1','wr'],Q:['e1','wk','a1','wr'],k:['e8','bk','h8','br'],q:['e8','bk','a8','br']};
  for (const right of fields[2].replace('-','')) {
    const [ks,k,rs,r] = rights[right];
    const kp=chess.get(ks), rp=chess.get(rs);
    if (!kp || !rp || kp.color+kp.type!==k || rp.color+rp.type!==r) throw new Error('Direito de roque inconsistente');
  }
  if(fields[3]!=='-') {
    const ep=fields[3] as Square,rank=Number(ep[1]),file=ep[0];
    const pawnSquare=(file+(rank===6?5:4)) as Square,origin=(file+(rank===6?7:2)) as Square;
    const pawn=chess.get(pawnSquare);
    if(chess.get(ep) || chess.get(origin) || !pawn || pawn.type!=='p' || pawn.color!==other || fields[4]!=='0') throw new Error('En passant inconsistente');
  }
  return chess;
}
export class PositionTracker {
  private chess?:Chess;
  private visited = new Map<string,string>();
  reset() { this.chess=undefined; this.visited.clear(); }
  seed(fen:string, observed:string) {
    const next=validated(fen);
    if (placement(next.fen())!==observed) throw new Error('FEN não corresponde às peças no tabuleiro');
    this.chess=next; this.visited.clear(); this.visited.set(observed,next.fen());
    return next.fen();
  }
  read(observed:string, exactFen?:string):string {
    if (exactFen) return this.seed(exactFen,observed);
    if (!this.chess) {
      if (observed!==placement(DEFAULT_POSITION)) throw new Error('Abra antes do primeiro lance ou informe o FEN completo no popup');
      return this.seed(DEFAULT_POSITION,observed);
    }
    if (placement(this.chess.fen())===observed) return this.chess.fen();
    const candidates:string[]=[];
    for (const move of this.chess.moves({verbose:true})) {
      const next=new Chess(this.chess.fen()); next.move(move);
      if (placement(next.fen())===observed) candidates.push(next.fen());
    }
    if (candidates.length!==1) throw new Error('Perda de sincronização: informe o FEN completo ou reinicie a partida');
    // Piece-only observations cannot disambiguate repeated positions or navigation.
    if (this.visited.has(observed)) throw new Error('Posição repetida: confirme o FEN completo para preservar roque e contadores');
    this.chess=validated(candidates[0]); this.visited.set(observed,this.chess.fen());
    return this.chess.fen();
  }
}
