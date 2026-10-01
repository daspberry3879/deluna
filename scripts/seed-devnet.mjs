import fs from 'node:fs';
import {Connection,Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import {products} from '../lib/products.ts';
import {instructions as ix,PROGRAM,campaignAddress,orderAddress,decodeCampaign,configAddress,derive,provenance,hashDocument} from '../lib/chain.ts';
let lastRequest=0;let requestQueue=Promise.resolve();
const pacedFetch=(...args)=>{const run=requestQueue.then(async()=>{await new Promise(r=>setTimeout(r,Math.max(0,900-(Date.now()-lastRequest))));lastRequest=Date.now();return fetch(...args);});requestQueue=run.then(()=>{},()=>{});return run;};
const c=new Connection('https://api.devnet.solana.com',{commitment:'confirmed',fetch:pacedFetch});
const key=n=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('.secrets/'+n+'.json'))));
const admin=key('admin'),factory=key('factory'),buyer=key('buyer'),buyer2=key('buyer2');
async function send(s,instruction){const block=await c.getLatestBlockhash('confirmed');const tx=new Transaction({...block,feePayer:s.publicKey}).add(instruction);tx.sign(s);const signature=await c.sendRawTransaction(tx.serialize());for(let attempt=0;attempt<50;attempt++){await new Promise(r=>setTimeout(r,2000));const result=(await c.getSignatureStatuses([signature])).value[0];if(result?.err)throw new Error(JSON.stringify(result.err));if(result?.confirmationStatus==='confirmed'||result?.confirmationStatus==='finalized'){console.log(signature);return signature;}}throw new Error('Confirmation pending; rerun after checking '+signature);}
if(!await c.getAccountInfo(PROGRAM))throw new Error('Deploy contract first');
for(const w of [factory,buyer,buyer2])if(await c.getBalance(w.publicKey)<5_000_000)await send(admin,SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:w.publicKey,lamports:50_000_000}));
if(!await c.getAccountInfo(configAddress))await send(admin,ix.initialize(admin.publicKey,100_000));
if(!await c.getAccountInfo(derive('maker',factory.publicKey.toBytes())))await send(admin,ix.admit(admin.publicKey,factory.publicKey));
const records=[];
for(const [id,target,price] of [[1,1000,10000],[2,500,12000],[3,800,15000]]){
const a=campaignAddress(id);if(!await c.getAccountInfo(a)){const hash=await hashDocument(provenance(id,id,target,factory.publicKey.toBase58()));await send(factory,ix.create(factory.publicKey,id,id,target,price,Math.floor(Date.now()/1000)+7*86400,hash));}
let state=decodeCampaign(a,(await c.getAccountInfo(a)).data);
if(state.sold===0)await send(buyer,ix.buy(buyer.publicKey,a,Math.floor(target*.6),0));
state=decodeCampaign(a,(await c.getAccountInfo(a)).data);
if(state.sold<target)await send(buyer2,ix.buy(buyer2.publicKey,a,target-state.sold,1));
state=decodeCampaign(a,(await c.getAccountInfo(a)).data);if(state.status===1)await send(factory,ix.withdraw(factory.publicKey,a));
for(const b of [buyer,buyer2]){const o=orderAddress(a,b.publicKey),info=await c.getAccountInfo(o);if(info.data.readBigUInt64LE(90)===0n)await send(admin,ix.quote(admin.publicKey,a,o,id===1?50000:id===2?20000:80000));if(info.data[98]===0)await send(b,ix.shipping(b.publicKey,o,admin.publicKey));}
records.push({id,address:a.toBase58(),status:'paid_out'});
}
// Separate open campaigns leave stock available for the user's live demonstration.
if(!fs.existsSync('.secrets/buyer3.json'))fs.writeFileSync('.secrets/buyer3.json',JSON.stringify(Array.from(Keypair.generate().secretKey)));
const buyer3=key('buyer3');
for(const b of [buyer,buyer2,buyer3])if(await c.getBalance(b.publicKey)<5_000_000)await send(admin,SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:b.publicKey,lamports:60_000_000}));
for(const p of products){
 const id=100+p.id,a=campaignAddress(id);
 if(!await c.getAccountInfo(a)){const hash=await hashDocument(provenance(id,p.id,p.target,factory.publicKey.toBase58()));await send(factory,ix.create(factory.publicKey,id,p.id,p.target,Math.round(p.price*1e9),Math.floor(Date.now()/1000)+7*86400,hash));}
 let state=decodeCampaign(a,(await c.getAccountInfo(a)).data);
 if(state.status!==0||state.deadline<=Date.now()/1000)throw new Error('Expected an open seed campaign: '+id);
 for(const [index,b] of [buyer,buyer2,buyer3].entries()){
  if(!await c.getAccountInfo(orderAddress(a,b.publicKey)))await send(b,ix.buy(b.publicKey,a,Math.floor(p.target*[.23,.17,.09][index]),index));
 }
 state=decodeCampaign(a,(await c.getAccountInfo(a)).data);
 if(state.sold>=state.target||state.buyers<3)throw new Error('Open campaign seed invariant failed');
 records.push({id,address:a.toBase58(),status:'open',sold:state.sold,target:state.target,buyers:state.buyers});
}
fs.writeFileSync('contract/seed-results.json',JSON.stringify({network:'devnet',program:PROGRAM.toBase58(),testBuyers:[buyer,buyer2,buyer3].map(b=>b.publicKey.toBase58()),records},null,2));console.log('Three successful and nine open devnet campaigns ready; three test buyers in each open campaign');
