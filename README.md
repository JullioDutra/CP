# Trama — jogos de letras e lógica

Jogo web original de palavras e lógica, em português. Dá para jogar **sozinho** ou
**com amigos ao mesmo tempo** (mesma grade, placar ao vivo e pódio no fim). Não precisa
de cadastro: é só colocar o nome, escolher um avatar e criar a sala.

## Como rodar

```bash
npm install
npm start            # servidor do jogo + multijogador + ranking global em http://localhost:8080
                     # (precisa de Node 22.13 ou mais novo)
```

O terminal também mostra o endereço para **celulares na mesma rede Wi-Fi**
(ex.: `http://192.168.0.10:8080`). Quem cria a sala recebe um código de 4 letras e um
link para mandar aos amigos.

Os modos solo também funcionam num servidor estático simples
(`python3 -m http.server`), mas o multijogador precisa do `npm start`.

## Pontuação

Mínimo de **3 letras**. Palavras maiores valem muito mais:

| Letras | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10+ |
|---|---|---|---|---|---|---|---|---|
| Pontos | 1 | 2 | 4 | 7 | 11 | 16 | 22 | +7 por letra |

As palavras são sem acento (A vale por Á, Ã, Â…; C vale por Ç), o que permite mais combinações.

## Dicionário + palavras comuns + IA
- **~216 mil palavras** do dicionário pt_BR e **~35 mil palavras comuns** (inclui verbos
  conjugados como "comeu", "gostei", "falamos"), conferidas pelo corretor Hunspell.
- As grades são sorteadas para ter **muitas palavras conhecidas**, e as "palavras que ficaram
  de fora" mostram primeiro as mais conhecidas.
- **IA verificadora:** se alguém forma uma palavra que não está no dicionário, o servidor
  pergunta a um modelo de linguagem se ela existe. Se a IA aprovar, a palavra vale (marcada
  com ✨) e passa a valer para todo mundo daí em diante. As respostas ficam em cache.

### Configurar a IA (FreeLLM ou qualquer API compatível com OpenAI)
Copie `.env.example` para `.env` e preencha:

```bash
LLM_BASE_URL=http://localhost:3001/v1   # FreeLLMAPI, Groq, OpenRouter, Gemini, Ollama…
LLM_API_KEY=sua-chave                    # se o provedor pedir
LLM_MODEL=llama-3.3-70b-versatile
```

Sem `LLM_BASE_URL`, o jogo funciona normalmente e vale só o dicionário. Ao rodar
`npm start`, o terminal mostra se a IA está ligada.

**Conferir palavras antes de adicionar ao jogo** (ex.: um tema novo):
```bash
npm run verificar -- abacate zoeira xablau
npm run verificar -- --temas
```

## Jogar com amigos (multijogador)

1. **Criar ou entrar numa sala** → nome + avatar → **Criar sala** (ou digite o código / abra o link).
2. No saguão, o anfitrião 👑 escolhe o modo, o número de rodadas (1–5), o tempo (1 a 4 min) e a grade (**4×4, 5×5 ou 6×6**).
   Os outros marcam **Estou pronto!**.
3. Contagem 3-2-1, e todos recebem a **mesma grade** com o **mesmo relógio** (controlado pelo servidor).
4. Durante a rodada, o **placar ao vivo** mostra os pontos e a quantidade de palavras de cada um, sem mostrar quais palavras foram achadas.
5. No fim de cada rodada vem a **revelação animada**: as palavras de todos aparecem uma a uma, **da menor para a maior**,
   e as barras de cada jogador sobem e trocam de lugar conforme os pontos entram (começa rápido e vai desacelerando, com
   suspense nas maiores palavras). Cada linha mostra **quantas palavras** a pessoa fez. Dá para **pular**. Ao terminar, aparece
   o botão **📊 Mais estatísticas** com os detalhes: as palavras de todos aparecem (★ únicas em verde, repetidas em azul com
   👥 quantas pessoas acharam), o **tanque** mostra quantas foram únicas e quantas repetidas, além da maior palavra e das
   palavras que ninguém achou. **Ser única ou repetida não muda os pontos**: todo mundo que achou ganha.
6. Depois da última rodada aparece o **pódio** 🥇🥈🥉, e o anfitrião pode iniciar a **Revanche**.

