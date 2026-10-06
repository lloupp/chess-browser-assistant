# Chess Browser Assistant

Extensão Manifest V3 para Chrome/Chromium 116+, com Stockfish 18 lite WASM
local em Web Worker. Recomenda lances com destaque de origem, destino, seta,
promoção, profundidade e avaliação. Não move peças.

Uso suportado: Chess.com em `/play/computer`, `/analysis` e seus caminhos de
análise; tabuleiro de treino em `http://127.0.0.1:8787/chess-board.html`.
Outras rotas e partidas humanas identificadas são bloqueadas por código.
Não há configuração para desativar esse bloqueio.

## Jogar contra o computador

Abra o popup da extensão e clique **Jogar contra Stockfish**. Uma nova aba
abre um tabuleiro próprio: escolha brancas ou pretas e a dificuldade, depois
clique **Nova partida**. Toque ou clique na peça e no destino; as casas legais
são marcadas. Stockfish responde automaticamente apenas nesse tabuleiro.
Promoção permite escolher dama, torre, bispo ou cavalo. Roque, en passant,
xeque-mate e empates são controlados por chess.js; os lances ficam no histórico.

Os três níveis limitam a profundidade a 1, 4 e 10; são limites de busca,
não ratings Elo calibrados. Não há relógio nem persistência de partidas neste
ciclo. Nova partida cancela o cálculo anterior. Falhas oferecem tentativa nova.
O tabuleiro usa o Worker/WASM incluído na extensão, sem API ou conta.
Requer Chrome/Chromium com extensões no computador; Chrome Android não carrega
esta extensão. O layout é responsivo, mas isso não adiciona suporte a extensões
no Chrome Android.

## Instalação rápida

O ZIP **Chess_Browser_Assistant_Extensao.zip** contém somente os arquivos
compilados, com `manifest.json` e `content.js` na raiz. Código e testes estão
na branch `feat/local-training-mvp`, PR #1 deste repositório.

1. Extraia o ZIP.
2. Abra `chrome://extensions`, ative **Modo do desenvolvedor**.
3. Clique **Carregar sem compactação** e selecione a pasta extraída, onde
   estão `manifest.json` e `content.js`.
4. Recarregue a página do Chess.com. Abra **Bots** antes do primeiro lance,
   ou **Análise**. No popup, escolha suas peças: brancas ou pretas.
5. Aguarde a seta verde e mova as peças manualmente.

