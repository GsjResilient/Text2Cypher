import {mkdir,readFile,writeFile,rename,open,unlink,stat} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const data=process.env.DATA_DIR || fileURLToPath(new URL('../data/',import.meta.url));
let queue=Promise.resolve();
const filename=name=>{if(!/^[a-z0-9-]+\.json$/.test(name))throw new Error('非法存储名称');return path.join(data,name);};
async function lock(name){
  await mkdir(data,{recursive:true});const target=filename(name)+'.lock';
  for(let attempt=0;attempt<200;attempt++){
    try{const handle=await open(target,'wx');await handle.writeFile(String(process.pid));return async()=>{await handle.close();await unlink(target);};}
    catch(error){
      // Windows may report EPERM while another process is unlinking its lock.
      if(!['EEXIST','EPERM','EACCES'].includes(error.code))throw error;
      try{const info=await stat(target);if(Date.now()-info.mtimeMs>60000){const pid=Number(await readFile(target,'utf8'));let alive=true;try{process.kill(pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}if(!alive)await unlink(target);}}catch(e){if(e.code!=='ENOENT')throw e;}
      await new Promise(r=>setTimeout(r,50));
    }
  }throw new Error('本地存储正被其他进程占用，请稍后重试');
}
export async function load(name,fallback=[]) {try{return JSON.parse(await readFile(filename(name),'utf8'));}catch(e){if(e.code==='ENOENT')return structuredClone(fallback);throw e;}}
export function update(name,transform,fallback=[]) {
  const operation=queue.catch(()=>{}).then(async()=>{
    const release=await lock(name);try{
    const current=await load(name,fallback);const next=await transform(current);
    await mkdir(data,{recursive:true});const target=filename(name),tmp=`${target}.${randomUUID()}.tmp`;
    await writeFile(tmp,JSON.stringify(next,null,2),'utf8');await rename(tmp,target);return next;
    }finally{await release();}
  });queue=operation;return operation;
}
export const save=(name,value)=>update(name,()=>value);
export const history=entry=>update('history.json',all=>[entry,...all.filter(e=>e.id!==entry.id)].slice(0,300));
export const id=()=>randomUUID();
export function retrieve(question,examples,level) {
  const tokens=s=>new Set((s.toLowerCase().match(/[a-z0-9_-]+|[\u4e00-\u9fff]{2}/g)||[]));
  const q=tokens(question);
  return examples.filter(e=>e.verified).map(e=>{const t=tokens(e.question);let score=0;for(const word of q)if(t.has(word))score++;return {...e,score:score+(e.level===level?0.2:0)};}).sort((a,b)=>b.score-a.score).slice(0,4);
}
