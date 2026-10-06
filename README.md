# Xadrez Local

Aplicativo Android de xadrez **offline**, sem conta e sem permissão de internet.
O tabuleiro, as regras, a análise e o Stockfish 18 lite WASM ficam dentro do APK.

O produto principal deste repositório agora é o app Android. A extensão Chrome
original continua preservada como implementação secundária e está documentada em
\`docs/EXTENSION.md\`.

## O que o app faz

- joga contra Stockfish local de brancas ou pretas;
- cinco perfis de força: Iniciante, Casual, Intermediário, Forte e Mestre;
- dois estilos de adversário:
  - **Precisão por Elo** usa \`UCI_LimitStrength\` + \`UCI_Elo\`;
  - **Mais humano** usa \`Skill Level\` para permitir mais imperfeições;
- modo **Prática** com dica e avaliação do lance;
- salva automaticamente e retoma a partida ao reabrir;
- desfazer, revanche e reinício seguro durante cálculo;
- relógios 5 min, 10 min e 15+10;
- importação e exportação PGN/FEN;
- jogar a partir de qualquer FEN válido;
- compartilhamento da partida;
- análise pós-jogo totalmente local, destacando os piores lances;
- promoção, roque, en passant, xeque-mate e empates via chess.js;
- interface Android-first, responsiva, com foco visível e alvos de toque adequados.

Nenhuma partida é enviada para servidor.

## Arquitetura

\`\`\`text
Android MainActivity
  └─ WebViewAssetLoader
      ├─ play.html / play.css
      ├─ play.ts
      │   ├─ game/config.ts
      │   ├─ game/persistence.ts
      │   ├─ game/review.ts
      │   └─ chess.js
      └─ Web Worker
          └─ Stockfish 18 lite WASM
\`\`\`

### Componentes principais

| Módulo | Responsabilidade |
| --- | --- |
| \`src/play.ts\` | Fluxo da partida, relógios, UX, treino, import/export e análise |
| \`src/game/config.ts\` | Perfis de força, estilo e controles de tempo |
| \`src/game/persistence.ts\` | Autosave e restauração defensiva |
| \`src/game/review.ts\` | Conversão de avaliação e classificação de lances |
| \`src/engine/uci.ts\` | Handshake UCI, opções, busca, timeout e validação |
| \`android/.../MainActivity.java\` | Host WebView local e bloqueio de navegação remota |

O Worker principal permanece ativo entre lances da mesma partida. Nova partida,
desfazer, mudança de perfil, timeout ou saída encerram trabalhos obsoletos.

## Privacidade e segurança

O Manifest Android não solicita \`INTERNET\`.
O WebView usa apenas \`https://appassets.androidplatform.net/assets/\` e bloqueia
requisições externas. Acesso direto a arquivos e content providers fica desativado.

O app usa \`localStorage\` apenas para salvar o estado local da partida. Não existe
login, telemetria ou backend.

## Build

Requisitos:

- Node.js 22.12+
- JDK 17
- Android SDK 35
- Gradle 8.9

\`\`\`sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build:android
gradle -p android :app:assembleDebug :app:lintDebug
\`\`\`

O APK de desenvolvimento fica em:

\`\`\`text
android/app/build/outputs/apk/debug/app-debug.apk
\`\`\`

## Testes

A suíte cobre:

- regras/FEN e histórico;
- UCI e Stockfish WASM real;
- cancelamentos, timeouts e respostas antigas;
- perfis de força;
- persistência e restauração;
- classificação da análise;
- E2E Chromium da extensão e do tabuleiro próprio;
- smoke test Android em emulador, verificando WebView, tabuleiro, WASM empacotado
  e ausência da permissão INTERNET.

Workflows:

- **Extension quality**
- **Android APK**
- **Android device test**

## Releases Android

Tags \`v*\` acionam o workflow **Android release**.

Para gerar um APK release assinado, configure estes secrets no GitHub:

- \`ANDROID_KEYSTORE_BASE64\`
- \`ANDROID_KEYSTORE_PASSWORD\`
- \`ANDROID_KEY_ALIAS\`
- \`ANDROID_KEY_PASSWORD\`

O workflow compila, assina via configuração Gradle e publica o APK na GitHub Release.

## Limites atuais

- os rótulos de Elo são níveis aproximados de força do motor, não rating garantido;
- o estilo “Mais humano” continua sendo Stockfish com força reduzida, não um modelo
  neural treinado para imitar uma pessoa específica;
- a análise pós-jogo prioriza utilidade local e velocidade, não profundidade de
  análise profissional;
- o APK de CI comum é debug; distribuição pública deve usar o workflow assinado;
- ainda é recomendável validar ergonomia e desempenho em aparelhos Android reais
  de diferentes tamanhos.

## Extensão desktop

A extensão Chrome MV3 original continua disponível no repositório. Ela suporta
Chess.com apenas em contextos de treino/bots/análise e bloqueia partidas humanas
por código. Consulte \`docs/EXTENSION.md\`.

## Licenças

Código próprio: GPL-3.0-or-later.

Stockfish e demais componentes de terceiros estão descritos em
\`THIRD-PARTY.md\`. O APK inclui os avisos e licenças necessários.
