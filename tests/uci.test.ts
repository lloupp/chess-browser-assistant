import {it,expect,vi} from 'vitest';
import {DEFAULT_POSITION} from 'chess.js';
import {UciEngine} from '../src/engine/uci';
function fake(){let receive:(s:string)=>void=()=>{};const commands:string[]=[];const terminate=vi.fn();const e=new UciEngine({send:c=>commands.push(c),listen:fn=>{receive=fn;},failure:()=>{},terminate});return {e,commands,terminate,line:(s:string)=>receive(s)};}
async function ready(f:ReturnType<typeof fake>){const init=f.e.init();f.line('uciok');await Promise.resolve();f.line('readyok');await init;}
it('handshake and legal scored bestmove',async()=>{const f=fake();await ready(f);expect(f.e.ready).toBe(true);const result=f.e.analyze(DEFAULT_POSITION,12);f.line('info depth 9 score cp 23 pv e2e4');f.line('bestmove e2e4 ponder e7e5');expect(await result).toEqual({bestmove:'e2e4',ponder:'e7e5',depth:9,score:{type:'cp',value:23}});expect(f.commands).toContain('position fen '+DEFAULT_POSITION);f.e.dispose();});
it('cancellation terminates worker and rejects stale analysis',async()=>{const f=fake();await ready(f);const result=f.e.analyze(DEFAULT_POSITION,12);const check=expect(result).rejects.toThrow('cancelada');f.e.dispose();f.line('bestmove e2e4');await check;expect(f.terminate).toHaveBeenCalled();expect(f.e.ready).toBe(false);});
it('rejects illegal engine output',async()=>{const f=fake();await ready(f);const p=f.e.analyze(DEFAULT_POSITION,8);f.line('bestmove e2e5');await expect(p).rejects.toThrow('ilegal');f.e.dispose();});
it('rejects analysis before ready or while busy',async()=>{const f=fake();await expect(f.e.analyze(DEFAULT_POSITION,8)).rejects.toThrow();await ready(f);const p=f.e.analyze(DEFAULT_POSITION,8);await expect(f.e.analyze(DEFAULT_POSITION,8)).rejects.toThrow('ocupado');f.line('bestmove e2e4');await p;f.e.dispose();});
it('handshake and analysis timeouts terminate',async()=>{vi.useFakeTimers();try{const f=fake();const init=f.e.init();const check=expect(init).rejects.toThrow('Timeout');vi.advanceTimersByTime(10001);await check;expect(f.terminate).toHaveBeenCalled();const g=fake();await ready(g);const p=g.e.analyze(DEFAULT_POSITION,8);const failed=expect(p).rejects.toThrow('Timeout');vi.advanceTimersByTime(15001);await failed;}finally{vi.useRealTimers();}});

it('applies strength options before ready',async()=>{
  const f=fake();
  const init=f.e.init({'UCI_LimitStrength':true,'UCI_Elo':1320,'Skill Level':4});
  f.line('uciok');await Promise.resolve();
  expect(f.commands).toContain('setoption name UCI_LimitStrength value true');
  expect(f.commands).toContain('setoption name UCI_Elo value 1320');
  expect(f.commands).toContain('setoption name Skill Level value 4');
  f.line('readyok');await init;f.e.dispose();
});
