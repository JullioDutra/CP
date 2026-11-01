# Trama — Plano para multijogador competitivo

**Objetivo:** várias pessoas jogam a mesma partida ao mesmo tempo, veem o placar ao vivo
e no final sabem quem fez mais pontos. Palavras grandes valem muito mais. Rankings globais
mantêm a disputa depois da partida.

Hoje o Trama roda só no navegador. A grade é gerada no aparelho e o ranking fica no
`localStorage`. Para várias pessoas jogarem juntas precisamos de um **servidor**: ele
sorteia a grade, controla o relógio, valida as palavras e guarda os rankings.

## Decisões tomadas
- **Sem acento** nas palavras: A vale por Á/Ã/Â e C por Ç, o que dá mais combinações. O dicionário foi ampliado para 3–12 letras (cerca de 216 mil palavras).
- **Sem login:** só nome + avatar, depois criar ou entrar na sala.
- **Hospedagem por último**, provavelmente na **Vercel** (ver a seção 8).

## Status
- ✅ **Fase 0:** pontuação nova, mínimo de 3 letras e tabela de pontos visível na partida.
- ✅ **Fase 1:** servidor, salas privadas com código/link, saguão, Grade em Grupo (clássico) e
  Grade Amigável (novo), placar ao vivo, revelação, pódio, revanche e reconexão.
- ✅ **Fase 2:** Caça-Palavras Corrida, Sudoku Duelo, Modo Telão (QR code + celular como
  controle), sons, **palavras comuns** (35 mil, com verbos conjugados) e **IA verificadora** de palavras.
- ✅ **Ajustes pós-Fase 2:** palavras repetidas **valem pontos** (só aparecem no "tanque" de únicas × repetidas);
  Grade Amigável virou **Grade Bônus** (casas ×2/×3); **grade 6×6** (solo e em grupo); novo visual claro e suave.
- ✅ **Fase 3:** ranking global (por partida, por modo/variante, Hoje/Semana/Sempre, mais vitórias),
  perfis sem login (nome + avatar + código para levar a outro aparelho), estatísticas e histórico,
  partidas solo verificadas pelo servidor (Grade Relâmpago e Desafio do Dia).
- ✅ **Ajustes pós-Fase 3:** tela da partida limpa (tempo em cima, grade quase em tela cheia, regras só no início) e
  **revelação animada** do resultado (palavras da menor para a maior, barras subindo, suspense, contagem de palavras,
  botão "Mais estatísticas").
- ⏭️ Próximo: **Fase 4** (Arena Pública, ligas e temporadas, Arena Sobrevivência e Times).

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
| **Grade Relâmpago em Grupo** | 4×4 (ou 5×5), 3 rodadas de 3 min. **Decisão:** palavras repetidas valem pontos para todos; o fim da rodada mostra o tanque de únicas × repetidas. |
| **Caça-Palavras Corrida** | Todos jogam na mesma grade e no mesmo tema. Quem marca a palavra primeiro leva os pontos, e ela fica com a cor desse jogador para todos. |
| **Sudoku Duelo** | O mesmo sudoku para todos. Vence quem resolve primeiro; erros custam tempo. |

### Novos (exclusivos do Trama)
| Modo | Regras |
|---|---|
| **Grade Bônus** | Mesma grade com casas ×2 e ×3 que multiplicam a palavra (substituiu a Grade Amigável). |
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

**Recomendação:** **Node.js + WebSocket** (`ws`, com reconexão própria) e
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

### Fase 0 — Ajustes rápidos ✅
- [x] Nova tabela de pontos (seção 1) em todos os modos, com mínimo de 3 letras explícito na interface.
- [x] Mostrar a tabela de pontos na tela da partida.
- [x] Dicionário ampliado para 3–12 letras, sem acento (mais combinações).
- [ ] (opcional) Lista de palavras comuns só para destacar as "palavras perdidas" mais conhecidas.

