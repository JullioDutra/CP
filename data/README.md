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

## runtime/ (não vai para o git)
Criado pelo servidor: `ia-cache.json` (respostas da IA) e `aprendidas.txt` (palavras
que a IA confirmou e que passam a valer para todos).

## temas.js
Temas e palavras do Caça-Palavras (lista própria). Para conferir palavras novas antes de
adicionar: `npm run verificar -- --temas`.
