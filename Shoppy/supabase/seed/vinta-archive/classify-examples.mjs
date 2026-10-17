/** Clasifica únicamente el seed contrastado. Nunca borra productos ni archivos. */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
export const PROJECT = 'evzlqwiipdjgtrqjlwba';
export const BATCH = 'vinta-examples-20261016';
const checked = r => { if(r.error) throw new Error(r.error.message); return r.data; };
export function exampleDatabase(client) {
  return {
    async read(ids) { return checked(await client.from('products').select('*').in('id',ids)); },
    async update(row,values) {
      let q=client.from('products').update(values).eq('id',row.id).eq('updated_at',row.updated_at);
      q=row.published_at===null?q.is('published_at',null):q.eq('published_at',row.published_at);
      return checked(await q.select('*'))?.[0]??null;
    },
  };
}
async function readReceipt(path) {try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}}
async function save(path,record){const tmp=`${path}.tmp-${process.pid}`;await writeFile(tmp,JSON.stringify(record,null,2),{mode:0o600});await rename(tmp,path);}
export function differences(row,seed) {
  // Counters change through ordinary visits; they never establish commercial identity.
  return Object.keys(seed).filter(k=>!['view_count','favorite_count'].includes(k)&&!isDeepStrictEqual(row[k],seed[k]));
}
export async function classifyExamples({database,seeds,projectUrl,receiptPath,mode='dry-run'}) {
  assert.equal(new URL(projectUrl).hostname,`${PROJECT}.supabase.co`);
  assert.ok(['dry-run','apply','restore'].includes(mode));
  assert.equal(seeds.length,20);assert.equal(new Set(seeds.map(s=>s.id)).size,20);
  assert.ok(seeds.every((s,i)=>s.id===`d0000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`));
  const ids=seeds.map(s=>s.id), rows=await database.read(ids);
  assert.ok(rows.every(r=>ids.includes(r.id)),'Transporte devolvió registros ajenos');
  const result={mode,changed:[],already:[],skipped:[],uncertain:[]};
  let record=await readReceipt(receiptPath);
  if(record){assert.equal(record.projectRef,PROJECT);assert.equal(record.batch,BATCH);assert.deepEqual(record.ids,ids);}
  if(mode==='restore')assert.ok(record,'Falta el respaldo original');
  const eligible=[];
  for(const seed of seeds){
    const row=rows.find(r=>r.id===seed.id);
    if(!row){result.skipped.push({id:seed.id,reason:'missing'});continue;}
    const diff=differences(row,seed);
    if(mode!=='restore'&&diff.length){result.skipped.push({id:row.id,reason:'changed seed',fields:diff});continue;}
    eligible.push(row);
  }
  if(mode==='dry-run')return {...result,eligible:eligible.map(r=>r.id)};
  if(!record){record={version:1,projectRef:PROJECT,batch:BATCH,ids,previous:Object.fromEntries(eligible.map(r=>[r.id,r])),written:{},restored:[],pending:null};await save(receiptPath,record);}
  record.pendingById ??= record.pending ? { [record.pending.id]: record.pending } : {};
  for(const snapshot of eligible){
    const row=(await database.read([snapshot.id]))[0], previous=record.previous[snapshot.id], written=record.written[snapshot.id];
    if(!row||!previous){result.skipped.push({id:snapshot.id,reason:'no original snapshot'});continue;}
    if(mode==='restore'&&record.restored.includes(row.id)){result.already.push(row.id);continue;}
    const expected=mode==='restore'?written:(written??previous);
    if(!expected){if(record.pendingById[row.id])result.uncertain.push(row.id);else result.already.push(row.id);continue;}
    if(!isDeepStrictEqual(row,expected)){result.skipped.push({id:row.id,reason:'edited or uncertain after snapshot'});if(record.pendingById[row.id])result.uncertain.push(row.id);continue;}
    if(mode==='apply'&&written){result.already.push(row.id);continue;}
    const values=mode==='restore'?{metadata:previous.metadata,published_at:previous.published_at}:{metadata:{...(row.metadata??{}),example:true,example_batch:BATCH},published_at:null};
    record.pendingById[row.id]={id:row.id,mode};await save(receiptPath,record);
    const updated=await database.update(row,values);
    if(updated){if(mode==='apply')record.written[row.id]=updated;else record.restored.push(row.id);result.changed.push(row.id);}
    else result.skipped.push({id:row.id,reason:'concurrent edit'});
    delete record.pendingById[row.id];record.pending=null;await save(receiptPath,record);
  }
  record.lastResult=result;await save(receiptPath,record);return result;
}
async function main(){
 const args=process.argv.slice(2);assert.ok(args.length<=1&&args.every(a=>['--apply','--restore'].includes(a)));
 const dir=dirname(fileURLToPath(import.meta.url));const seeds=JSON.parse(await readFile(resolve(dir,'legacy-products.json'),'utf8'));
 const url=process.env.SUPABASE_URL??process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;assert.ok(url&&key,'Faltan credenciales locales');
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 console.log(JSON.stringify(await classifyExamples({database:exampleDatabase(client),seeds,projectUrl:url,receiptPath:process.env.VINTA_EXAMPLES_LOG??resolve(dir,'examples.local.json'),mode:args[0]==='--apply'?'apply':args[0]==='--restore'?'restore':'dry-run'}),null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();
