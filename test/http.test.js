import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
process.env.APP_TEST='1';process.env.DATA_DIR=await mkdtemp(path.join(tmpdir(),'codegraph-http-'));
const {app}=await import('../server.js');
test('HTTP：静态文件、配置保密、输入校验、知识库CRUD与跨域限制',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 try {
  assert.equal((await fetch(base+'/')).status,200);assert.equal((await fetch(base+'/.env')).status,404);assert.equal((await fetch(base+'/src/config.js')).status,404);
  const health=await (await fetch(base+'/api/health')).json();assert.equal('apiKey' in health,false);assert.equal('password' in health,false);
  const post=(url,body,headers={})=>fetch(base+url,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
  assert.equal((await post('/api/query',{question:'',level:'simple'})).status,400);
  assert.equal((await post('/api/query',{question:'hello',level:'simple'},{Origin:'https://foreign.example'})).status,403);
  const entry=await (await post('/api/knowledge',{question:'List',cypher:'MATCH (n) RETURN n'})).json();assert.equal(entry.verified,false);
  const all=await (await fetch(base+'/api/knowledge')).json();assert.equal(all.length,1);
  await fetch(base+'/api/knowledge/'+entry.id,{method:'DELETE',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal((await (await fetch(base+'/api/knowledge')).json()).length,0);
 }finally{await new Promise(r=>server.close(r));}
});
