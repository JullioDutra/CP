# Trama — Plano para multijogador competitivo

**Objetivo:** várias pessoas jogam a mesma partida ao mesmo tempo, veem o placar ao vivo
e no final sabem quem fez mais pontos. Palavras grandes valem muito mais. Rankings globais
mantêm a disputa depois da partida.

Hoje o Trama roda só no navegador. A grade é gerada no aparelho e o ranking fica no
`localStorage`. Para várias pessoas jogarem juntas precisamos de um **servidor**: ele
sorteia a grade, controla o relógio, valida as palavras e guarda os rankings.

---

## 1. Pontuação nova (palavras grandes valem muito mais)

Regra geral: **mínimo de 3 letras**. Palavras com 1 ou 2 letras são recusadas e não pontuam.

| Letras | Hoje | **Nova** |
|---|---|---|
| 3 | 1 | **1** |
| 4 | 2 | **2** |
| 5 | 3 | **4** |
| 6 | 5 | **7** |
| 7 | 8 | **11** |
| 8 | 11 | **16** |
| 9 | 15 | **22** |
| 10 ou mais | 15 + 4 por letra | **22 + 7 por letra extra** |

Uma palavra de 8 letras passa a valer **16 palavras de 3 letras**, então vale a pena
procurar palavras longas. A tabela fica num único lugar (`wordPoints`), usada pelo
cliente e pelo servidor.

**Bônus extras no multijogador** (podem ser ligados ou desligados na sala):
- **Palavra exclusiva:** se só você achou a palavra, ganha pontos extras (ver as regras na seção 3).
- **Primeiro a achar:** +1 para quem enviou primeiro uma palavra de 6 letras ou mais.
- **Sequência:** 3 palavras válidas em menos de 10 s dão ×1,2 nas próximas 3 palavras.

---

## 2. Como funciona jogar junto (o que vem do gênero)

Estas funções vêm dos jogos de palavras em grupo, como o que você mostrou:

1. **Sala com código:** alguém cria a sala e recebe um código de 4 letras (ex.: `KJWP`) e um
   **QR code**. Os outros entram pelo código ou pelo link, sem instalar nada.
2. **Tela principal + celular como controle (opcional):** a grade grande aparece na TV ou no
   computador (modo "Telão"), e cada jogador forma as palavras no próprio celular.
   Também dá para jogar sem telão, cada um no seu aparelho.
3. **Saguão:** a lista de jogadores com avatar e cor, o botão "Pronto" e o anfitrião
   escolhendo o modo, o número de rodadas e o tempo.
4. **Rodadas sincronizadas:** contagem 3-2-1, todos recebem **a mesma grade** e o **mesmo
   relógio**, controlado pelo servidor.
5. **Placar ao vivo durante a rodada:** mostra a pontuação e a quantidade de palavras de cada
   um, sem revelar quais palavras foram achadas.
6. **Revelação no fim da rodada:** as palavras aparecem uma a uma. As repetidas entre
   jogadores são riscadas e as exclusivas brilham. No fim aparece a maior palavra da rodada.
7. **Várias rodadas e pódio final:** 3 rodadas por padrão, placar acumulado e pódio com 🥇🥈🥉.
8. **Revanche:** um botão "Jogar de novo" mantém a mesma sala e os mesmos jogadores.

---

## 3. Modos multijogador (clássicos e novos separados)

### Clássicos (regras conhecidas do gênero)
| Modo | Regras |
|---|---|
| **Grade Relâmpago em Grupo** | 4×4 (ou 5×5), 3 rodadas de 3 min. **Regra clássica: uma palavra achada por 2 ou mais jogadores não pontua para ninguém.** Isso obriga a procurar palavras que os outros não veem. |
| **Caça-Palavras Corrida** | Todos jogam na mesma grade e no mesmo tema. Quem marca a palavra primeiro leva os pontos, e ela fica com a cor desse jogador para todos. |
| **Sudoku Duelo** | O mesmo sudoku para todos. Vence quem resolve primeiro; erros custam tempo. |

