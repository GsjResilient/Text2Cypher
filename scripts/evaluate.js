import {queryAgent} from '../src/agent.js';
import {judge,stats} from '../src/evaluation.js';
import {load,save,id} from '../src/store.js';
import {closeDriver,schema} from '../src/graph.js';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
const tests=(await load('evaluation.json')).filter(t=>!selected||selected.includes(t.id));
const run={id:id(),createdAt:new Date().toISOString(),total:tests.length,completed:0,status:'running',results:[]};
const previous=process.argv.includes('--resume')?(await load('evaluation-runs.json')).flatMap(r=>r.results):[];
try {
 const currentSchema=await schema();
 const stale=tests.filter(test=>test.schemaFingerprint!==currentSchema.fingerprint);
 if(stale.length)throw new Error(`评测集与当前图谱不匹配（${stale.map(test=>test.id).join('、')}），禁止消耗模型额度运行无效评测`);
 for(const test of tests){
  const testSignature=createHash('sha256').update(JSON.stringify({question:test.question,columns:test.columns,expected:test.expected,output:test.output,schemaFingerprint:test.schemaFingerprint})).digest('hex');
  const reused=previous.find(r=>r.testId===test.id&&r.testSignature===testSignature&&r.schemaFingerprint===currentSchema.fingerprint&&test.schemaFingerprint===currentSchema.fingerprint&&(!process.argv.includes('--retry-failed')||r.verdict==='correct'));
  if(reused){run.results.push({...reused,reused:true});run.completed++;console.log(`${test.id} reused ${reused.verdict}`);continue;}
  const result=await queryAgent(test.question,test.level,{summarize:true,outputContract:{columns:test.columns,types:test.columnTypes,instruction:test.output}});
  const grading=await judge(test,result,{schemaProvider:async()=>currentSchema});run.results.push({...result,...grading,testId:test.id,testSignature});run.completed++;
  console.log(`${test.id} ${result.status} ${grading.verdict}: ${grading.reason}`);
  await save('evaluation-progress.json',run);
 }
 run.status='success';run.completedAt=new Date().toISOString();run.stats=stats(run.results,run.total);
 await save('evaluation-runs.json',[run,...await load('evaluation-runs.json')].slice(0,30));
 await mkdir('reports',{recursive:true});
 await writeFile(`reports/evaluation-${run.id}.json`,JSON.stringify(run,null,2));
 await writeFile('reports/evaluation.md',`# Text2Cypher 实测评估\n\n时间：${run.completedAt}\n\n${run.stats.correct}/${run.total} 正确，${run.stats.incorrect} 不正确，${run.stats.review} 待复核。等级：${run.stats.grade}。\n\n判定方式：与独立参考查询的指定输出列进行去重、无序集合比较；未经过人工评分。\n\n本批复用 ${run.results.filter(r=>r.reused).length} 道同问题、同图谱版本的已执行结果，其余重新运行。逐题实际执行时间保存在 JSON 中。历史失败记录保存在其他评估 JSON 文件中。\n\n`+run.results.map(r=>`## ${r.testId} ${r.question}\n\n${r.verdict}：${r.reason}（${r.reused?'复用执行证据':'本批执行'}）\n\n${r.queries.map(q=>'```cypher\n'+q.cypher+'\n```\n'+(q.error||'')).join('\n')}\n`).join('\n'));
 console.log(JSON.stringify(run.stats));
}finally{await closeDriver();}
