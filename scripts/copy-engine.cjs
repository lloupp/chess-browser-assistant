// Copies the single-threaded Stockfish build into public/ so Vite serves it as static files.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'stockfish', 'bin');
const dest = path.join(__dirname, '..', 'public', 'stockfish');
fs.mkdirSync(dest, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  fs.copyFileSync(path.join(src, f), path.join(dest, f));
}
