// Short synthesized sounds: no audio files are shipped and nothing is downloaded.
export type SoundKind='move'|'capture'|'check'|'end';

const KEY='xadrez-local.sound';
let context:AudioContext|undefined;
let muted=readMuted();

function readMuted(){ try { return localStorage.getItem(KEY)==='off'; } catch { return false; } }

export function isMuted(){ return muted; }

export function setMuted(value:boolean){
  muted=value;
  try { localStorage.setItem(KEY,value?'off':'on'); } catch { /* storage unavailable */ }
}

function tone(ctx:AudioContext,frequency:number,start:number,duration:number,volume:number,type:OscillatorType='sine'){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.type=type;
  osc.frequency.value=frequency;
  gain.gain.setValueAtTime(volume,ctx.currentTime+start);
  gain.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+start+duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(ctx.currentTime+start);
  osc.stop(ctx.currentTime+start+duration);
}

export function playSound(kind:SoundKind){
  if(muted || typeof AudioContext==='undefined') return;
  try{
    context??=new AudioContext();
    if(context.state==='suspended') void context.resume();
    if(kind==='move') tone(context,520,0,0.07,0.18,'triangle');
    else if(kind==='capture'){ tone(context,300,0,0.09,0.25,'square'); tone(context,180,0.03,0.12,0.18,'triangle'); }
    else if(kind==='check'){ tone(context,760,0,0.09,0.18,'triangle'); tone(context,980,0.1,0.12,0.18,'triangle'); }
    else { tone(context,523,0,0.18,0.18); tone(context,659,0.16,0.18,0.18); tone(context,784,0.32,0.32,0.18); }
  }catch{ /* audio unavailable */ }
}