| Modo | Tipo | Regra |
|---|---|---|
| ⚡ **Grade em Grupo** | clássico | Mesma grade (4×4, 5×5 ou 6×6); repetidas valem pontos; tanque de únicas × repetidas |
| 🔍 **Caça-Palavras Corrida** | clássico | Mesma grade 12×12; **quem marca primeiro** leva a palavra (10 pts/letra) |
| 🔢 **Sudoku Duelo** | clássico | Mesmo sudoku para todos; ganha pela **velocidade**, com bônus de pódio (+500/+250/+100) e −150 por erro |
| 💎 **Grade Bônus** | novo | Casas **×2 e ×3** multiplicam a palavra (as duas juntas = ×6) |
| ⏳ **Arena Sobrevivência** | novo | 60 s de vida; sua palavra te dá 1 s por letra e **tira 1 s de cada adversário**; o último vivo vence (+40/+20/+10) |
| 🤜 **Times** | novo | 🔴 × 🔵 sorteados; pontos somados por time; palavra repetida dentro do time não vale de novo |

### ⚡ Arena Pública (jogar com desconhecidos)
Botão **⚡ Arena Pública**: entra numa fila com 2 a 8 pessoas. Começa sozinha 20 s depois de ter 2 pessoas
(ou na hora com 8), sem anfitrião; as rodadas avançam sozinhas. No fim, **"Jogar outra"** volta para a fila.
As partidas da Arena mexem no seu **nível** (Elo, começa em 1000) e na **liga da temporada** (o mês):
🥉 Bronze · 🥈 Prata (1100) · 🥇 Ouro (1200) · 💠 Platina (1300) · 💎 Diamante (1450).

### Reações, conquistas e temas
- **Reações** (😂 😮 👏 🔥 😭 🤯 ❤️ 👀) no saguão e no resultado — aparecem para todos, inclusive no telão.
- **12 conquistas** (primeira vitória, palavra de 8 e de 10 letras, 100 pontos, 10 únicas, 3 e 7 dias seguidos no Desafio do Dia,
  Arena, Liga Ouro…). Algumas liberam **temas visuais**: Menta, Pêssego, Oceano e Noite estrelada.
- **Sequência 🔥** de dias seguidos no Desafio do Dia (no menu e no perfil).
- **⚑ Denúncia** de jogador na tela de estatísticas.

### 📲 Instalar no celular (PWA)
No celular, use "Adicionar à tela inicial". Os modos solo funcionam **sem internet**.

### 📺 Modo Telão
Abra **📺 Abrir Telão** numa TV ou computador: ele cria a sala e mostra um **QR code**.
Cada pessoa aponta o celular, entra com nome + avatar e joga pelo celular, que vira o
**controle** (sem o placar ao lado, porque ele aparece grande na TV). O telão mostra a grade
grande, o placar ao vivo, as palavras sendo achadas com a cor de cada jogador, as barras de
progresso do sudoku e o pódio. Também dá para abrir o telão de uma sala que já existe
(botão 📺 no saguão).

### 🔊 Sons
Os efeitos sonoros são gerados pelo navegador (sem arquivos): acerto, palavra grande, erro,
repetida, contagem 3-2-1, últimos 10 segundos e pódio. O botão 🔊/🔇 fica no topo.

O servidor valida tudo (palavra no dicionário, caminho na grade, tempo, limite de envios), então
ninguém consegue trapacear pelo navegador. Quem cair ou recarregar a página volta para a mesma sala
com as palavras e os pontos guardados.

## Modos

Os modos ficam separados no menu e no código.

## 🌍 Ranking global e perfil (sem login)
- **Perfil sem cadastro:** nome + avatar. O aparelho guarda um código secreto que junta as suas partidas.
  Para usar o mesmo perfil em outro aparelho: **Meu perfil → Copiar código** e colar no outro aparelho.
- **Ranking global** (com o servidor ligado): maiores pontuações **por partida**, uma linha por pessoa
  (a melhor partida), filtrando por **modo**, **tamanho da grade/nível** e **período** (Hoje, Semana, Sempre; fuso de Brasília).
  - **Em grupo:** todos os modos; as partidas são gravadas pelo servidor ao fim do jogo. Também tem o ranking de **mais vitórias**
    (só partidas com 2+ pessoas). No pódio aparece a sua posição na semana.
  - **Solo:** Grade Relâmpago (4×4, 5×5, 6×6) e Desafio do Dia. O servidor entrega a grade, controla o tempo e
    **recalcula os pontos** a partir das palavras enviadas, então não dá para trapacear editando a pontuação. No Desafio do Dia
    só a 1ª partida de cada pessoa vale.
  - Os outros modos solo continuam com o ranking **deste aparelho** (aba "📱 Neste aparelho").
