//! Deluna devnet group purchases. All monetary amounts are integer lamports.
use solana_program::{account_info::{next_account_info,AccountInfo},entrypoint,entrypoint::ProgramResult,program_error::ProgramError,pubkey::Pubkey,program::{invoke,invoke_signed},system_instruction,system_program,sysvar::{Sysvar,rent::Rent,clock::Clock}};
entrypoint!(process_instruction);
const ADMIN: &str = "J12aDooXwAApciyNSXBYhncyPS9auuxxCBmxFKZLSM1b";
fn fail(n:u32)->ProgramError{ProgramError::Custom(n)}
fn check(v:bool,n:u32)->ProgramResult{if v{Ok(())}else{Err(fail(n))}}
fn number(d:&[u8],i:usize)->Result<u64,ProgramError>{let s=d.get(i..i+8).ok_or(fail(1))?;Ok(u64::from_le_bytes(s.try_into().unwrap()))}
fn put(d:&mut[u8],i:usize,v:u64){d[i..i+8].copy_from_slice(&v.to_le_bytes());}
fn signer(a:&AccountInfo)->ProgramResult{check(a.is_signer,2)}
fn owned(a:&AccountInfo,p:&Pubkey,tag:u8,len:usize)->ProgramResult{check(a.owner==p&&a.data_len()==len,3)?;check(a.try_borrow_data()?[0]==tag,3)}
fn pda(a:&AccountInfo,p:&Pubkey,seeds:&[&[u8]])->Result<u8,ProgramError>{let (key,bump)=Pubkey::find_program_address(seeds,p);check(*a.key==key,4)?;Ok(bump)}
fn bootstrap(a:&AccountInfo)->ProgramResult{signer(a)?;check(a.key.to_string()==ADMIN,5)}
fn admin(a:&AccountInfo,cfg:&AccountInfo,p:&Pubkey)->ProgramResult{signer(a)?;owned(cfg,p,1,48)?;pda(cfg,p,&[b"config"])?;check(&cfg.try_borrow_data()?[1..33]==a.key.as_ref(),5)}
fn create<'a>(payer:&AccountInfo<'a>,target:&AccountInfo<'a>,sys:&AccountInfo<'a>,p:&Pubkey,seeds:&[&[u8]],size:usize)->ProgramResult{
 signer(payer)?;check(*sys.key==system_program::id(),6)?;check(target.data_is_empty()&&target.owner==&system_program::id(),7)?;
 let bump=pda(target,p,seeds)?;let b=[bump];let mut full=seeds.to_vec();full.push(&b);
 // Prefunded PDAs must still be allocatable, so donations cannot deny service.
 let rent=Rent::get()?.minimum_balance(size);let delta=rent.saturating_sub(target.lamports());
 if delta>0{invoke(&system_instruction::transfer(payer.key,target.key,delta),&[payer.clone(),target.clone(),sys.clone()])?;}
 invoke_signed(&system_instruction::allocate(target.key,size as u64),&[target.clone(),sys.clone()],&[&full])?;
 invoke_signed(&system_instruction::assign(target.key,p),&[target.clone(),sys.clone()],&[&full])
}
fn pay<'a>(from:&AccountInfo<'a>,to:&AccountInfo<'a>,sys:&AccountInfo<'a>,amount:u64)->ProgramResult{check(*sys.key==system_program::id(),6)?;invoke(&system_instruction::transfer(from.key,to.key,amount),&[from.clone(),to.clone(),sys.clone()])}
fn release(from:&AccountInfo,to:&AccountInfo,amount:u64)->ProgramResult{check(from.key!=to.key,8)?;let remaining=from.lamports().checked_sub(amount).ok_or(fail(9))?;check(remaining>=Rent::get()?.minimum_balance(from.data_len()),9)?;let next=to.lamports().checked_add(amount).ok_or(fail(10))?;**from.try_borrow_mut_lamports()?=remaining;**to.try_borrow_mut_lamports()?=next;Ok(())}
pub fn process_instruction(p:&Pubkey,accounts:&[AccountInfo],data:&[u8])->ProgramResult{
 let mut it=accounts.iter();let op=*data.first().ok_or(fail(1))?;
 match op{
 0=>{ // Initialize administrator and shipping tariff (lamports/kg).
  check(data.len()==9,1)?;let a=next_account_info(&mut it)?;bootstrap(a)?;let cfg=next_account_info(&mut it)?;let sys=next_account_info(&mut it)?;let rate=number(data,1)?;check(rate>0,11)?;
  create(a,cfg,sys,p,&[b"config"],48)?;let mut d=cfg.try_borrow_mut_data()?;d[0]=1;d[1..33].copy_from_slice(a.key.as_ref());put(&mut d,33,rate);
 },
 1=>{ // Only Deluna can admit a manufacturer.
  check(data.len()==1,1)?;let a=next_account_info(&mut it)?;let cfg=next_account_info(&mut it)?;admin(a,cfg,p)?;let maker=next_account_info(&mut it)?;let record=next_account_info(&mut it)?;let sys=next_account_info(&mut it)?;
  create(a,record,sys,p,&[b"maker",maker.key.as_ref()],40)?;let mut d=record.try_borrow_mut_data()?;d[0]=2;d[1..33].copy_from_slice(maker.key.as_ref());
 },
 2=>{ // Factory signature anchors immutable provenance document hash.
  check(data.len()==69,1)?;let f=next_account_info(&mut it)?;signer(f)?;let m=next_account_info(&mut it)?;owned(m,p,2,40)?;pda(m,p,&[b"maker",f.key.as_ref()])?;
  let c=next_account_info(&mut it)?;let sys=next_account_info(&mut it)?;let id=&data[1..9];let target=number(data,13)?;let price=number(data,21)?;let deadline=number(data,29)?;let now=Clock::get()?.unix_timestamp;
  check(target>0&&target<=1_000_000&&price>0&&price.checked_mul(target).is_some(),11)?;check(deadline>now as u64&&deadline<=(now as u64)+31_536_000,12)?;
  create(f,c,sys,p,&[b"campaign",id],160)?;let mut d=c.try_borrow_mut_data()?;d[0]=3;d[1..33].copy_from_slice(f.key.as_ref());d[33..41].copy_from_slice(id);d[41..45].copy_from_slice(&data[9..13]);put(&mut d,45,target);put(&mut d,61,price);put(&mut d,69,deadline);d[86..118].copy_from_slice(&data[37..69]);put(&mut d,118,now as u64);
 },
 3=>{ // Purchase: a unique PDA accumulates each buyer's order.
  check(data.len()==10,1)?;let b=next_account_info(&mut it)?;signer(b)?;let c=next_account_info(&mut it)?;owned(c,p,3,160)?;let o=next_account_info(&mut it)?;let sys=next_account_info(&mut it)?;pda(o,p,&[b"order",c.key.as_ref(),b.key.as_ref()])?;
  let qty=number(data,1)?;check(qty>0&&data[9]<3,11)?;let d=c.try_borrow_data()?;check(d[77]==0&&(Clock::get()?.unix_timestamp as u64)<number(&d,69)?,13)?;let sold=number(&d,53)?;let target=number(&d,45)?;let next=sold.checked_add(qty).ok_or(fail(10))?;check(next<=target,14)?;let amount=qty.checked_mul(number(&d,61)?).ok_or(fail(10))?;drop(d);
  let fresh=o.data_is_empty();if fresh{create(b,o,sys,p,&[b"order",c.key.as_ref(),b.key.as_ref()],128)?;let mut od=o.try_borrow_mut_data()?;od[0]=4;od[1..33].copy_from_slice(c.key.as_ref());od[33..65].copy_from_slice(b.key.as_ref());od[100]=data[9];}else{owned(o,p,4,128)?;check(o.try_borrow_data()?[100]==data[9],15)?;}
  pay(b,c,sys,amount)?;let mut od=o.try_borrow_mut_data()?;let q=number(&od,65)?.checked_add(qty).ok_or(fail(10))?;let a=number(&od,73)?.checked_add(amount).ok_or(fail(10))?;put(&mut od,65,q);put(&mut od,73,a);drop(od);
  let mut d=c.try_borrow_mut_data()?;put(&mut d,53,next);if next==target{d[77]=1;}if fresh{let buyers=number(&d,78)?+1;put(&mut d,78,buyers);}
 },
 4|5=>{ // Factory withdraw or cancel; mutually exclusive terminal states.
  check(data.len()==1,1)?;let f=next_account_info(&mut it)?;signer(f)?;let c=next_account_info(&mut it)?;owned(c,p,3,160)?;let d=c.try_borrow_data()?;check(&d[1..33]==f.key.as_ref(),5)?;
  if op==4{check(d[77]==1&&number(&d,53)?==number(&d,45)?,16)?;let amount=number(&d,53)?.checked_mul(number(&d,61)?).ok_or(fail(10))?;drop(d);release(c,f,amount)?;c.try_borrow_mut_data()?[77]=2;}else{check(d[77]==0||d[77]==1,16)?;drop(d);c.try_borrow_mut_data()?[77]=3;}
 },
 6=>{ // Refund only the original buyer, once; expired incomplete campaigns qualify.
  check(data.len()==1,1)?;let b=next_account_info(&mut it)?;signer(b)?;let c=next_account_info(&mut it)?;owned(c,p,3,160)?;let o=next_account_info(&mut it)?;owned(o,p,4,128)?;pda(o,p,&[b"order",c.key.as_ref(),b.key.as_ref()])?;
  let d=c.try_borrow_data()?;check(d[77]==3||(d[77]==0&&(Clock::get()?.unix_timestamp as u64)>=number(&d,69)?),17)?;drop(d);let od=o.try_borrow_data()?;check(od[81]==0,18)?;let amount=number(&od,73)?;drop(od);release(c,b,amount)?;o.try_borrow_mut_data()?[81]=1;
 },
 7=>{ // Quote shipping by actual grams, using the single immutable tariff.
  check(data.len()==9,1)?;let a=next_account_info(&mut it)?;let cfg=next_account_info(&mut it)?;admin(a,cfg,p)?;let c=next_account_info(&mut it)?;owned(c,p,3,160)?;check(c.try_borrow_data()?[77]==2,19)?;let o=next_account_info(&mut it)?;owned(o,p,4,128)?;
  let grams=number(data,1)?;check(grams>0&&grams<=100_000_000,11)?;let mut od=o.try_borrow_mut_data()?;check(&od[1..33]==c.key.as_ref()&&od[98]==0&&od[81]==0&&number(&od,90)?==0,20)?;
  let rate=number(&cfg.try_borrow_data()?,33)?;let cost=grams.checked_mul(rate).and_then(|n|n.checked_add(999)).ok_or(fail(10))?/1000;put(&mut od,82,grams);put(&mut od,90,cost);od[99]=1;
 },
 8=>{ // Shipping payment and paid flag update are one atomic on-chain operation.
  check(data.len()==1,1)?;let b=next_account_info(&mut it)?;signer(b)?;let o=next_account_info(&mut it)?;owned(o,p,4,128)?;let a=next_account_info(&mut it)?;let cfg=next_account_info(&mut it)?;owned(cfg,p,1,48)?;pda(cfg,p,&[b"config"])?;check(&cfg.try_borrow_data()?[1..33]==a.key.as_ref(),5)?;let sys=next_account_info(&mut it)?;
  let od=o.try_borrow_data()?;check(&od[33..65]==b.key.as_ref()&&od[98]==0&&od[81]==0,20)?;let cost=number(&od,90)?;check(cost>0,21)?;drop(od);pay(b,a,sys,cost)?;o.try_borrow_mut_data()?[98]=1;
 },
 9=>{ // Delivery status is monotonic; receipt requires shipping to be paid.
  check(data.len()==2,1)?;let a=next_account_info(&mut it)?;let cfg=next_account_info(&mut it)?;admin(a,cfg,p)?;let c=next_account_info(&mut it)?;owned(c,p,3,160)?;check(c.try_borrow_data()?[77]==2,19)?;let o=next_account_info(&mut it)?;owned(o,p,4,128)?;let mut od=o.try_borrow_mut_data()?;check(&od[1..33]==c.key.as_ref()&&od[81]==0,20)?;check(data[1]>od[99]&&data[1]<=4,22)?;if data[1]==4{check(od[98]==1,23)?;}od[99]=data[1];
 },
 10=>{ // Transfer administration; the bootstrap signer has no permanent authority.
 check(data.len()==33,1)?;let a=next_account_info(&mut it)?;let cfg=next_account_info(&mut it)?;admin(a,cfg,p)?;let next=Pubkey::new_from_array(data[1..33].try_into().unwrap());check(next!=Pubkey::default(),24)?;cfg.try_borrow_mut_data()?[1..33].copy_from_slice(next.as_ref());
 },
 _=>return Err(fail(1))
 }Ok(())
}
