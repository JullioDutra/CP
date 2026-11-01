# Roteiro de teste do MVP do Trama

Tempo total: cerca de **40 minutos** com 3 pessoas (ou 1 pessoa com 3 abas/aparelhos).

## 0. Preparar (5 min)
1. No computador, com **Node 22.13+**:
   ```bash
   npm install
   npm start
   ```
2. O terminal mostra dois endereços. Use o da **rede Wi-Fi** (ex.: `http://192.168.0.10:8080`) nos celulares —
   todos precisam estar no **mesmo Wi-Fi** do computador.
3. (Opcional) IA de palavras: copie `.env.example` para `.env`, preencha `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`
   do FreeLLM (ou outro serviço compatível com OpenAI) e reinicie com `npm start`. O terminal deve dizer "IA de palavras: ligada".

> Dica: para testar sozinho, abra várias **janelas anônimas** (cada uma vira um jogador diferente).

## 1. Solo (10 min) — 1 pessoa
| # | Faça | Deve acontecer |
|---|---|---|
| 1.1 | Toque no seu nome/“Criar perfil” no topo, coloque nome e avatar, **Salvar** | Perfil criado (aparece no topo do menu) |
| 1.2 | **Grade Relâmpago** → escolha **6×6** → Jogar | Tempo em cima, grade quase em tela cheia, **sem instruções** |
| 1.3 | Forme palavras arrastando o dedo; tente uma com **2 letras** e uma que **não existe** | 2 letras: “Mínimo 3 letras”; inexistente: recusada (ou ✨ confirmada, se a IA estiver ligada e a palavra existir) |
| 1.4 | **Encerrar** | Animação: suas palavras entram da menor para a maior, barra subindo; depois posição no **ranking global** |
| 1.5 | Jogue de novo e faça mais pontos | A barra passa o **👻 Seu recorde** → “🏆 Novo recorde!” |
| 1.6 | **📊 Mais estatísticas** | Palavras que ficaram de fora (as mais conhecidas primeiro) |
| 1.7 | **Desafio do Dia** duas vezes | 1ª vale para o ranking; 2ª aparece como **treino** |
| 1.8 | Caça-Palavras, Sudoku e Sobrevivência solo (rápido) | Abrem, jogam e terminam sem erro |

## 2. Em grupo com Telão (15 min) — 3 pessoas
| # | Faça | Deve acontecer |
|---|---|---|
| 2.1 | No computador/TV: **📺 Abrir Telão → Criar sala neste telão** | Aparece **QR code** e o código da sala |
| 2.2 | Nos celulares: ler o QR code, nome + avatar, **Entrar** | Avatares aparecem no telão; o 1º a entrar é o anfitrião 👑 |
| 2.3 | Toque nas **reações** (😂 🔥 …) | Emoji sobe na tela de todos e no telão |
| 2.4 | Anfitrião: **Grade em Grupo**, 1 rodada, 1:00, **Começar** | Contagem 3-2-1; grade grande no telão; celular mostra só a grade (controle) |
| 2.5 | Achem palavras; **dois achem a mesma** | Ambos ganham os pontos |
| 2.6 | Fim da rodada | Revelação animada no telão e nos celulares: palavras da menor para a maior, **barras subindo**, suspense nas maiores, **quantas palavras cada um fez** |
| 2.7 | **📊 Mais estatísticas** | Tanque de **únicas × repetidas**, palavras de cada um (★ única, 👥 repetida) |
| 2.8 | **🔁 Revanche** → teste **Caça-Palavras Corrida**, **Sudoku Duelo**, **Grade Bônus**, **Arena Sobrevivência** e **Times** | Cada modo funciona; Times mostra 🔴 × 🔵; Sobrevivência mostra a sua vida ❤️ e elimina quem zera |

## 3. Arena Pública e ligas (5 min) — 2 pessoas
| # | Faça | Deve acontecer |
|---|---|---|
| 3.1 | Duas pessoas: **⚡ Arena Pública** | Caem na mesma fila; “Começa em 20s” |
| 3.2 | Joguem as 2 rodadas | Rodadas avançam sozinhas (sem anfitrião) |
| 3.3 | Fim | “Nível 1000 → 1016 (+16)” para quem ganhou e −16 para quem perdeu; **⚡ Jogar outra** |
| 3.4 | **🏆 Ranking global → 🏅 Ligas** | Tabela da temporada com o nível de cada um |

## 4. Perfil, conquistas e temas (3 min)
| # | Faça | Deve acontecer |
|---|---|---|
| 4.1 | **👤 Meu perfil** | Estatísticas, histórico, liga, 🔥 sequência e **conquistas** |
| 4.2 | Em **🎨 Temas**, escolha um tema liberado (ex.: Menta, depois de vencer em grupo) | O visual inteiro muda |
| 4.3 | **Usar em outro aparelho**: Copiar código → colar em outro aparelho → **Usar código** | O outro aparelho mostra o mesmo perfil |

## 5. Celular como app (2 min)
1. No celular, menu do navegador → **Adicionar à tela inicial**.
2. Abra pelo ícone, jogue um modo solo, depois **desligue o Wi-Fi** e abra de novo: os modos solo continuam funcionando.

## O que anotar
- O que ficou **confuso** (onde a pessoa travou ou perguntou algo).
- O que foi **mais divertido** (a revelação? a Arena? os times?).
- **Palavras** que deveriam valer e não valeram (ou o contrário).
- Qualquer erro: a tela e o que estava fazendo.

## Limites conhecidos do MVP
- Os dados (perfis, ranking) ficam no computador que roda o `npm start` (`data/runtime/`). Para hospedar na
  internet, ver a seção 8 de `docs/PLANO.md` (Vercel + servidor de tempo real + Postgres).
- Sem a IA configurada, só valem palavras do dicionário (cerca de 216 mil + 35 mil comuns).
- O telão e o modo em grupo precisam de todos na mesma rede (ou do servidor hospedado).