### Fase 1 — Servidor e salas privadas ✅
- [x] Projeto `server/` (Node + WebSocket `ws`) que serve os arquivos estáticos atuais.
- [x] Código compartilhado entre cliente e servidor: grade, pontuação, dicionário e RNG (`js/core/`).
- [x] Criar e entrar em sala por código ou link, perfil com nome + avatar, saguão, "Pronto" e anfitrião.
- [x] **Grade em Grupo** (clássico) e **Grade Amigável** (novo): rodadas, relógio do servidor,
      validação, placar ao vivo, revelação e pódio.
- [x] Reconexão: quem cair volta para a mesma sala com os pontos guardados.

### Fase 2 — Mais modos em grupo e o Modo Telão ✅
- [x] Caça-Palavras Corrida e Sudoku Duelo (a Grade Amigável já estava pronta).
- [x] **Modo Telão** (`?tela=CÓDIGO`): grade grande, QR code para entrar, placar e revelação.
- [x] **Modo Controle**: com telão conectado, o celular mostra só a grade e as suas palavras.
- [x] Efeitos sonoros (acerto, repetida, últimos 10 s, pódio) com botão de mudo.
- [x] **Palavras comuns**: lista de frequência conferida pelo Hunspell; grades priorizam palavras conhecidas.
- [x] **IA verificadora** (qualquer API compatível com OpenAI, como FreeLLM, Groq ou OpenRouter): confere palavras
      fora do dicionário, com cache, limite de uso e script `npm run verificar`.

### Fase 3 — Ranking global e perfis ✅
- [x] Gravar cada partida em grupo no banco (SQLite embutido; interface pronta para trocar por Postgres).
- [x] Ranking global: **maior pontuação por partida** (1 linha por pessoa), Hoje, Semana (fuso de Brasília) e Sempre,
      por modo e por tamanho de grade/nível; ranking de **mais vitórias** em grupo.
- [x] Perfil **sem login**: nome + avatar; código secreto para usar o perfil em outro aparelho.
- [x] Estatísticas: partidas, vitórias, melhor partida, média, palavras, únicas, maior palavra, modo favorito, histórico.
- [x] Partidas solo verificadas: o servidor entrega a grade (ticket), confere o tempo e recalcula os pontos.
- [x] Desafio do Dia no ranking global (1 partida oficial por pessoa por dia).

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
| Hospedagem | Por último. Vercel para o jogo; o tempo real precisa de um complemento (seção 8) |
| Login | **Sem login**: nome + avatar. O ranking global da fase 3 usa um apelido, sem conta |
| Dicionário | Validar no servidor; lista "comum" para gerar grades |
| Latência | Relógio pelo horário do servidor (`endsAt`) e tolerância de 300 ms no fim |
| Nomes ofensivos | Filtro de palavrões nos nomes de jogador |
| Custo | Salas ficam em memória; o banco só grava o fim da partida |

## 8. Hospedagem na Vercel (última etapa)
A Vercel hospeda muito bem a parte estática (`index.html`, `css/`, `js/`, `data/`), mas as
**Vercel Functions não mantêm conexões WebSocket abertas**, e o multijogador depende delas.
Há duas saídas:

1. **Vercel + servidor de tempo real separado (mais simples, recomendada):** o jogo fica na
   Vercel e a pasta `server/` vai para o Render, Railway ou Fly.io, sem mudar o código.
   Basta definir `window.TRAMA_WS_URL = 'wss://trama-server.onrender.com/ws'` no `index.html`.
2. **Tudo "serverless" (Vercel + Ably/Pusher/Supabase Realtime):** troca a camada
   `js/multi/net.js` e move a validação de palavras e o relógio para funções da Vercel
   com o estado no banco. Dá mais trabalho e muda o motor de salas.

Em qualquer caso, o ranking global (fase 3) pode usar o Postgres da Vercel ou do Supabase/Neon.
