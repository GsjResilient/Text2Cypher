import express from 'express';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {config,configured} from './src/config.js';
import {schema,execute,closeDriver} from './src/graph.js';
import {load,save,update,id} from './src/store.js';
import {jobs} from './src/jobs.js';
import {review} from './src/evaluation.js';
import {markdown} from './src/report.js';
const root=path.dirname(fileURLToPath(import.meta.url));
export const app=express();
app.disable('x-powered-by');
app.use(express.json({limit:'256kb'}));
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  if(!['127.0.0.1','localhost','[::1]'].includes(req.hostname))return res.status(403).json({error:'仅接受本地主机请求'});
  if(req.method!=='GET'){
    const origin=req.headers.origin;
    if(origin&&![`http://127.0.0.1:${config.port}`,`http://localhost:${config.port}`].includes(origin))return res.status(403).json({error:'仅接受本地界面的请求'});
    if(!req.is('application/json'))return res.status(415).json({error:'请使用 JSON 请求'});
  }next();
});
app.get('/api/health',(req,res)=>res.json({model:config.model,llmConfigured:configured(config.apiKey),neo4jConfigured:configured(config.uri)&&configured(config.password),maxHops:config.maxHops,maxRows:config.maxRows,graphVersion:config.graphVersion}));
app.get('/api/schema',async(req,res)=>res.json(await schema(req.query.refresh==='true')));
app.post('/api/query',(req,res)=>res.status(202).json(jobs.create([{question:req.body.question,level:req.body.level||'simple',context:req.body.context||{}}])));
app.post('/api/batch',(req,res)=>res.status(202).json(jobs.create(req.body.items)));
app.get('/api/jobs/:id',async(req,res)=>{const job=jobs.snapshot(req.params.id)||(await load('jobs.json')).find(j=>j.id===req.params.id);if(!job)return res.status(404).json({error:'任务不存在'});res.json(job);});
app.post('/api/jobs/:id/cancel',(req,res)=>res.json(jobs.cancel(req.params.id)));
app.get('/api/jobs/:id/report',async(req,res)=>{const job=jobs.snapshot(req.params.id)||(await load('jobs.json')).find(j=>j.id===req.params.id);if(!job)return res.status(404).json({error:'任务不存在'});res.type('text/markdown').attachment('codegraph-report.md').send(markdown(job.results));});
app.get('/api/history',async(req,res)=>res.json((await load('history.json')).map(({id,question,level,status,createdAt,rowCount,summary})=>({id,question,level,status,createdAt,rowCount,summary}))));
app.get('/api/history/:id',async(req,res)=>{const item=(await load('history.json')).find(r=>r.id===req.params.id);if(!item)return res.status(404).json({error:'记录不存在'});res.json(item);});
app.get('/api/history/:id/report',async(req,res)=>{const item=(await load('history.json')).find(r=>r.id===req.params.id);if(!item)return res.status(404).json({error:'记录不存在'});res.type('text/markdown').attachment('query-report.md').send(markdown(item));});
app.get('/api/knowledge',async(req,res)=>{
  const items=await load('knowledge.json');
  try {const current=await schema();res.json(items.map(item=>({...item,stale:!!item.verified&&item.schemaFingerprint!==current.fingerprint,currentSchemaFingerprint:current.fingerprint})));}
  catch {res.json(items.map(item=>({...item,stale:null,currentSchemaFingerprint:null})));}
});
app.post('/api/knowledge',async(req,res)=>{
  const {question,cypher,level='simple',category='自定义',parameters={}}=req.body;
  if(typeof question!=='string'||!question.trim()||question.length>2000||typeof cypher!=='string'||!cypher.trim()||cypher.length>16000||!['simple','medium','complex'].includes(level)||!parameters||typeof parameters!=='object'||Array.isArray(parameters))throw new Error('示例格式不正确');
  let item;
  await update('knowledge.json',all=>{const old=all.find(e=>e.id===req.body.id);item={id:old?.id||id(),question,cypher,level,category,parameters,graphVersion:config.graphVersion,verified:false,executionChecked:false,humanConfirmed:false,origin:old?.origin||'用户编写',revision:(old?.revision||0)+1,createdAt:old?.createdAt||new Date().toISOString()};return [...all.filter(e=>e.id!==item.id),item];});res.json(item);
});
app.delete('/api/knowledge/:id',async(req,res)=>{await update('knowledge.json',all=>all.filter(e=>e.id!==req.params.id));res.json({ok:true});});
app.post('/api/knowledge/:id/verify',async(req,res)=>{
  const item=(await load('knowledge.json')).find(e=>e.id===req.params.id);if(!item)return res.status(404).json({error:'示例不存在'});
  const currentSchema=await schema();const result=await execute(item.cypher,item.parameters);if(!result.rows.length)throw new Error('执行结果为空，不能标记为已验证');
  let updated;
  await update('knowledge.json',all=>{const current=all.find(e=>e.id===item.id);if(!current||current.revision!==item.revision)throw new Error('示例已更改，请重新验证');Object.assign(current,{executionChecked:true,checkedAt:new Date().toISOString(),schemaFingerprint:currentSchema.fingerprint,graphVersion:config.graphVersion,rowCount:result.rows.length,preview:result.rows.slice(0,5)});if(req.body.semanticConfirmed===true){current.verified=true;current.humanConfirmed=true;current.semanticReview='用户核对查询含义与执行结果';}updated=current;return all;});res.json({item:updated,preview:result.rows.slice(0,10),rowCount:result.rows.length});
});
app.get('/api/diagnostics',async(req,res)=>{
  const current=await schema(req.query.refresh==='true');const knowledge=await load('knowledge.json');const tests=await load('evaluation.json');
  res.json({graphVersion:config.graphVersion,schemaFingerprint:current.fingerprint,nodeLabels:current.nodes.length,relationshipTypes:current.relations.length,knowledge:{total:knowledge.length,active:knowledge.filter(item=>item.verified&&item.schemaFingerprint===current.fingerprint).length,stale:knowledge.filter(item=>item.verified&&item.schemaFingerprint!==current.fingerprint).length},evaluation:{total:tests.length,matching:tests.filter(test=>test.schemaFingerprint===current.fingerprint).length,stale:tests.filter(test=>test.schemaFingerprint!==current.fingerprint).length}});
});
app.get('/api/evaluation',async(req,res)=>res.json(await load('evaluation.json')));
app.get('/api/evaluation/runs',async(req,res)=>res.json(await load('evaluation-runs.json')));
app.post('/api/evaluation/run',async(req,res)=>{let tests=await load('evaluation.json');if(Array.isArray(req.body.ids))tests=tests.filter(t=>req.body.ids.includes(t.id));const current=await schema();const stale=tests.filter(test=>test.schemaFingerprint!==current.fingerprint);if(stale.length)throw new Error(`评测集与当前图谱不匹配（${stale.map(test=>test.id).join('、')}），请先全量重建并复核固定预期结果`);res.status(202).json(jobs.create(tests,{evaluation:true}));});
app.post('/api/evaluation/review',async(req,res)=>res.json(await review(req.body.runId,req.body.resultId,req.body.verdict,req.body.note)));
app.use('/vendor/cytoscape.js',express.static(path.join(root,'node_modules/cytoscape/dist/cytoscape.min.js')));
app.use(express.static(path.join(root,'public')));
app.use((err,req,res,next)=>res.status(400).json({error:String(err.message).replace(/sk-[a-zA-Z0-9_-]+/g,'[redacted]')}));
if(!process.env.APP_TEST){
  const existing=await load('knowledge.json',null);if(existing===null)await save('knowledge.json',await load('seeds.json'));
  const server=app.listen(config.port,'127.0.0.1',()=>console.log(`CodeGraph ready: http://127.0.0.1:${config.port}`));
  const stop=()=>{server.close();closeDriver().finally(()=>process.exit());};process.on('SIGINT',stop);process.on('SIGTERM',stop);
}
