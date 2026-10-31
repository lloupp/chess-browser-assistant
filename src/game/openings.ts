// Small offline opening book: SAN sequences from the initial position.
// The longest matching prefix wins; transpositions are not detected.
const BOOK:[string,string][]=[
  ['e4','Abertura do Peão do Rei'],
  ['d4','Abertura do Peão da Dama'],
  ['c4','Abertura Inglesa'],
  ['c4 e5','Inglesa: Siciliana Invertida'],
  ['Nf3','Abertura Réti'],
  ['e4 e5','Jogo Aberto'],
  ['e4 e5 Nf3 Nc6 Bb5','Abertura Espanhola (Ruy López)'],
  ['e4 e5 Nf3 Nc6 Bb5 a6','Espanhola: Variante Morphy'],
  ['e4 e5 Nf3 Nc6 Bb5 Nf6','Espanhola: Defesa Berlinense'],
  ['e4 e5 Nf3 Nc6 Bc4','Abertura Italiana'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5','Giuoco Piano'],
  ['e4 e5 Nf3 Nc6 Bc4 Bc5 b4','Gambito Evans'],
  ['e4 e5 Nf3 Nc6 Bc4 Nf6','Defesa dos Dois Cavalos'],
  ['e4 e5 Nf3 Nc6 d4','Abertura Escocesa'],
  ['e4 e5 Nf3 Nc6 Nc3 Nf6','Abertura dos Quatro Cavalos'],
  ['e4 e5 Nf3 Nf6','Defesa Petrov'],
  ['e4 e5 Nf3 d6','Defesa Philidor'],
  ['e4 e5 f4','Gambito do Rei'],
  ['e4 e5 Nc3','Abertura Vienense'],
  ['e4 e5 Bc4','Abertura do Bispo'],
  ['e4 e5 d4 exd4 c3','Gambito Dinamarquês'],
  ['e4 c5','Defesa Siciliana'],
  ['e4 c5 c3','Siciliana Alapin'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6','Siciliana Najdorf'],
  ['e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6','Siciliana Dragão'],
  ['e4 e6','Defesa Francesa'],
  ['e4 c6','Defesa Caro-Kann'],
  ['e4 d5','Defesa Escandinava'],
  ['e4 Nf6','Defesa Alekhine'],
  ['e4 d6','Defesa Pirc'],
  ['e4 g6','Defesa Moderna'],
  ['d4 d5 c4','Gambito da Dama'],
  ['d4 d5 c4 dxc4','Gambito da Dama Aceito'],
  ['d4 d5 c4 e6','Gambito da Dama Recusado'],
  ['d4 d5 c4 c6','Defesa Eslava'],
  ['d4 d5 Bf4','Sistema Londres'],
  ['d4 Nf6 Bf4','Sistema Londres'],
  ['d4 Nf6 c4 g6 Nc3 Bg7','Defesa Índia do Rei'],
  ['d4 Nf6 c4 g6 Nc3 d5','Defesa Grünfeld'],
  ['d4 Nf6 c4 e6 Nc3 Bb4','Defesa Nimzo-Índia'],
  ['d4 Nf6 c4 e6 Nf3 b6','Defesa Índia da Dama'],
  ['d4 Nf6 c4 c5 d5','Defesa Benoni'],
  ['d4 Nf6 c4 c5 d5 b5','Gambito Benko'],
  ['d4 f5','Defesa Holandesa']
];

export const OPENING_LINES=BOOK.map(([line,name])=>({moves:line.split(' '),name}));

export function openingName(history:string[]):string|undefined {
  let best:{moves:string[];name:string}|undefined;
  for(const entry of OPENING_LINES){
    if(entry.moves.length>history.length) continue;
    if(entry.moves.every((san,i)=>history[i]===san) && entry.moves.length>(best?.moves.length??0)) best=entry;
  }
  return best?.name;
}