- **Meu perfil:** partidas, vitórias, melhor partida, média, palavras achadas e únicas, maior palavra, modo favorito e histórico.
- Os dados ficam num banco SQLite em `data/runtime/trama.db` (SQLite embutido no Node 22.13+, nada para instalar).

## Modos solo

### Modos Clássicos (`js/modes/classicos/`)
| Modo | Como funciona | Pontuação |
|---|---|---|
| ⚡ **Grade Relâmpago** | Grade 4×4, 5×5 ou 6×6 (ranking separado por tamanho), 3 min. Ligue letras vizinhas (inclusive diagonais) para formar palavras. | tabela acima |
| 🔍 **Caça-Palavras** | Grade 12×12 com 10 palavras de um tema surpresa, em 8 direções. 4 min. | 10 por letra + 2 por segundo restante se achar todas |
| 🔢 **Sudoku** | 9×9, Fácil / Médio / Difícil (solução sempre única). Modo de notas. 3 erros encerram. | base (1500/3000/5000) − 2/s − 150/erro |

### Modos Novos — exclusivos Trama (`js/modes/novos/`)
| Modo | Como funciona |
|---|---|
| ⏳ **Sobrevivência** | Grade 5×5 viva. Começa com 60 s; cada palavra devolve tempo (cada vez menos ao longo da partida). Palavras de 6+ letras “explodem” e as peças viram letras novas. Renovar a grade custa 10 s. Bônus de 1 ponto a cada 10 s sobrevividos. |
| 📅 **Desafio do Dia** | Mesma grade para todos no mesmo dia (semente pela data), com casas ×2 e ×3 que multiplicam a palavra. Só a 1ª partida do dia vale para o ranking. |

## Visual
Tema claro e suave, pensado a partir de boas práticas para jogos de quebra-cabeça:
- fundo lavanda bem claro com toques de menta e pêssego; superfícies brancas com sombras leves;
- **1 cor principal** (lavanda/violeta) para ações e **1 secundária** (verde-água) para os modos novos;
- texto índigo escuro (contraste ≥ 13:1) e todos os textos/botões com contraste ≥ 4,5:1;
- estados nunca só por cor: ★ para única, 👥 para repetida, ✨ para IA, animação para erro;
- peças da grade menores e com mais espaço entre elas; fonte arredondada (Nunito);
- modo escuro automático e respeito a "reduzir movimento" do sistema.

## Tela da partida
Limpa de propósito: só o **tempo em cima**, pontos/palavras, a palavra que está sendo formada e a **grade ocupando quase a
tela inteira** (margem pequena). Regras e tabela de pontos aparecem só **antes** de começar (apresentação do modo e saguão).

## Controles
- **Arrastar** pelas letras (mouse ou dedo) e soltar envia a palavra.
- **Tocar** peça por peça; tocar de novo na última peça (ou “Enviar”) envia.
- **Teclado**: digite a palavra e aperte Enter (Backspace apaga, Esc limpa).
- Sudoku: números 1–9, setas para mover, `N` liga/desliga notas.

## Ranking
- Em grupo: o pódio de cada partida, e a sua pontuação vai para o seu ranking pessoal do modo.
- Top 10 por modo (o Sudoku tem um ranking por dificuldade), guardado no
  `localStorage` do navegador. Mostra nome, pontos e data, com destaque para a sua partida.
- Para um ranking online compartilhado, basta trocar as funções de
  `js/core/ranking.js` por chamadas a uma API, mantendo a mesma interface.

## Estrutura
```
index.html
css/style.css
js/main.js                 menu, telas, resultado e ranking
js/core/                   motor compartilhado (grade, dicionário, sudoku, ranking, RNG,
                           regras do multijogador em multimodes.js)
js/multi/                  telas e conexão do multijogador (inclui telão, corrida e duelo)
server/                    servidor Node: arquivos + salas em tempo real (WebSocket)
server/games/              regras de cada jogo em grupo (grade, caça-palavras, sudoku)
server/ai.js               verificador de palavras com IA
server/store.js            banco (SQLite): perfis, partidas, rankings, tickets das partidas solo
server/api.js              rotas /api (perfil, ranking, partidas solo verificadas, IA, QR)
js/screens/global.js       telas de ranking global e perfil
scripts/verificar-palavras.mjs   confere palavras no dicionário/IA
js/modes/classicos/        modos clássicos
js/modes/novos/            modos novos
data/palavras.txt          dicionário (MPL 2.0 — ver data/README.md)
data/comuns.txt            palavras comuns por frequência (CC BY-SA 4.0)
data/temas.js              temas do caça-palavras
docs/PLANO.md              planejamento das próximas fases
tests/                     testes da lógica (npm test)
```

