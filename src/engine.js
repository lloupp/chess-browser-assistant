import { parseInfo, toCp } from './coach.js';

/** Thin wrapper around a Stockfish Web Worker speaking UCI. */
export class Engine {
  constructor(url = '/stockfish/stockfish-19-lite-single.js') {
    this.worker = new Worker(url);
    this.listeners = new Set();
    this.worker.onmessage = (e) => this.listeners.forEach((fn) => fn(String(e.data)));
    this.queue = Promise.resolve();
    this.ready = this.#waitFor('uciok', 'uci').then(() => this.#waitFor('readyok', 'isready'));
  }

  #waitFor(token, cmd) {
    return new Promise((resolve) => {
      const fn = (line) => {
        if (line.startsWith(token)) {
          this.listeners.delete(fn);
          resolve(line);
        }
      };
      this.listeners.add(fn);
      this.worker.postMessage(cmd);
    });
  }

  setOption(name, value) {
    this.worker.postMessage(`setoption name ${name} value ${value}`);
  }

  /** Searches `fen`; resolves { bestmove, cp, mate } from the side to move's view. Calls are serialized. */
  analyze(fen, goCmd = 'go depth 12') {
    const run = async () => {
      await this.ready;
      let last = null;
      const collect = (line) => {
        const info = parseInfo(line);
        if (info && info.pv.length) last = info;
      };
      this.listeners.add(collect);
      this.worker.postMessage(`position fen ${fen}`);
      const line = await this.#waitFor('bestmove', goCmd);
      this.listeners.delete(collect);
      const bestmove = line.split(' ')[1];
      return {
        bestmove: bestmove === '(none)' ? null : bestmove,
        cp: last ? toCp(last) : 0,
        mate: last?.mate ?? null,
      };
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
}