Se usar o ZIP completo **Chess_Browser_Assistant_MVP.zip** ou o código do
repositório, selecione **dist/** dentro de `chess-browser-assistant`.
Selecionar a pasta do código causa o erro “Não foi possível carregar
content.js”, pois ali o JavaScript ainda precisa ser compilado.

Contra computador, só recomenda quando for o turno da cor selecionada.
Inverter o tabuleiro não altera essa configuração. Na análise e no treino
local, calcula para o lado a jogar. O engine inicia ligado por padrão.

## Build e desenvolvimento

Requer Node.js 22.12+ e npm. Dependências possuem versões exatas e lockfile.

```sh
npm ci
npm run build
```

Alternativa: `npm install` e `npm run build`. Recarregue a extensão depois de
recompilar. `npm run build:dev` gera logs `[board]`, `[position]`, `[status]`
e `[engine]` no console da página. O build de produção não registra posições.

Para testar um tabuleiro local:

```sh
npm run fixture
```

Abra `http://127.0.0.1:8787/chess-board.html`. Botões: inicial, e4, e4 e5,
inverter, promoção e mate. O campo FEN permite testar posições próprias.
O servidor da fixture usa apenas loopback, sem engine nem análise remotos.

## Correção da posição

As peças são lidas por classes `.piece`, `wk/bk/...` e `square-11/...`.
Orientação branca/preta só afeta geometria. Nenhuma captura de tela é usada.

No Chess.com, o DOM de peças não informa todos os campos FEN. A extensão
começa da posição inicial conhecida e identifica um único movimento legal
entre observações usando chess.js. Isso preserva turno, roque, en passant,
contadores e promoção. Não supõe direitos de roque a partir da posição das
torres. FEN malformado, rei adversário atacado, roque incompatível e en
passant impossível são rejeitados antes de enviar ao engine.

Se carregar a extensão no meio da partida, avançar vários lances de uma vez,
voltar no histórico ou repetir uma disposição de peças, a análise para.
Informe os **seis campos do FEN completo** no popup para ressincronizar.
O FEN precisa corresponder às peças do tabuleiro. Para bots, a alternativa
mais fácil é abrir a extensão e iniciar uma nova partida.
O tabuleiro local fornece FEN completo e permite navegação livre.

Limitação: informações históricas ausentes não podem ser recuperadas só
pelas peças. Não há leitura do histórico PGN do Chess.com neste MVP.
Repetições exigem confirmação manual; preferimos parar a exibir um lance
com direitos de roque/contadores potencialmente incorretos.

## Arquitetura

| Módulo | Responsabilidade |
| --- | --- |
| `src/board/adapter.ts` | Detectar board, ler DOM, orientação, coordenadas e observar mudanças |
| `src/chess/position.ts` | Validar FEN/UCI e reconstruir movimentos legais |
| `src/guard.ts` | Allowlist de rotas e bloqueio de contexto humano |
| `src/content.ts` | Debounce, sincronização, geração das análises e estado da página |
| `src/background.ts` | Validar origem da mensagem e encaminhar para offscreen |
| `src/offscreen.ts` | Executar Workers locais, cancelar e limitar análise a uma aba por vez |
| `src/engine/uci.ts` | UCI/isready, análise, score/depth, legalidade, timeout e encerramento |
| `src/ui/overlay.ts` | Setas, destaques, promoção, resize/scroll, sem interceptar cliques |
| `src/popup.*` | Configuração e confirmação de FEN |

Cada análise recebe identificador crescente. Mudança de posição encerra o
Worker anterior; respostas antigas são ignoradas. Cancelamentos atrasados
não podem encerrar uma geração mais nova. Apenas um Worker calcula por vez
em toda a extensão; outra aba pode substituir a análise e a primeira
receberá mensagem de cancelamento. Fechar/navegar a aba encerra o Worker.
MutationObservers e ResizeObservers são desconectados na saída da página.

Profundidades 8/12/18; limite adicional de cálculo de 3 segundos, handshake
de 10 segundos e watchdog de análise de 15 segundos. Uma análise reinicia
o Worker para garantir isolamento UCI. A avaliação é relativa ao **lado a
jogar**, não sempre às brancas. Não há MultiPV neste ciclo.

## Privacidade, permissões e segurança

Toda análise é local; nenhum login, cookie, mensagem ou dado pessoal é lido.
Não há telemetria, servidor de análise ou API paga. JavaScript e WASM são
empacotados. CSP permite WASM e Worker somente da própria extensão.
O engine roda em uma página offscreen porque o content script não é o
contexto apropriado para carregar WASM/Worker com CSP Manifest V3.

| Permissão/acesso | Motivo |
| --- | --- |
| `storage` | Guardar somente configurações de treino |
| `offscreen` | Hospedar Worker WASM local |
| Content script em `https://www.chess.com/*` | Detectar transições SPA e bloquear rotas humanas |
| Content script na fixture de loopback | Testar tabuleiro local explicitamente suportado |

Não solicita cookies, debugger, scripting, activeTab, tabs ou acesso a todos
os sites. Não usa scripts remotos, eval ou new Function no código da
extensão. O teste de build usa eval **somente no harness Node/jsdom** para
executar os bundles; não é empacotado na extensão.

## Testes

```sh
npm run lint
npm run typecheck
npm test
npm run test:integration
npx playwright install --with-deps chromium
npm run test:e2e
```

`npm test` também constrói `dist/` e executa 39 testes: FEN, histórico,
roque, en passant, promoção, geometria de 64 casas nas duas orientações,
DOM, MutationObserver/debounce, duplicação, guardrail, configuração,
handshake UCI, cancelamento, timeout, movimentos legais e Stockfish WASM real.
O teste do build usa APIs de extensão e DOM simulados, roteando os bundles
content/background/offscreen para um processo Stockfish real.

E2E Playwright carrega a extensão real no Chromium: fixture → Worker WASM
→ bestmove → overlay → movimento → nova análise, inversão, promoção,
mate, popup e transição SPA para rota humana. O cenário Chess.com usa uma
fixture interceptada: valida a integração com o contrato DOM, não comprova
que os seletores atuais do site público foram verificados.

Pode usar `CHROMIUM_PATH=/caminho/para/chrome npm run test:e2e` com Chrome
for Testing. GitHub Actions instala Chromium, executa as verificações e
publica um ZIP de `dist/` como artifact. Não publica na Chrome Web Store.

**Validação local:** lint/typecheck, 39 testes e build passaram. O ambiente
local proíbe `socket()` e Chrome aborta ao criar o perfil. O E2E real roda
agora no GitHub Actions; veja os resultados na
[PR #1](https://github.com/lloupp/chess-browser-assistant/pull/1) e em
`VALIDATION.md`. A validação física do Chess.com público continua pendente.

## Adicionar um adapter

Implemente `BoardAdapter`: elemento, `readPosition`, `getOrientation`,
`squareToScreen`, `observeChanges` e `isAllowedContext`; altere a seleção em
`content.ts`. Retorne `placement` e FEN completo apenas se a fonte for
confiável. Inclua testes de geometria e de sincronização. Depois adicione
rotas explicitamente permitidas no guard e permissões mínimas no manifest.
Nunca amplie a permissão para jogos humanos ou crie opção de bypass.

## Troubleshooting

- **Aguardando tabuleiro:** recarregue a página após instalar; confirme rota
  suportada. DOM diferente ou shadow root fechado requer adapter atualizado.
- **Abra antes do primeiro lance/perda de sincronização:** reinicie a
  partida ou confirme FEN completo no popup. Não altere somente o turno.
- **Aguardando adversário:** escolha suas peças corretamente no popup.
- **Timeout/erro no engine:** desligue e ligue o engine; veja os erros da
  extensão em `chrome://extensions` e use o build de desenvolvimento.
- **Sem overlay:** verifique Engine/Overlay ligados e posição confiável;
  posição de mate/stalemate não tem sugestão.
- **Assistência desativada:** a rota não é suportada ou há evidência de
  partida humana. Não há bypass.
- **Chrome não inicia no CI/container:** confirme suporte a sockets locais;
  o erro `process_singleton_posix.cc: socket() failed` ocorre antes da extensão.

Licenças e fontes de terceiros estão em `THIRD-PARTY.md`. Código próprio:
GPL-3.0-or-later; distribuição do Stockfish inclui o texto GPL.
