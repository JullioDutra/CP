const fs=require('fs');
const src=fs.readFileSync(process.argv[2],'utf8').split('\n');
const out=new Set();
for(let w of src){w=w.trim(); if(!w||w!==w.toLowerCase())continue; if(!/^[a-záàâãéêíóôõúüç]+$/.test(w))continue;
 const n=w.normalize('NFD').replace(/[̀-ͯ]/g,'');
 if(n.length<3||n.length>9)continue; if(/(.)\1\1/.test(n))continue; out.add(n);}
const arr=[...out].sort(); fs.writeFileSync(process.argv[3],arr.join('\n')); console.log(arr.length);
