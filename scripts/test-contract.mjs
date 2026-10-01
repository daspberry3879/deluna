import fs from 'node:fs';
import assert from 'node:assert/strict';
import {Connection,Keypair,Transaction,VersionedTransaction,SystemProgram} from '@solana/web3.js';
import {instructions as ix,PROGRAM,campaignAddress,orderAddress,decodeCampaign,decodeOrder,configAddress,derive} from '../lib/chain.ts';
const rpc=process.env.DELUNA_TEST_RPC||'http://127.0.0.1:8899';
if(!rpc.includes('127.0.0.1')&&!rpc.includes('devnet'))throw new Error('Only local/devnet testing is allowed');
const c=new Connection(rpc,'confirmed');
const load=n=>Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('.secrets/'+n+'.json'))));
const admin=load('admin'),factory=load('factory'),buyer=load('buyer'),other=load('buyer2');
const sent=[];
async function exactBalance(key){const response=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:[key.toBase58(),{commitment:'confirmed'}]})});const text=await response.text();const match=text.match(/"value"\s*:\s*(\d+)/);if(!match)throw new Error(text);return BigInt(match[1]);}
async function send(signer,instruction){const block=await c.getLatestBlockhash();const tx=new Transaction({...block,feePayer:signer.publicKey}).add(instruction);tx.sign(signer);const signature=await c.sendRawTransaction(tx.serialize());const result=await c.confirmTransaction({...block,signature},'confirmed');assert.equal(result.value.err,null);sent.push(signature);return signature;}
async function reject(name,signer,instruction){const block=await c.getLatestBlockhash();const tx=new Transaction({...block,feePayer:signer.publicKey}).add(instruction);const versioned=new VersionedTransaction(tx.compileMessage());versioned.sign([signer]);const result=await c.simulateTransaction(versioned,{sigVerify:true});assert.ok(result.value.err,name+' must be rejected');console.log('PASS',name);}
async function campaign(id){const a=campaignAddress(id);return decodeCampaign(a,(await c.getAccountInfo(a)).data);}
async function order(id,b=buyer){const a=orderAddress(campaignAddress(id),b.publicKey);return decodeOrder(a,(await c.getAccountInfo(a)).data);}
if(!await c.getAccountInfo(PROGRAM))throw new Error('Program not deployed at '+rpc);
for(const w of [factory,buyer,other]){if(await c.getBalance(w.publicKey)<20_000_000)await send(admin,SystemProgram.transfer({fromPubkey:admin.publicKey,toPubkey:w.publicKey,lamports:30_000_000}));}
if(!await c.getAccountInfo(configAddress))await send(admin,ix.initialize(admin.publicKey,100_000));
if(!await c.getAccountInfo(derive('maker',factory.publicKey.toBytes())))await send(admin,ix.admit(admin.publicKey,factory.publicKey));
const id=Date.now(),a=campaignAddress(id),hash=new Uint8Array(32).fill(7);
await reject('unapproved factory cannot create',other,ix.create(other.publicKey,id,0,3,10000,Math.floor(Date.now()/1000)+3600,hash));
await send(factory,ix.create(factory.publicKey,id,0,3,10000,Math.floor(Date.now()/1000)+3600,hash));
await reject('buyer cannot cancel factory campaign',buyer,ix.cancel(buyer.publicKey,a));
await send(buyer,ix.buy(buyer.publicKey,a,1,0));
assert.equal((await campaign(id)).sold,1);assert.equal((await order(id)).paid,10000);console.log('PASS retail purchase of one item');
await reject('early payout',factory,ix.withdraw(factory.publicKey,a));
await reject('early refund',buyer,ix.refund(buyer.publicKey,a));
await reject('oversell',buyer,ix.buy(buyer.publicKey,a,3,0));
assert.equal((await campaign(id)).sold,1);
await send(other,ix.buy(other.publicKey,a,2,1));assert.equal((await campaign(id)).status,1);assert.equal((await campaign(id)).buyers,2);
await reject('purchase after full subscription',buyer,ix.buy(buyer.publicKey,a,1,0));
await reject('wrong factory payout',other,ix.withdraw(other.publicKey,a));
await reject('refund after successful collection',buyer,ix.refund(buyer.publicKey,a));
const escrowBefore=await c.getBalance(a);await send(factory,ix.withdraw(factory.publicKey,a));assert.equal(escrowBefore-await c.getBalance(a),30000);console.log('PASS exact payout after full subscription');
await reject('double payout',factory,ix.withdraw(factory.publicKey,a));
await reject('cancel after payout',factory,ix.cancel(factory.publicKey,a));
const o=orderAddress(a,buyer.publicKey);
await reject('unauthorized delivery invoice',other,ix.quote(other.publicKey,a,o,151));
await send(admin,ix.quote(admin.publicKey,a,o,151));assert.equal((await order(id)).shipping,15100);
await reject('replace delivery invoice',admin,ix.quote(admin.publicKey,a,o,500));
await reject('someone else pays order',other,ix.shipping(other.publicKey,o,admin.publicKey));
await reject('delivery before shipping payment',admin,ix.status(admin.publicKey,a,o,4));
const adminBefore=await exactBalance(admin.publicKey);await send(buyer,ix.shipping(buyer.publicKey,o,admin.publicKey));assert.equal(await exactBalance(admin.publicKey)-adminBefore,15100n);assert.equal((await order(id)).shippingPaid,true);console.log('PASS separate shipping transfer recorded atomically');
await reject('double shipping payment',buyer,ix.shipping(buyer.publicKey,o,admin.publicKey));
await send(admin,ix.status(admin.publicKey,a,o,4));assert.equal((await order(id)).status,4);
await reject('unauthorized status',other,ix.status(other.publicKey,a,o,4));
const cancelId=id+1,ca=campaignAddress(cancelId);
await send(factory,ix.create(factory.publicKey,cancelId,0,2,10000,Math.floor(Date.now()/1000)+3600,hash));await send(buyer,ix.buy(buyer.publicKey,ca,1,0));await send(factory,ix.cancel(factory.publicKey,ca));
const before=await c.getBalance(ca);await send(buyer,ix.refund(buyer.publicKey,ca));assert.equal(before-await c.getBalance(ca),10000);assert.equal((await order(cancelId)).refunded,true);console.log('PASS cancelled campaign refund');
await reject('double refund',buyer,ix.refund(buyer.publicKey,ca));
const expiryId=id+2,ea=campaignAddress(expiryId),deadline=Math.floor(Date.now()/1000)+25;
await send(factory,ix.create(factory.publicKey,expiryId,0,2,10000,deadline,hash));await send(buyer,ix.buy(buyer.publicKey,ea,1,0));
console.log('Waiting for actual chain deadline to test expired collection');
while(true){const slot=await c.getSlot();const time=await c.getBlockTime(slot);if(time>=deadline)break;await new Promise(r=>setTimeout(r,2000));}
await reject('buy after deadline',buyer,ix.buy(buyer.publicKey,ea,1,0));
await send(buyer,ix.refund(buyer.publicKey,ea));assert.equal((await order(expiryId)).refunded,true);console.log('PASS expired collection refund');
await reject('unauthorized admin transfer',buyer,ix.transferAdmin(buyer.publicKey,other.publicKey));
await send(admin,ix.transferAdmin(admin.publicKey,other.publicKey));
await reject('previous admin loses access',admin,ix.admit(admin.publicKey,buyer.publicKey));
await send(other,ix.transferAdmin(other.publicKey,admin.publicKey));
console.log('PASS admin transfer and restoration');
fs.writeFileSync('contract/test-results.json',JSON.stringify({rpc,program:PROGRAM.toBase58(),time:new Date().toISOString(),status:'passed',signatures:sent},null,2));
console.log('ALL CONTRACT CHECKS PASSED');
