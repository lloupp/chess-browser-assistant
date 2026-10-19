# Extensão desktop — legado suportado

A implementação original do projeto é uma extensão Chrome/Chromium Manifest V3
para treinamento local com Stockfish WASM.

Ela permanece no repositório porque compartilha componentes de xadrez e do motor
com o app Android, mas não é mais o produto principal.

## Escopo

Uso permitido:

- Chess.com em `/play/computer`;
- Chess.com em `/analysis` e rotas derivadas;
- fixture local de desenvolvimento.

Partidas humanas são bloqueadas por `src/guard.ts` e não existe configuração
para remover esse bloqueio.

## Arquitetura da extensão

| Módulo | Responsabilidade |
| --- | --- |
| `src/board/adapter.ts` | Leitura do DOM e geometria do tabuleiro |
| `src/chess/position.ts` | FEN, UCI e reconstrução legal do histórico |
| `src/guard.ts` | Allowlist e bloqueio de contextos humanos |
| `src/content.ts` | Sincronização da posição e ciclo de análise |
| `src/background.ts` | Validação e roteamento de mensagens |
| `src/offscreen.ts` | Worker Stockfish fora do content script |
| `src/ui/overlay.ts` | Destaques e setas |
| `src/popup.*` | Configuração da extensão |

A análise é local, sem cookies, login, telemetria ou API remota.

## Desenvolvimento

```sh
npm ci
npm run build
npm test
npm run test:e2e
```

O workflow **Extension quality** continua validando a implementação.

A validação do DOM público do Chess.com depende de testes físicos periódicos
porque seletores e componentes do site podem mudar sem aviso.
