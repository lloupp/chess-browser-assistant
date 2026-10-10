# chess-browser-assistant

Professor de Xadrez: jogue contra o Stockfish no navegador e receba uma explicação após cada lance.

- **Adversário** com 5 níveis (Stockfish `Skill Level`), jogando de brancas ou pretas.
- **Professor** (Stockfish em força máxima) classifica cada lance seu — Ótimo, Bom, Imprecisão, Erro, Capivarada — pela perda em centipeões, mostra o melhor lance, avisa sobre mate perdido e peças deixadas penduradas.
- **Dica** (destaca a peça a mover sem entregar o lance), **Desfazer** e barra de avaliação.
- **Revisão**: no fim da partida (ou no botão *Revisar*) lista seus lances mais caros; *Refazer* volta à posição para você encontrar um lance melhor.
- **Promoção** com escolha de peça.
- **Posição inicial customizada** via URL: `?fen=<FEN>` (ex.: para treinar finais).
- Tudo roda localmente (Stockfish 19 lite, WASM single-thread em Web Worker); sem servidor nem conta.

## Uso

```bash
npm install      # também copia o motor para public/stockfish
npm run dev      # http://localhost:5173
npm test         # testes unitários (Vitest)
npm run test:e2e # ponta a ponta (Playwright); CHROMIUM_PATH=... para usar um Chromium já instalado
```

## Estrutura

- `src/coach.js` — lógica pura de ensino (parse UCI, classificação, explicações). Coberta por `tests/`.
- `src/engine.js` — wrapper UCI do Web Worker do Stockfish (chamadas serializadas).
- `src/main.js` — tabuleiro, fluxo da partida e interface.

Limitações atuais: movimentos só por clique (sem arrastar).
