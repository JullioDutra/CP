#!/usr/bin/env bash
# Gera data/comuns.txt: palavras COMUNS do português (por frequência de uso),
# conferidas pelo corretor ortográfico Hunspell pt_BR, sem acento, 3–12 letras.
# Requisitos: hunspell + hunspell-pt-br (apt install hunspell hunspell-pt-br)
# Uso: bash data/build-comuns.sh pt_br_50k.txt
#   (lista de frequência: https://github.com/hermitdave/FrequencyWords — content/2018/pt_br/pt_br_50k.txt)
set -euo pipefail
SRC="${1:?informe o arquivo pt_br_50k.txt}"
OUT="$(dirname "$0")/comuns.txt"
export LANG=C.UTF-8
# 1) só palavras minúsculas com letras, usadas pelo menos 20 vezes, na ordem de frequência
awk '$2 >= 20 && $1 ~ /^[a-záàâãéêíóôõúüç]+$/ { print $1 }' "$SRC" > /tmp/trama-freq.txt
# 2) Hunspell devolve só as que existem no dicionário (preserva a ordem)
hunspell -d pt_BR -i utf-8 -G < /tmp/trama-freq.txt > /tmp/trama-ok.txt
# 3) remove acentos, filtra 3–12 letras, mantém a 1ª ocorrência (mais frequente)
node -e '
const fs=require("fs");
const seen=new Set(), out=[];
for (const w of fs.readFileSync("/tmp/trama-ok.txt","utf8").split("\n")) {
  const n=w.normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();
  if (!/^[a-z]{3,12}$/.test(n) || seen.has(n)) continue;
  seen.add(n); out.push(n);
}
fs.writeFileSync(process.argv[1], out.join("\n"));
console.log(out.length, "palavras comuns");
' "$OUT"
