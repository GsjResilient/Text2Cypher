import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCypher,validateSchemaReferences} from '../src/validator.js';
import {resolveBindings,mergeGraphs,queryAgent} from '../src/agent.js';
import {compareRows,judge,stats} from '../src/evaluation.js';
import {markdown} from '../src/report.js';
test('只读安全：拦截写入、过程调用、复合语句与无界路径',()=>{
 for(const q of ['MATCH (n) DELETE n RETURN n','MATCH (n) SET n.x=1 RETURN n','MATCH (n) CALL apoc.cypher.run("x",{}) YIELD value RETURN value','MATCH (n) RETURN n; MATCH (x) RETURN x','MATCH p=(n)-[:X*]->(m) RETURN p','MATCH p=(n)-[:X*1..99]->(m) RETURN p','MATCH (n) RETURN n // comment','MATCH (n)-[:X]-(m) RETURN n','MATCH (n) RETURN COLLECT { MATCH (x) RETURN x }'])assert.throws(()=>validateCypher(q),q);
});
test('只读安全：字符串内容、合法反向和有限路径不误报',()=>{
 for(const q of ['MATCH (n) WHERE n.url="https://example.org" RETURN n','MATCH (n) WHERE n.name="DELETE" RETURN n','MATCH (n)<-[:X]-(m) RETURN n','MATCH p=(n)-[:X*0..4]->(m) RETURN p','MATCH (n:`SET`) RETURN n.`DELETE`;'])assert.equal(validateCypher(q),q.replace(/;$/,''));
 assert.throws(()=>validateCypher('MATCH (n) RETURN "oops'));
});
test('子查询依赖按列传递并去重，拒绝前向依赖与失败依赖',()=>{
 const outputs=[{status:'success',rows:[{id:'a'},{id:'a'},{id:'b'}]}];
 assert.deepEqual(resolveBindings({parameters:{x:1},bindings:{ids:{query:0,column:'id'}}},outputs,1),{x:1,ids:['a','b']});
 assert.throws(()=>resolveBindings({bindings:{ids:{query:1,column:'id'}}},outputs,1));
 assert.throws(()=>resolveBindings({bindings:{ids:{query:0,column:'absent'}}},outputs,1));
 assert.throws(()=>resolveBindings({bindings:{ids:{query:0,column:'id'}}},[{status:'error'}],1));
});
test('合并拓扑去重并保留来源',()=>{
 const graph={nodes:[{id:'1',properties:{}}],edges:[{id:'2',source:'1',target:'1'}]};
 const merged=mergeGraphs([{name:'RPC',graph},{name:'MQ',graph}]);assert.equal(merged.nodes.length,1);assert.deepEqual(merged.edges[0].sources,['RPC','MQ']);
});
test('MQ 语义预检阻止默认交换机串联不同路由键',()=>{
 assert.throws(()=>validateCypher('MATCH (m)-[:`发布至`]->(e)-[:`路由至`]->(q) RETURN m'),/路由键/);
 assert.doesNotThrow(()=>validateCypher('MATCH (m)-[pub:`发布至`]->(e)-[route:`路由至`]->(q) WHERE pub.`路由键`=route.`路由键` RETURN m'));
 assert.throws(()=>validateCypher('MATCH (m:`方法`)-[pub:`消息流`]->(e:`消息交换机`)-[route:`消息流`]->(q:`消息队列`) RETURN m'),/消息流类型/);
 assert.doesNotThrow(()=>validateCypher("MATCH (m:`方法`)-[pub:`消息流`]->(e:`消息交换机`)-[route:`消息流`]->(q:`消息队列`) WHERE pub.`消息流类型`='发布至' AND route.`消息流类型`='路由至' AND pub.`路由键`=route.`路由键` RETURN m"));
});
test('Schema 强校验拦截不存在的标签、关系与属性',()=>{
 const structure={nodes:[{label:'方法',properties:['全限定名']},{label:'类',properties:[]}],relations:[{type:'调用',samples:[],endpoints:[{source:['方法'],target:['方法']}]},{type:'归属于',samples:[],endpoints:[{source:['方法'],target:['类']}]}],propertyKeys:['全限定名']};
 assert.doesNotThrow(()=>validateSchemaReferences('MATCH (m:`方法`)-[:`调用`]->(n:`方法`) RETURN m.`全限定名`',structure));
 assert.throws(()=>validateSchemaReferences('MATCH (m:`服务`)-[:`调用`]->(n) RETURN m',structure),/节点标签/);
 assert.throws(()=>validateSchemaReferences('MATCH (m:`方法`)-[:`下游调用`]->(n) RETURN m',structure),/关系类型/);
 assert.throws(()=>validateSchemaReferences('MATCH (m:`方法`) RETURN m.`方法名`',structure),/属性/);
 assert.throws(()=>validateSchemaReferences('MATCH (m:`方法`)<-[:`归属于`]-(c:`类`) RETURN m',structure),/端点/);
 assert.throws(()=>validateSchemaReferences('MATCH (m:`方法`) MATCH (m)<-[:`归属于`]-(c:`类`) RETURN m',structure),/端点/);
});
test('评估比较真实集合而不是执行状态',()=>{
 assert.equal(compareRows([{x:2},{x:1},{x:1}],[{x:1},{x:2}],['x']).verdict,'correct');
 assert.equal(compareRows([{x:3}],[{x:1}],['x']).verdict,'incorrect');
 assert.equal(compareRows([{wrong:1}],[{x:1}],['x']).verdict,'review');
 assert.equal(stats(Array.from({length:30},(_,i)=>({verdict:i<27?'correct':'incorrect'}))).grade,'A');
 assert.equal(stats([{verdict:'correct'}],1).grade,'子集评估');
});
test('评测绑定 Schema 指纹和固定预期，拒绝空集假阳性',async()=>{
 const result={status:'success',rows:[{x:1}],summary:'结果为 1'};
 const valid={columns:['x'],expected:[{x:1}],schemaFingerprint:'abc',requireSummary:false};
 assert.equal((await judge(valid,result,{schemaProvider:async()=>({fingerprint:'abc'})})).verdict,'correct');
 assert.equal((await judge({...valid,schemaFingerprint:'old'},result,{schemaProvider:async()=>({fingerprint:'abc'})})).verdict,'review');
 assert.match((await judge({...valid,expected:[],allowEmpty:false},{...result,rows:[]},{schemaProvider:async()=>({fingerprint:'abc'})})).reason,/空/);
 const summary=await judge({...valid,requireSummary:true},result,{schemaProvider:async()=>({fingerprint:'abc'})});assert.equal(summary.summaryVerdict,'review');
});
const baseServices=()=>({schema:async()=>({nodes:[],relations:[],fingerprint:'test'}),candidates:async()=>[],load:async()=>[],history:async()=>{},selectExamples:async()=>({examples:[],mode:'test'}),execute:async()=>({rows:[{id:'1'}],graph:{nodes:[],edges:[]}})});
test('单条查询可修正一次并返回执行结果',async()=>{
 let calls=0,execs=0;const services={...baseServices(),chatJson:async()=>{calls++;return {queries:[{name:'Q',cypher:'MATCH (n) RETURN n',parameters:{}}]};},execute:async()=>{if(++execs===1)throw new Error('invalid property');return {rows:[{x:1}],graph:{nodes:[],edges:[]}};}};
 const r=await queryAgent('service query','simple',{services,summarize:false});assert.equal(r.status,'success');assert.equal(calls,2);assert.equal(execs,2);
});
test('复杂查询保留成功结果并明确部分失败',async()=>{
 const services={...baseServices(),chatJson:async()=>({queries:[{name:'RPC',cypher:'good',parameters:{}},{name:'MQ',cypher:'bad',parameters:{},bindings:{ids:{query:0,column:'id'}}}]}),execute:async(q,p)=>{if(q==='bad')throw new Error('timeout');return {rows:[{id:'1'}],graph:{nodes:[],edges:[]}};}};
 const r=await queryAgent('service dependencies','complex',{services,summarize:false});assert.equal(r.status,'partial');assert.equal(r.queries[0].rows.length,1);assert.equal(r.queries[1].status,'error');assert.match(r.caveats.join(''),/部分/);
});
test('同名实体先澄清，不直接调用生成器',async()=>{
 const services={...baseServices(),candidates:async()=>['a','b'].map(id=>({id,labels:['方法'],properties:{'方法名':'getAllFood','全限定名':id+'.getAllFood'}})),chatJson:async()=>{throw new Error('must not call');}};
 const r=await queryAgent('getAllFood','medium',{services});assert.equal(r.status,'clarification');assert.equal(r.candidates.length,2);
});
test('中间查询不混入最终结果，输出缺列后修正依赖查询',async()=>{
 let generation=0,execution=0;
 const services={...baseServices(),chatJson:async()=>++generation===1?{queries:[{name:'中间',cypher:'first'},{name:'结果',cypher:'second',bindings:{ids:{query:0,column:'id'}}}]}:{queries:[{name:'结果',cypher:'fixed'}]},execute:async q=>{execution++;return q==='first'?{columns:['id'],rows:[{id:'x'}],graph:{nodes:[],edges:[]}}:q==='second'?{columns:['wrong'],rows:[],graph:{nodes:[],edges:[]}}:{columns:['answer'],rows:[{answer:true}],graph:{nodes:[],edges:[]}};}};
 const r=await queryAgent('service check','complex',{services,summarize:false,outputContract:{columns:['answer'],types:{answer:'boolean'}}});assert.equal(r.status,'success');assert.deepEqual(r.rows,[{answer:true}]);assert.equal(r.queries[0].intermediate,true);assert.equal(execution,3);
});
test('链路问题只返回标量时自动修正为可视化结果',async()=>{
 let generation=0;
 const services={...baseServices(),chatJson:async()=>++generation===1?{queries:[{name:'链路',cypher:'scalar'}]}:{queries:[{name:'链路',cypher:'graph'}]},execute:async query=>query==='scalar'?{rows:[{name:'x'}],graph:{nodes:[],edges:[]}}:{rows:[{path:'p'}],graph:{nodes:[{id:'1'}],edges:[]}}};
 const result=await queryAgent('展示完整调用链拓扑','complex',{services,summarize:false});assert.equal(result.status,'success');assert.equal(result.graph.nodes.length,1);assert.equal(generation,2);
});
test('API 失败明确报错，取消状态与空结果分别处理',async()=>{
 const failing=await queryAgent('service query','simple',{services:{...baseServices(),chatJson:async()=>{throw new Error('API 429');}}});assert.equal(failing.status,'error');assert.match(failing.error,/429/);
 const controller=new AbortController();controller.abort(new Error('cancel'));const cancelled=await queryAgent('service query','simple',{signal:controller.signal,services:baseServices()});assert.equal(cancelled.status,'cancelled');
 const empty=await queryAgent('service query','simple',{summarize:false,services:{...baseServices(),chatJson:async()=>({queries:[{name:'Q',cypher:'MATCH (n) RETURN n'}]}),execute:async()=>({rows:[],graph:{nodes:[],edges:[]}})}});assert.equal(empty.status,'success');assert.equal(empty.rowCount,0);
});
test('报告包含查询参数、限制、错误和过程',()=>{const md=markdown({question:'q',status:'partial',caveats:['范围'],queries:[{name:'x',cypher:'MATCH',parameters:{p:1},rows:[],error:'timeout'}],trace:[{stage:'校验',detail:'ok',time:'now'}]});for(const value of ['partial','范围','MATCH','timeout','校验'])assert.ok(md.includes(value));});
