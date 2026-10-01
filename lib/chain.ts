import {Connection,PublicKey,SystemProgram,Transaction,TransactionInstruction,SendTransactionError} from '@solana/web3.js';
import bs58 from 'bs58';
import {Buffer} from 'buffer';
export const PROGRAM=new PublicKey('27yt3x7MiqctpH7y6DPybenLvruJkGmSrZxxkZitQu7V');
export const ADMIN=new PublicKey('AbesS5NYnf41BJQoYEAAoMGqGCQaje1ioL3QtZH1ZzFv');
export const FACTORY=new PublicKey('AgnZPxLk9PEncJYakVqhEVkcGwnbXgWXybiggYkCkVgE');
export const RPC='https://api.devnet.solana.com';
export const connection=new Connection(RPC,'confirmed');
export const cities=['Алматы','Астана','Шымкент'];
export const steps=['Ожидает отправки заводом','Принято на складе в Корее','В пути в Казахстан','Готово к выдаче','Выдано'];
export function u64(n:number|bigint){const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(n));return b;}
export function u32(n:number){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
export function derive(...seeds:(Uint8Array|string)[]){return PublicKey.findProgramAddressSync(seeds.map(s=>typeof s==='string'?Buffer.from(s):s),PROGRAM)[0];}
export const configAddress=derive('config');
export function campaignAddress(id:number){return derive('campaign',u64(id));}
export function orderAddress(c:PublicKey,b:PublicKey){return derive('order',c.toBytes(),b.toBytes());}
const key=(pubkey:PublicKey,isSigner=false,isWritable=false)=>({pubkey,isSigner,isWritable});
const ix=(keys:ReturnType<typeof key>[],...data:Uint8Array[])=>new TransactionInstruction({programId:PROGRAM,keys,data:Buffer.concat(data)});
const op=(v:number)=>Buffer.from([v]);
export const instructions={
 transferAdmin:(a:PublicKey,next:PublicKey)=>ix([key(a,true),key(configAddress,false,true)],op(10),next.toBytes()),
 initialize:(a:PublicKey,rate:number)=>ix([key(a,true,true),key(configAddress,false,true),key(SystemProgram.programId)],op(0),u64(rate)),
 admit:(a:PublicKey,f:PublicKey)=>ix([key(a,true,true),key(configAddress),key(f),key(derive('maker',f.toBytes()),false,true),key(SystemProgram.programId)],op(1)),
 create:(f:PublicKey,id:number,sku:number,target:number,price:number,deadline:number,hash:Uint8Array)=>ix([key(f,true,true),key(derive('maker',f.toBytes())),key(campaignAddress(id),false,true),key(SystemProgram.programId)],op(2),u64(id),u32(sku),u64(target),u64(price),u64(deadline),hash),
 buy:(b:PublicKey,c:PublicKey,qty:number,city:number)=>ix([key(b,true,true),key(c,false,true),key(orderAddress(c,b),false,true),key(SystemProgram.programId)],op(3),u64(qty),op(city)),
 withdraw:(f:PublicKey,c:PublicKey)=>ix([key(f,true,true),key(c,false,true)],op(4)),
 cancel:(f:PublicKey,c:PublicKey)=>ix([key(f,true),key(c,false,true)],op(5)),
 refund:(b:PublicKey,c:PublicKey)=>ix([key(b,true,true),key(c,false,true),key(orderAddress(c,b),false,true)],op(6)),
 quote:(a:PublicKey,c:PublicKey,o:PublicKey,grams:number)=>ix([key(a,true),key(configAddress),key(c),key(o,false,true)],op(7),u64(grams)),
 shipping:(b:PublicKey,o:PublicKey,recipient:PublicKey=ADMIN)=>ix([key(b,true,true),key(o,false,true),key(recipient,false,true),key(configAddress),key(SystemProgram.programId)],op(8)),
 status:(a:PublicKey,c:PublicKey,o:PublicKey,status:number)=>ix([key(a,true),key(configAddress),key(c),key(o,false,true)],op(9),op(status)),
};
export type Campaign={address:PublicKey;factory:PublicKey;id:number;sku:number;target:number;sold:number;price:number;deadline:number;status:number;buyers:number;hash:string;created:number};
export type Order={address:PublicKey;campaign:PublicKey;buyer:PublicKey;qty:number;paid:number;refunded:boolean;grams:number;shipping:number;shippingPaid:boolean;status:number;city:number};
const num=(d:Buffer,o:number)=>Number(d.readBigUInt64LE(o));
export function decodeCampaign(address:PublicKey,d:Buffer):Campaign{return {address,factory:new PublicKey(d.subarray(1,33)),id:num(d,33),sku:d.readUInt32LE(41),target:num(d,45),sold:num(d,53),price:num(d,61),deadline:num(d,69),status:d[77],buyers:num(d,78),hash:d.subarray(86,118).toString('hex'),created:num(d,118)};}
export function decodeOrder(address:PublicKey,d:Buffer):Order{return {address,campaign:new PublicKey(d.subarray(1,33)),buyer:new PublicKey(d.subarray(33,65)),qty:num(d,65),paid:num(d,73),refunded:!!d[81],grams:num(d,82),shipping:num(d,90),shippingPaid:!!d[98],status:d[99],city:d[100]};}
export async function readState(){const [accounts,program]=await Promise.all([connection.getProgramAccounts(PROGRAM),connection.getAccountInfo(PROGRAM)]);if(!program?.executable)throw new Error('Контракт ещё не развёрнут в devnet.');const campaigns:Campaign[]=[];const orders:Order[]=[];const makers:string[]=[];let rate=0;let admin=ADMIN.toBase58();for(const {pubkey,account} of accounts){const d=account.data;if(d[0]===3&&d.length===160)campaigns.push(decodeCampaign(pubkey,d));if(d[0]===4&&d.length===128)orders.push(decodeOrder(pubkey,d));if(d[0]===2&&d.length===40)makers.push(new PublicKey(d.subarray(1,33)).toBase58());if(d[0]===1&&d.length===48&&pubkey.equals(configAddress)){rate=num(d,33);admin=new PublicKey(d.subarray(1,33)).toBase58();}}return {campaigns:campaigns.sort((a,b)=>a.id-b.id),orders,makers,rate,admin};}
export function statusText(c:Campaign){if(c.status===2)return 'Партия выкуплена';if(c.status===1)return 'Сбор завершён';if(c.status===3)return 'Закупка отменена';if(c.deadline<=Date.now()/1000)return 'Доступен возврат';return 'Собираем закупку';}
export function canRefund(c:Campaign){return c.status===3||(c.status===0&&c.deadline<=Date.now()/1000);}
export function provenance(id:number,sku:number,target:number,factory:string){return {schema:'deluna-provenance-v1',environment:'Solana devnet',demonstration:true,issuer:factory,manufacturer:'Deluna Test Factory — тестовый издатель, не представитель бренда',campaignId:id,productId:sku,batch:'DL-'+id,units:target,expiryDate:'2028-09-30',statement:'Тестовый паспорт партии. Не подтверждает подлинность физического товара или отношения с брендом.'};}
export async function hashDocument(document:unknown){const bytes=new TextEncoder().encode(JSON.stringify(document));return new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));}
export const hex=(b:Uint8Array)=>Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
export const sol=(lamports:number)=>new Intl.NumberFormat('ru-RU',{maximumFractionDigits:6}).format(lamports/1e9);
export const short=(s:string)=>s.slice(0,5)+'…'+s.slice(-5);
export const explorer=(value:string,type='address')=>'https://explorer.solana.com/'+type+'/'+value+'?cluster=devnet';
export type WalletProvider={publicKey:PublicKey|null;connect:()=>Promise<{publicKey:PublicKey}>;disconnect:()=>Promise<void>;signTransaction:(tx:Transaction)=>Promise<Transaction>;on?:(event:string,fn:()=>void)=>void;removeListener?:(event:string,fn:()=>void)=>void};
export class SentTransactionError extends Error {
 signature:string; lastValidBlockHeight:number;
 constructor(signature:string,lastValidBlockHeight:number){super('Сеть не подтвердила результат. Проверьте транзакцию перед повторной оплатой.');this.signature=signature;this.lastValidBlockHeight=lastValidBlockHeight;}
}
export async function sendInstruction(wallet:WalletProvider,instruction:TransactionInstruction){
 if(!wallet.publicKey)throw new Error('Подключите кошелёк.');
 const block=await connection.getLatestBlockhash('confirmed');
 const tx=new Transaction({...block,feePayer:wallet.publicKey}).add(instruction);
 const signed=await wallet.signTransaction(tx);const bytes=signed.serialize();
 if(!signed.signature)throw new Error('Кошелёк не подписал транзакцию.');
 const signature=bs58.encode(signed.signature);
 try{await connection.sendRawTransaction(bytes,{skipPreflight:false,maxRetries:3});}catch(e){if(e instanceof SendTransactionError)throw e;throw new SentTransactionError(signature,block.lastValidBlockHeight);}
 let result;
 try{result=await connection.confirmTransaction({...block,signature},'confirmed');}catch{throw new SentTransactionError(signature,block.lastValidBlockHeight);}
 if(result.value.err)throw new Error('Транзакция отклонена контрактом: '+JSON.stringify(result.value.err));
 return signature;
}