### Novos (exclusivos do Trama)
| Modo | Regras |
|---|---|
| **Grade Amigável** | Igual à Relâmpago, mas palavras repetidas **pontuam**. Palavras exclusivas ganham **+50%**. Mais leve para jogar em família. |
| **Arena Sobrevivência** | Todos começam com 60 s. Suas palavras **roubam 1 s** de cada adversário. Quem zerar o tempo está fora e vence o último que sobrar. |
| **Times 2×2 / 3×3** | Pontos somados por time e palavras compartilhadas dentro do time. Palavras repetidas entre times anulam. |
| **Desafio do Dia Global** | Uma grade por dia para todo mundo, uma tentativa e ranking mundial do dia. |
| **Arena Pública** | Botão "Jogar agora" que junta de 2 a 8 desconhecidos numa sala automática. |

---

## 4. Arquitetura

```
Navegador / celular (o Trama atual + telas de sala)
        │  WebSocket (tempo real)        HTTPS (rankings, perfil)
        ▼
Servidor Node.js  ──────────────  Banco Postgres
 • salas em memória              • jogadores, partidas, palavras
 • grade, relógio e validação    • rankings (dia / semana / sempre)
 • dicionário carregado
```

**Recomendação:** **Node.js + Socket.IO** (reconecta sozinho e organiza as salas) e
**Postgres** (Supabase ou Neon, ambos com plano grátis). Um único serviço publicado no
Render, Railway ou Fly.io serve o jogo, o tempo real e a API.

*Alternativa sem servidor próprio:* Supabase Realtime com Edge Functions. É mais simples de
hospedar, mas fica mais difícil impedir trapaça, porque a validação das palavras precisa
rodar no servidor de qualquer jeito.

**O servidor manda em tudo que vale ponto:**
- O servidor sorteia a semente da grade e controla o relógio. O cliente só exibe.
- O servidor confere cada palavra (está no dicionário? o caminho existe na grade?) e
  recusa palavras enviadas depois do tempo.
- Limite de envios por segundo para barrar robôs.
- Assim ninguém consegue editar a pontuação pelo navegador.

### Mensagens (protocolo)
| Direção | Evento | Conteúdo |
|---|---|---|
| C→S | `room:create` | modo, opções |
| C→S | `room:join` | código, nome, avatar |
| S→C | `room:state` | jogadores, anfitrião, opções, fase |
| C→S | `player:ready` | — |
| S→C | `round:start` | número da rodada, grade, bônus, `endsAt` (hora do servidor) |
| C→S | `word:submit` | palavra, caminho de peças |
| S→C | `word:result` | ok / inválida / repetida, pontos provisórios |
| S→todos | `score:update` | `{jogador: pontos, nº de palavras}` (sem as palavras) |
| S→C | `round:end` | palavras de todos, anuladas, exclusivas, pontos finais |
| S→C | `match:end` | placar final, pódio, posição no ranking global |

### Banco de dados
- `players`: id, nome, avatar, criado_em (login opcional na fase 4)
- `matches`: id, modo, semente, opções, criada_em, encerrada_em
- `match_players`: partida, jogador, pontos, posição, palavras_achadas
- `match_words`: partida, rodada, jogador, palavra, pontos, exclusiva
- views de ranking: **por partida** (maior pontuação numa partida), **diário**, **semanal**,
  **de todos os tempos**, separadas por modo

---

## 5. Fases de entrega

### Fase 0 — Ajustes rápidos (1–2 dias)
- [ ] Nova tabela de pontos (seção 1) em todos os modos, com mínimo de 3 letras explícito na interface.
- [ ] Mostrar a tabela de pontos na tela da partida (um "3=1 · 4=2 · 5=4 …" discreto).
- [ ] Dicionário em duas camadas: a lista grande para **aceitar** palavras e uma lista de
      palavras comuns para **gerar grades** e mostrar as "palavras perdidas" (evita palavras raras como "escoucear").
