# Dados

## palavras.txt — dicionário completo
Cerca de 216 mil palavras do português brasileiro, sem acentos, com 3 a 12 letras.
Serve para **aceitar** palavras e calcular as palavras possíveis de cada grade.

- Origem: [pythonprobr/palavras](https://github.com/pythonprobr/palavras), derivada do
  dicionário pt_BR do LibreOffice (projeto VERO).
- Licença: **Mozilla Public License 2.0** (este arquivo continua sob a MPL 2.0).
- Processamento (`build-dict.cjs`): só minúsculas (remove nomes próprios), remove
  acentos/ç, mantém 3–12 letras e descarta letras repetidas 3× seguidas.

## comuns.txt — palavras comuns (em ordem de frequência)
Cerca de 35 mil palavras **de uso real**, incluindo verbos conjugados ("comeu", "gostei",
"falamos"), que faltavam no dicionário acima. Usadas para:
- aceitar essas palavras no jogo;
- gerar grades com mais palavras conhecidas;
- mostrar primeiro as palavras conhecidas na lista de "palavras que ficaram de fora".

- Origem da frequência: [hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
  (`content/2018/pt_br/pt_br_50k.txt`, legendas do OpenSubtitles), © Hermit Dave.
- Licença do conteúdo: **CC BY-SA 4.0**. Este arquivo derivado também fica sob a CC BY-SA 4.0.
- Filtro de qualidade: cada palavra foi conferida pelo corretor **Hunspell pt_BR**
  (LibreOffice), o que descarta nomes próprios, erros e palavras estrangeiras.
- Para regenerar: `bash data/build-comuns.sh pt_br_50k.txt` (precisa de `hunspell` e `hunspell-pt-br`).

## bloqueadas.txt — palavras que nunca valem
Palavrões, termos indecentes, ofensas, gírias/contrações ("pra", "tava", "mano") e **nomes de
pessoas** (prenomes frequentes do Censo/IBGE). Valem no celular e no servidor, e nem a IA libera.
- Lista manual (editável): `bloqueio-manual.txt` (palavra = ela e todas as formas; `^prefixo`; `+palavra` = nunca bloquear).
- Prenomes que também são palavras comuns e continuam valendo: `nomes-que-sao-palavras.txt` (rosa, lua, pedra, linda…).
- Prenomes: [datasets-br/prenomes](https://github.com/datasets-br/prenomes) (dados do IBGE).

## formas.txt.gz — conjugações e flexões (só no servidor)
Cerca de 1,3 milhão de formas (verbos conjugados, plurais, femininos, diminutivos…) geradas a
partir das regras de afixos do Hunspell pt_BR (LibreOffice/VERO, MPL 2.0). Não vai para o celular
(ficaria pesado): quando o celular não conhece uma palavra, ele pergunta ao servidor.

Para regenerar tudo: `node scripts/build-dict.mjs /usr/share/hunspell/pt_BR.dic /usr/share/hunspell/pt_BR.aff nomes-censos-ibge.csv`
(veja o cabeçalho do script).

## runtime/ (não vai para o git)
Criado pelo servidor: `ia-cache.json` (respostas da IA) e `aprendidas.txt` (palavras
que a IA confirmou e que passam a valer para todos).

## temas.js
Temas e palavras do Caça-Palavras (lista própria). Para conferir palavras novas antes de
adicionar: `npm run verificar -- --temas`.
