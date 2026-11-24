import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:3210';
const post=async(url,body)=>(await fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
const created=await post('/api/query',{question:'列出名称以 ts-food 开头的微服务，只返回服务名称。',level:'simple'});
if(!created.id)throw new Error(JSON.stringify(created));
let job;
for(let i=0;i<180;i++){job=await (await fetch(base+'/api/jobs/'+created.id)).json();if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,1000));}
const result=job.results?.[0];
const report=await fetch(base+'/api/jobs/'+created.id+'/report');
const markdown=await report.text();
const history=await (await fetch(base+'/api/history')).json();
const checks={query:job.status==='success',rows:result?.rowCount||0,summary:!!result?.summary,history:history.some(h=>h.id===result?.id),report:report.ok&&markdown.includes('ts-food')&&markdown.includes('Cypher')};
// Reports contain fenced Cypher rather than an English heading in all versions.
checks.report=report.ok&&markdown.includes('ts-food')&&markdown.includes('```cypher');
await mkdir('reports',{recursive:true});await writeFile('reports/http-smoke.json',JSON.stringify({jobId:created.id,checks},null,2));
console.log(JSON.stringify(checks));if(!checks.query||!checks.summary||!checks.history||!checks.report)process.exitCode=1;