- [ ] Mostrar palavras com acento quando existir a forma acentuada (SERTÃO em vez de SERTAO).

### Fase 1 — Servidor e salas privadas (1–2 semanas)
- [ ] Projeto `server/` (Node + Socket.IO) que serve os arquivos estáticos atuais.
- [ ] Código compartilhado entre cliente e servidor: grade, pontuação, dicionário e RNG (`js/core/`).
- [ ] Criar e entrar em sala por código ou link, saguão, "Pronto" e anfitrião.
- [ ] Modo **Grade Relâmpago em Grupo** completo: rodadas, relógio do servidor, validação,
      regra de repetidas anuladas, placar ao vivo, revelação e pódio.
- [ ] Reconexão: quem cair volta para a mesma sala com os pontos guardados.
- **Pronto quando:** 4 pessoas em aparelhos diferentes jogam 3 rodadas e todas veem o mesmo resultado.

### Fase 2 — Mais modos em grupo e o modo Telão (1–2 semanas)
- [ ] Grade Amigável, Caça-Palavras Corrida e Sudoku Duelo.
- [ ] **Modo Telão** (`/tv`): grade grande, QR code para entrar e animação da revelação.
- [ ] **Modo Controle** (`/play`): tela de celular só com a grade e a palavra atual.
- [ ] Efeitos sonoros (palavra certa, repetida, últimos 10 s) com botão de mudo.

### Fase 3 — Ranking global e perfis (1 semana)
- [ ] Gravar cada partida no Postgres.
- [ ] Página de ranking: **Maior pontuação por partida**, Hoje, Semana e Sempre, por modo.
- [ ] Perfil simples: nome + avatar e, opcionalmente, login com Google para não perder o histórico.
- [ ] Estatísticas pessoais: maior palavra, média de pontos, vitórias.
- [ ] Desafio do Dia Global com ranking mundial do dia.

### Fase 4 — Competitivo de verdade (2 semanas)
- [ ] **Arena Pública** com fila automática (2–8 jogadores e início em 20 s ou com a sala cheia).
- [ ] **Classificação por nível** (Elo simplificado) e ligas Bronze → Diamante, com temporadas mensais.
- [ ] Arena Sobrevivência e Times.
- [ ] Antitrapaça: limite de envios, detecção de pontuação impossível e denúncia de jogador.

### Fase 5 — Diversão e retenção (contínuo)
- [ ] Conquistas: "Primeira palavra de 8 letras", "10 exclusivas numa rodada", "7 dias seguidos no Desafio".
- [ ] Sequência diária com chama 🔥 e lembrete.
- [ ] Reações rápidas no saguão e na revelação (😂 😮 👏).
- [ ] Temas visuais desbloqueáveis por conquista (sem compras).
- [ ] PWA: instalar no celular e jogar os modos solo offline.

---

## 6. O que deixa divertido e competitivo
- **Tensão de tempo:** relógio grande, piscando nos últimos 10 s.
- **Risco e recompensa:** palavras longas valem muito, mas levam tempo, e as repetidas anulam.
- **Momento de revelação:** o melhor da partida em grupo é ver a palavra que só você achou.
- **Revanche em 1 toque** e placar acumulado da noite.
- **Metas fora da partida:** ranking diário, ligas e conquistas trazem o jogador de volta.
- **Partida curta:** 3 rodadas, cerca de 10 minutos.

## 7. Riscos e decisões
| Tema | Decisão sugerida |
|---|---|
| Hospedagem | Render/Railway (Node) + Supabase/Neon (Postgres), com plano grátis no início |
| Login | Começar só com nome; login com Google na fase 3 |
| Dicionário | Validar no servidor; lista "comum" para gerar grades |
| Latência | Relógio pelo horário do servidor (`endsAt`) e tolerância de 300 ms no fim |
| Nomes ofensivos | Filtro de palavrões nos nomes de jogador |
| Custo | Salas ficam em memória; o banco só grava o fim da partida |
