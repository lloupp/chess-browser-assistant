// @vitest-environment node
import {it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import {UciEngine} from '../src/engine/uci';
import {parseMove} from '../src/chess/position';
it('real packaged Stockfish WASM: UCI, ready, FEN, legal moves and mate',async()=>{
  const child=spawn(process.execPath,['node_modules/stockfish/bin/stockfish-18-lite-single.js']);
  const lines=createInterface({input:child.stdout});
  const engine=new UciEngine({send:c=>child.stdin.write(c+'\n'),listen:fn=>lines.on('line',fn),failure:fn=>child.on('error',fn),terminate:()=>{lines.close();child.kill();}});
  try {
    await engine.init();expect(engine.ready).toBe(true);
    for(const fen of [DEFAULT_POSITION,'7k/P7/8/8/8/8/8/7K w - - 0 1','7k/5Q2/6K1/8/8/8/8/8 w - - 0 1']){
      const r=await engine.analyze(fen,8),c=new Chess(fen);expect(()=>c.move(parseMove(r.bestmove))).not.toThrow();expect(r.depth).toBeGreaterThan(0);
    }
    const r=await engine.analyze('7k/6Q1/6K1/8/8/8/8/8 b - - 0 1',8);expect(['0000','(none)']).toContain(r.bestmove);
  }finally{engine.dispose();}
});
