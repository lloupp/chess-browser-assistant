import { parseMove, validated } from '../chess/position';
import type { Result } from '../types';

export interface Transport {
  send(command:string):void;
  listen(fn:(line:string)=>void):void;
  failure(fn:()=>void):void;
  terminate():void;
}

export type UciOptions = Record<string,string|number|boolean>;

export class UciEngine {
  private pending?:{resolve:(r:Result)=>void;reject:(e:Error)=>void;fen:string;timer:ReturnType<typeof setTimeout>};
  private waiter?:{word:string;resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>};
  private result:Result={bestmove:'',depth:0};
  ready=false;

  constructor(private transport:Transport) {
    transport.listen(line=>this.line(line));
    transport.failure(()=>this.dispose('Falha no Worker'));
  }

  private send(command:string) { this.transport.send(command); }

  private wait(word:string,command:string) {
    return new Promise<void>((resolve,reject)=>{
      this.waiter={word,resolve,reject,timer:setTimeout(()=>this.dispose('Timeout UCI'),10000)};
      this.send(command);
    });
  }

  async init(options:UciOptions={}) {
    await this.wait('uciok','uci');
    this.send('setoption name Hash value 16');
    for (const [name,value] of Object.entries(options)) {
      this.send('setoption name '+name+' value '+String(value));
    }
    await this.wait('readyok','isready');
    this.ready=true;
  }

  async newGame() {
    if (!this.ready || this.pending) throw new Error('Engine ocupado ou indisponível');
    this.send('ucinewgame');
    await this.wait('readyok','isready');
  }

  analyze(fen:string,depth:number,movetime=3000):Promise<Result> {
    if (!this.ready || this.pending) return Promise.reject(new Error('Engine ocupado ou indisponível'));
    validated(fen);
    this.result={bestmove:'',depth:0};
    const safeDepth=Math.max(1,Math.min(24,Math.round(depth)));
    const safeMoveTime=Math.max(80,Math.min(10000,Math.round(movetime)));
    return new Promise((resolve,reject)=>{
      this.pending={
        resolve,
        reject,
        fen,
        timer:setTimeout(()=>this.dispose('Timeout de análise'),Math.max(15000,safeMoveTime+10000))
      };
      this.send('position fen '+fen);
      this.send('go depth '+safeDepth+' movetime '+safeMoveTime);
    });
  }

  private line(line:string) {
    line=line.trim();
    if (this.waiter && line===this.waiter.word) {
      clearTimeout(this.waiter.timer);
      this.waiter.resolve();
      this.waiter=undefined;
      return;
    }
    if (!this.pending) return;
    if (line.startsWith('info ')) {
      const depth=/\bdepth (\d+)/.exec(line);
      const score=/\bscore (cp|mate) (-?\d+)/.exec(line);
      if (depth) this.result.depth=Number(depth[1]);
      if (score) this.result.score={type:score[1] as 'cp'|'mate',value:Number(score[2])};
    }
    if (line.startsWith('bestmove ')) {
      const p=this.pending;
      this.pending=undefined;
      clearTimeout(p.timer);
      const [,bestmove,,ponder]=line.split(' ');
      try {
        const chess=validated(p.fen);
        if (bestmove==='(none)' || bestmove==='0000') {
          if (chess.moves().length) throw new Error('Engine sem movimento em posição jogável');
        } else {
          chess.move(parseMove(bestmove));
        }
        p.resolve({...this.result,bestmove,...(ponder?{ponder}:{})});
      } catch {
        p.reject(new Error('Engine retornou movimento ilegal'));
      }
    }
  }

  dispose(reason='Análise cancelada') {
    this.ready=false;
    if (this.pending) {
      clearTimeout(this.pending.timer);
      this.pending.reject(new Error(reason));
      this.pending=undefined;
    }
    if (this.waiter) {
      clearTimeout(this.waiter.timer);
      this.waiter.reject(new Error(reason));
      this.waiter=undefined;
    }
    this.transport.terminate();
  }
}
