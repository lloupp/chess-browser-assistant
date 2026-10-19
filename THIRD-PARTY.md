# Third-party components

Stockfish.js 18.0.5 (Stockfish 18 lite, single-thread WASM), Nathan Rugg,
Chess.com and Stockfish contributors: GPL v3. The npm dependency is pinned in
package-lock.json. Bundled files are copied without modification from that package.
Corresponding source and build scripts: https://github.com/nmrugg/stockfish.js
at tag v18.0.0; npm packaging release: https://www.npmjs.com/package/stockfish/v/18.0.5.
GPL text is included in dist/engine/COPYING.txt. To obtain/build the corresponding
source: git clone --branch v18.0.0 https://github.com/nmrugg/stockfish.js,
then follow its README and build.js instructions (Emscripten toolchain).

chess.js 1.4.0, Jeff Hlywa and contributors: BSD-2-Clause.
Source: https://github.com/jhlywa/chess.js/tree/v1.4.0.
License included in dist/CHESS-JS-LICENSE.txt.

The extension's own code is GPL-3.0-or-later. No remote scripts or engines are
loaded at runtime.
