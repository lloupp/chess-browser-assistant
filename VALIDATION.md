# Registro da entrega — 03/10/2026

Branch local: `feat/local-training-mvp`. Nenhuma alteração de main ou merge.

## Resultados

| Verificação | Resultado |
| --- | --- |
| `npm run lint` | Passou |
| `npm run typecheck` | Passou |
| `npm test` | 39 testes passaram |
| `npm run test:integration` | Stockfish WASM real: passou |
| `npm run build` | `dist/` gerado |
| `npm audit` | Zero vulnerabilidades reportadas |
| Playwright local, extensão real | BLOQUEADO antes de carregar a extensão |
| Chess.com público | Não validado fisicamente |
| CI remoto | Execuções disponíveis na PR #1; consultar o resultado do HEAD atual |
| Publicação / PR para main | Branch publicada, PR #1 aberta em rascunho; sem merge |

Teste Playwright tentou Chrome for Testing 145.0.7632.6. O processo abortou
com `process_singleton_posix.cc: socket() failed: Operation not permitted`.
Os três cenários E2E estão implementados e rodam no GitHub Actions. O
primeiro CI encontrou falha no harness: buscava a aba pela URL sem permissão
para ler URLs. O teste foi corrigido para usar o ID da aba ativa, sem ampliar
permissões. Resultados de cada execução:
https://github.com/lloupp/chess-browser-assistant/pull/1/checks.
O teste integrado jsdom roda o build completo com mensagens de
extensão simuladas e engine real; não substitui a validação Chromium/MV3.

## Revisão e correções

- Cancelamentos recebem token anterior ao da nova análise; teste integrado
  entrega cancelamentos com atraso para exercitar a corrida.
- Workers obsoletos são encerrados; resultado só aparece na geração atual.
- FEN manual precisa coincidir com peças observadas; sem histórico, bloqueia.
- Rei adversário atacado, direitos de roque e en passant incoerentes bloqueiam.
- Mudanças transitórias e reversão ao mesmo placement permitem reanálise.
- Overlay usa shadow DOM, textContent e pointer-events none; não interfere
  nos MutationObservers e usa ResizeObserver/scroll para acompanhar o board.
- Configuração corrompida é normalizada; guardrail não depende das opções.
- `npm test` constrói o pacote antes do teste integrado, também em checkout limpo.
- Sem scripts remotos, telemetria, cookies ou permissões globais.

## Pendências externas

O proprietário inicializou `main` com README. Os três commits locais foram
publicados em `feat/local-training-mvp`, com o commit inicial de main como
ancestral, e a PR #1 foi aberta. Nenhum conteúdo foi alterado diretamente
em main. Nenhum merge foi feito. A validação do DOM do Chess.com público
continua dependendo de teste físico.

## Teste físico curto

1. Extraia `Chess_Browser_Assistant_Extensao.zip` e carregue a pasta extraída
   em `chrome://extensions`. No ZIP completo/código fonte, carregue `dist/`.
2. Com Node 22.12+, rode `npm ci` e `npm run fixture`; abra
   `http://127.0.0.1:8787/chess-board.html`. Verifique seta, e4/e5, inverter e promoção.
3. No Chess.com, recarregue e inicie uma nova partida contra bot; escolha
   sua cor no popup. Confira sugestão no seu turno e pausa no turno do bot.
4. Abra uma rota humana (`/play/online`): popup deve mostrar assistência
   desativada e nenhuma seta. Não use esta extensão contra pessoas.

Não considerar o MVP integralmente aceito até Chromium, Chess.com e CI
serem validados. PR #1: https://github.com/lloupp/chess-browser-assistant/pull/1.


## Modo contra Stockfish — 2026-10-06

Nova página play.html e botão no popup. Build, lint, TypeScript e os 39 testes
passaram localmente. Adicionado E2E com Stockfish real: lance humano/resposta,
início de pretas, orientação e reinício durante busca. Execução local do E2E
bloqueada: download Chromium devolveu arquivo inválido; navegador indisponível.
CI executa os quatro cenários. Promoção e término ainda precisam de validação
física na nova página. Nenhum merge realizado.


## Evolução Android — 06/10/2026

Branch: `feat/android-product-evolution`.

Escopo implementado:

- autosave e retomada;
- perfis de força por Elo e Skill Level;
- estilo preciso e estilo mais humano;
- UX mobile refeita;
- desfazer, revanche e reinício;
- modo prática com dica e feedback;
- análise pós-jogo local;
- PGN/FEN, compartilhamento e posições personalizadas;
- relógios;
- Worker Stockfish reutilizado entre lances;
- smoke test Android em emulador;
- pipeline de release assinado por tag;
- Android definido como produto principal.

Validação obrigatória antes de merge:

1. lint;
2. TypeScript;
3. Vitest + Stockfish WASM;
4. E2E Chromium;
5. assembleDebug + lintDebug;
6. connectedDebugAndroidTest em emulador.

Nenhum merge em `main` foi realizado.
