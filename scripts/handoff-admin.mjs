import fs from 'node:fs';
import {Connection,Keypair,Transaction,SystemProgram} from '@solana/web3.js';
import {ADMIN,configAddress,derive,instructions as ix} from '../lib/chain.ts';
const c=new Connection('https://api.devnet.solana.com','confirmed');
const bootstrap=Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync('.secrets/admin.json'))));
const cfg=await c.getAccountInfo(configAddress);if(!cfg)throw new Error('Initialize and seed first');
if(Buffer.from(ADMIN.toBytes()).equals(cfg.data.subarray(1,33))){console.log('Already handed to user');process.exit(0);}
if(!Buffer.from(bootstrap.publicKey.toBytes()).equals(cfg.data.subarray(1,33)))throw new Error('Unexpected current administrator');
async function send(instruction){const block=await c.getLatestBlockhash();const tx=new Transaction({...block,feePayer:bootstrap.publicKey}).add(instruction);tx.sign(bootstrap);const signature=await c.sendRawTransaction(tx.serialize());const r=await c.confirmTransaction({...block,signature},'confirmed');if(r.value.err)throw new Error(JSON.stringify(r.value.err));console.log(signature);}
if(!await c.getAccountInfo(derive('maker',ADMIN.toBytes())))await send(ix.admit(bootstrap.publicKey,ADMIN));
if(await c.getBalance(ADMIN)<5_000_000)await send(SystemProgram.transfer({fromPubkey:bootstrap.publicKey,toPubkey:ADMIN,lamports:20_000_000}));
await send(ix.transferAdmin(bootstrap.publicKey,ADMIN));
console.log('Deluna administration transferred to',ADMIN.toBase58());
