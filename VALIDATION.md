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
| Playwright, extensão real | BLOQUEADO antes de carregar a extensão |
| Chess.com público | Não validado fisicamente |
| CI remoto | Não executado: repositório remoto vazio |
| Push / PR para main | Bloqueado: main inexistente e clone sem credencial de escrita |

Teste Playwright tentou Chrome for Testing 145.0.7632.6. O processo abortou
com `process_singleton_posix.cc: socket() failed: Operation not permitted`.
Os três cenários E2E estão implementados, mas não foram aprovados neste
ambiente. O teste integrado jsdom roda o build completo com mensagens de
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

O GitHub confirmou zero branches e respondeu 409 `Git Repository is empty`
à tentativa de criar uma árvore Git. A regra de não alterar main diretamente
foi preservada. Para publicar via conector e abrir a PR, o proprietário deve
inicializar `main` no GitHub com um README vazio ou commit inicial. Depois,
o conteúdo desta branch pode ser transplantado para uma branch a partir de
main e a PR pode ser criada sem merge automático.

## Teste físico curto

1. Extraia ZIP, carregue `dist/` em `chrome://extensions`.
2. Com Node 22.12+, rode `npm ci` e `npm run fixture`; abra
   `http://127.0.0.1:8787/chess-board.html`. Verifique seta, e4/e5, inverter e promoção.
3. No Chess.com, recarregue e inicie uma nova partida contra bot; escolha
   sua cor no popup. Confira sugestão no seu turno e pausa no turno do bot.
4. Abra uma rota humana (`/play/online`): popup deve mostrar assistência
   desativada e nenhuma seta. Não use esta extensão contra pessoas.

Não considerar o MVP integralmente aceito até Chromium, Chess.com e CI
serem validados. Não foi criada PR ou informado número inexistente.
