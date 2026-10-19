import {describe,it,expect,vi,afterEach} from 'vitest';
import {Chess,DEFAULT_POSITION} from 'chess.js';
import {PositionTracker,parseMove,placement,validated} from '../src/chess/position';
import {coordinate,DomAdapter} from '../src/board/adapter';
import {FairPlayGuard,allowedRoute} from '../src/guard';
import {debounce} from '../src/debounce';
import {readSettings} from '../src/types';
afterEach(()=>{document.body.replaceChildren();vi.useRealTimers();});
describe('FEN and incremental history',()=>{
  it('initial FEN preserves six fields and duplicate state',()=>{
    const tracker=new PositionTracker();expect(tracker.read(placement(DEFAULT_POSITION))).toBe(DEFAULT_POSITION);
    expect(tracker.read(placement(DEFAULT_POSITION))).toBe(DEFAULT_POSITION);
  });
  it('tracks e4 e5, counters and turn without invented metadata',()=>{
    const c=new Chess(),t=new PositionTracker();t.read(placement(c.fen()));
    for(const san of ['e4','e5','Nf3']){c.move(san);expect(t.read(placement(c.fen()))).toBe(c.fen());}
  });
  it('rejects late attach, skipped moves and repeated placements',()=>{
    const c=new Chess(),t=new PositionTracker();c.move('e4');expect(()=>t.read(placement(c.fen()))).toThrow('primeiro');
    t.reset();t.read(placement(DEFAULT_POSITION));c.move('e5');expect(()=>t.read(placement(c.fen()))).toThrow('sincronização');
    t.reset();const r=new Chess();t.read(placement(r.fen()));
    for(const san of ['Nf3','Nf6','Ng1']){r.move(san);t.read(placement(r.fen()));}
    r.move('Ng8');expect(()=>t.read(placement(r.fen()))).toThrow('repetida');
  });
  it('rejects invalid kings, pawns, check legality, missing metadata and false castling',()=>{
    for(const fen of ['8/8/8/8/8/8/8/8 w - - 0 1','k7/8/8/8/8/8/8/7K w K - 0 1','k7/8/8/8/8/8/8/R6K w - - 0 1',placement(DEFAULT_POSITION),'k7/8/8/8/8/8/8/P6K w - - 0 1','k7/8/8/8/8/8/8/7K w - d6 0 1']) expect(()=>validated(fen)).toThrow();
  });
  it('manual seed must match actual placement',()=>{
    const t=new PositionTracker();expect(()=>t.seed(DEFAULT_POSITION,'8/8/8/8/8/8/8/8')).toThrow('corresponde');
    expect(t.seed(DEFAULT_POSITION,placement(DEFAULT_POSITION))).toBe(DEFAULT_POSITION);
  });
  it('castling and en passant follow legal move inference',()=>{
    for(const [fen,uci] of [['r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1','e1g1'],['k7/8/8/3pP3/8/8/8/7K w - d6 0 1','e5d6']]){
      const c=new Chess(fen),t=new PositionTracker();t.seed(fen,placement(fen));c.move(parseMove(uci));expect(t.read(placement(c.fen()))).toBe(c.fen());
    }
  });
  it.each(['q','r','b','n'])('promotion %s is legal',p=>{
    const c=new Chess('7k/P7/8/8/8/8/8/7K w - - 0 1'),t=new PositionTracker();t.seed(c.fen(),placement(c.fen()));c.move(parseMove('a7a8'+p));expect(t.read(placement(c.fen()))).toBe(c.fen());
  });
  it.each(['bad','a0a1','a7a8k','a2a4extra'])('rejects malformed UCI %s',m=>expect(()=>parseMove(m)).toThrow());
});
describe('board geometry and DOM',()=>{
  it.each(['white','black'] as const)('maps all 64 squares %s',orientation=>{
    const rect={left:40,top:80,width:400,height:400};
    for(let f=0;f<8;f++)for(let r=1;r<=8;r++){
      const p=coordinate(String.fromCharCode(97+f)+r,rect,orientation);
      expect(p.x).toBe(40+((orientation==='white'?f:7-f)+.5)*50);
      expect(p.y).toBe(80+((orientation==='white'?8-r:r-1)+.5)*50);
    }
  });
  it('reads class-coded pieces independent of orientation',()=>{
    document.body.innerHTML='<wc-chess-board class="flipped"><div class="piece wk square-51"></div><div class="piece bk square-58"></div></wc-chess-board>';
    const a=DomAdapter.detect()!;expect(a.getOrientation()).toBe('black');expect(a.readPosition().placement).toBe('4k3/8/8/8/8/8/8/4K3');
  });
  it('detects duplicate pieces and malformed pieces',()=>{
    document.body.innerHTML='<wc-chess-board><div class="piece wk square-51"></div><div class="piece bk square-51"></div></wc-chess-board>';
    expect(()=>DomAdapter.detect()!.readPosition()).toThrow('Duas');document.querySelector('.piece')!.className='piece';expect(()=>DomAdapter.detect()!.readPosition()).toThrow('reconhecível');
  });
  it('observer debounces changes and cleanup disconnects',async()=>{
    vi.useFakeTimers();document.body.innerHTML='<wc-chess-board></wc-chess-board>';
    const fn=vi.fn(),run=debounce(fn,180),a=DomAdapter.detect()!,stop=a.observeChanges(run);
    a.element.append(document.createElement('div'));a.element.className='flipped';await Promise.resolve();vi.advanceTimersByTime(179);expect(fn).not.toHaveBeenCalled();vi.advanceTimersByTime(1);expect(fn).toHaveBeenCalledTimes(1);
    stop();a.element.className='';await Promise.resolve();vi.advanceTimersByTime(200);expect(fn).toHaveBeenCalledTimes(1);run();run.cancel();vi.advanceTimersByTime(200);expect(fn).toHaveBeenCalledTimes(1);
  });
});
describe('guard fails closed',()=>{
  it.each(['/play/online','/game/live/123','/live','/play/computer/online','/analysisfoo','/puzzles','/'])('blocks %s',path=>expect(FairPlayGuard.check('https://www.chess.com'+path,document).allowed).toBe(false));
  it.each(['/play/computer','/analysis','/analysis/game/computer/12'])('allows %s',path=>expect(FairPlayGuard.check('https://www.chess.com'+path,document).allowed).toBe(true));
  it('human evidence overrides allowed route',()=>{document.body.innerHTML='<div data-game-type="human"></div>';expect(FairPlayGuard.check('https://www.chess.com/play/computer',document).allowed).toBe(false);});
  it('rejects lookalike hosts, remote local fixtures and unsupported origins',()=>{
    for(const u of ['https://www.chess.com.evil.test/analysis','https://chess.com/analysis','http://www.chess.com/analysis','http://localhost:8787/chess-board.html','invalid'])expect(allowedRoute(u)).toBe(false);
    expect(FairPlayGuard.check('http://127.0.0.1:8787/chess-board.html',document).allowed).toBe(false);
    document.body.innerHTML='<div data-cba-local="training"></div>';expect(FairPlayGuard.check('http://127.0.0.1:8787/chess-board.html',document).allowed).toBe(true);
  });
  it('normalizes corrupt configuration',()=>expect(readSettings({enabled:'yes',depth:999,side:'human'})).toEqual({enabled:true,depth:12,side:'w',overlay:true,evaluation:true}));
});