## Adicionar um modo
Crie um arquivo em `js/modes/classicos/` ou `js/modes/novos/` exportando
`{ id, category, name, icon, tagline, rules, start(root, api, opts) }`, chame
`api.end({ score, summary })` ao terminar e registre-o na lista correspondente em
`js/main.js`.

## Testar o MVP
Roteiro passo a passo em [`docs/TESTE-MVP.md`](docs/TESTE-MVP.md).

## Hospedagem: Vercel + Supabase

A publicação usa Node 24 na Vercel (`api/server.js`), com arquivos públicos preparados por `npm run build`.
O servidor mantém o protocolo WebSocket do jogo e chama a função `trama-backend` do Supabase.
Perfis, partidas, rankings, ligas, conquistas e tickets ficam no PostgreSQL, no schema privado `trama`.
As salas também ficam no banco: cada comando restaura o estado, valida a jogada e salva tudo em uma transação.
As conexões recarregam o estado a cada segundo e retomam a sala com o código e token do jogador após reconexões.
Salas inativas por mais de 24 horas expiram; resultados e perfis permanecem.

- Projeto Supabase: `trama-cp` (São Paulo), organização Cadrius.
- `deployment/schema.sql`: estrutura do banco. RLS fica ativada sem políticas públicas por intenção: o navegador não acessa essas tabelas.
- `deployment/edge.ts`: função com conexão PostgreSQL, autenticação de servidor e transações.
- `deployment/dictionary.js`: cópia compactada dos dicionários, incluída na função para não depender de downloads no início de uma partida.
- Vercel: `TRAMA_BACKEND_URL` e `TRAMA_BACKEND_SECRET` são variáveis somente do servidor.
  O banco guarda apenas SHA-256 do segredo em `trama.backend_keys`. Nenhuma chave privilegiada vai para o navegador ou GitHub.
- A função faz autenticação própria via `x-trama-backend`; por isso o JWT do gateway é desativado.
- Alterações no frontend publicam pelo GitHub/Vercel. Mudanças na função e seus módulos precisam de novo deploy da Edge Function.
- A validação por IA é opcional e permanece desligada; os dicionários completos continuam funcionando.
- O modo local (`npm start`) continua usando SQLite e o servidor WebSocket original.

### Modo rápido (recomendado): o jogo direto na Vercel
Com a variável **`SUPABASE_DB_URL`** na Vercel, a própria função `api/server.js` roda o jogo e fala direto com o
Postgres (ambos em São Paulo). A instância fica "quente": dicionário e conexões são reaproveitados, e cada comando leva
dezenas de milissegundos em vez de 0,4–4,5 s (a Edge Function sobe do zero a cada chamada — motivo `EarlyDrop` nos logs).
Sem a variável, tudo continua como antes, pela Edge Function.

1. Supabase → projeto `trama-cp` → **Connect** → **Transaction pooler** → copie a URI (porta 6543) e troque `[YOUR-PASSWORD]`
   pela senha do banco.
2. Vercel → projeto `trama-cp` → **Settings → Environment Variables** → `SUPABASE_DB_URL` = essa URI
   (Production e Preview, tipo *Sensitive*).
3. **Redeploy** do projeto.

**Alternativa gratuita sem Supabase (Neon pela Vercel):** Vercel → projeto `trama-cp` → aba **Storage** →
**Create Database** → **Neon** (plano Free) → conecte ao projeto. A Vercel cria a variável `DATABASE_URL` sozinha.
Depois é só **Redeploy**: na primeira chamada o jogo cria as tabelas (`deployment/schema.sql`) no banco novo.
A ordem de preferência é `SUPABASE_DB_URL`, depois `DATABASE_URL`, depois `POSTGRES_URL`.

As salas usam uma trava **por sala** (salas diferentes andam em paralelo); a trava global só protege criar sala e
procurar partida na Arena.

### Verificação

`npm test` testa a lógica original e a restauração durável de salas, relógios, credenciais e gravação única do resultado.
`TRAMA_TEST_PG=postgres://… node tests/postgres.test.mjs` roda a integração com um Postgres de verdade (mesmo esquema):
perfil, partida solo verificada, ranking, ligas, partida em grupo com resultado gravado uma vez, 6 salas em paralelo e Arena.
Antes de publicar mudanças, confira também `/api/status`, criação/consulta de perfil, uma partida solo com resultado,
e dois jogadores na mesma sala (incluindo reconexão e pódio).
