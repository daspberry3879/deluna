import fs from 'node:fs/promises';
const source=await fs.readFile('contract/src/lib.rs','utf8');
let previous;try{previous=JSON.parse(await fs.readFile('contract/build.json','utf8'));}catch{}
const response=await fetch('https://api.solpg.io/build',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({files:[['/src/lib.rs',source]],uuid:previous?.uuid})});
if(!response.ok)throw new Error(await response.text());
const result=await response.json();const uuid=result.uuid||previous?.uuid;
await fs.writeFile('contract/build.json',JSON.stringify({...result,uuid},null,2));console.log(result.stderr);
if(/error(?:\[|:)/.test(result.stderr))process.exit(1);
const binary=await fetch('https://api.solpg.io/deploy/'+uuid);if(!binary.ok)throw new Error(await binary.text());
await fs.writeFile('contract/deluna.so',Buffer.from(await binary.arrayBuffer()));console.log('Saved contract/deluna.so');
