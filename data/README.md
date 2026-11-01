# Dados

## palavras.txt
Lista de ~127 mil palavras do português brasileiro, sem acentos, com 3 a 9 letras,
usada para validar palavras e calcular as palavras possíveis de cada grade.

- Origem: [pythonprobr/palavras](https://github.com/pythonprobr/palavras), derivada do
  dicionário pt_BR do LibreOffice (projeto VERO).
- Licença: **Mozilla Public License 2.0** (este arquivo continua sob a MPL 2.0).
- Processamento (`build-dict.cjs`): só minúsculas (remove nomes próprios), remove
  acentos/ç, mantém 3–9 letras e descarta letras repetidas 3× seguidas.

Para regenerar: baixe `palavras.txt` do repositório acima e rode
`node data/build-dict.cjs palavras.txt data/palavras.txt`.

## temas.js
Temas e palavras do modo Caça-Palavras (lista própria).
