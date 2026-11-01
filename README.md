# Trama — jogos de letras e lógica

Jogo web original de palavras e lógica, em português, com **ranking das maiores
pontuações por partida** em cada modo. HTML, CSS e JavaScript puros (ES modules),
sem dependências.

## Como jogar localmente

O jogo carrega o dicionário via `fetch`, então precisa de um servidor local
(abrir o `index.html` direto pelo arquivo não funciona):

```bash
npm start            # ou: python3 -m http.server 8080
# abra http://localhost:8080
```

Também funciona em qualquer hospedagem estática (GitHub Pages, Netlify, Vercel…).

## Modos

Os modos ficam separados no menu e no código.

### Modos Clássicos (`js/modes/classicos/`)
| Modo | Como funciona | Pontuação |
|---|---|---|
| ⚡ **Grade Relâmpago** | Grade 4×4, 3 min. Ligue letras vizinhas (inclusive diagonais) para formar palavras. | 3 letras = 1 · 4 = 2 · 5 = 3 · 6 = 5 · 7 = 8 · 8 = 11 · 9 = 15 |
| 🔍 **Caça-Palavras** | Grade 12×12 com 10 palavras de um tema surpresa, em 8 direções. 4 min. | 10 por letra + 2 por segundo restante se achar todas |
| 🔢 **Sudoku** | 9×9, Fácil / Médio / Difícil (solução sempre única). Modo de notas. 3 erros encerram. | base (1500/3000/5000) − 2/s − 150/erro |

### Modos Novos — exclusivos Trama (`js/modes/novos/`)
| Modo | Como funciona |
|---|---|
| ⏳ **Sobrevivência** | Grade 5×5 viva. Começa com 60 s; cada palavra devolve tempo (cada vez menos ao longo da partida). Palavras de 6+ letras “explodem” e as peças viram letras novas. Renovar a grade custa 10 s. Bônus de 1 ponto a cada 10 s sobrevividos. |
| 📅 **Desafio do Dia** | Mesma grade para todos no mesmo dia (semente pela data), com casas ×2 e ×3 que multiplicam a palavra. Só a 1ª partida do dia vale para o ranking. |

## Controles
- **Arrastar** pelas letras (mouse ou dedo) e soltar envia a palavra.
- **Tocar** peça por peça; tocar de novo na última peça (ou “Enviar”) envia.
- **Teclado**: digite a palavra e aperte Enter (Backspace apaga, Esc limpa).
- Sudoku: números 1–9, setas para mover, `N` liga/desliga notas.

## Ranking
- Top 10 por modo (o Sudoku tem um ranking por dificuldade), guardado no
  `localStorage` do navegador. Mostra nome, pontos e data, com destaque para a sua partida.
- Para um ranking online compartilhado, basta trocar as funções de
  `js/core/ranking.js` por chamadas a uma API, mantendo a mesma interface.

## Estrutura
```
index.html
css/style.css
js/main.js                 menu, telas, resultado e ranking
js/core/                   motor compartilhado (grade, dicionário, sudoku, ranking, RNG)
js/modes/classicos/        modos clássicos
js/modes/novos/            modos novos
data/palavras.txt          dicionário (MPL 2.0 — ver data/README.md)
data/temas.js              temas do caça-palavras
tests/                     testes da lógica (npm test)
```

## Adicionar um modo
Crie um arquivo em `js/modes/classicos/` ou `js/modes/novos/` exportando
`{ id, category, name, icon, tagline, rules, start(root, api, opts) }`, chame
`api.end({ score, summary })` ao terminar e registre-o na lista correspondente em
`js/main.js`.
