import {queryAgent,resolveBindings} from '../src/agent.js';
import {execute,closeDriver} from '../src/graph.js';
import {config} from '../src/config.js';
import {mkdir,writeFile} from 'node:fs/promises';
const results=[];
try {
 const ambiguous=await queryAgent('getAllFood 方法调用了哪些下游服务？','medium',{summarize:false});
 if(ambiguous.status!=='clarification')throw new Error('同名实体未触发澄清');
 results.push({case:'同名实体澄清',passed:true,candidates:ambiguous.candidates.length});console.log('ambiguity passed');
 const choice=ambiguous.candidates.find(c=>c.properties['全限定名']==='foodsearch.service.FoodServiceImpl.getAllFood');
 const resolved=await queryAgent(ambiguous.question,'medium',{context:{selectedEntityId:choice.id}});
 results.push({case:'实体选择后继续并生成总结',passed:resolved.status==='success'&&resolved.rowCount>0,result:resolved});console.log(`resolved ${resolved.status} ${resolved.rowCount}`);
 const graph=await queryAgent('请分成两个独立子查询，分别展示 ts-food-service 的 REST 下游调用拓扑和 MQ 消息依赖拓扑，返回路径。','complex');
 results.push({case:'RPC与MQ子查询拓扑合并',passed:graph.status==='success'&&graph.queries.length>=2&&graph.graph.edges.length>0,result:graph});console.log(`complex ${graph.status} ${graph.queries.length} queries, ${graph.graph.edges.length} edges`);
 const first=await execute('MATCH (s:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(m:`方法`)-[:`下游调用`]->(:`下游API`) WHERE s.`服务名称`=$service AND s.`图谱版本`=$version RETURN DISTINCT m.nodeId AS nodeId',{service:'ts-food-service',version:config.graphVersion});
 const second={parameters:{},bindings:{ids:{query:0,column:'nodeId'}}};
 const params=resolveBindings(second,[{...first,status:'success'}],1);
 const dependent=await execute('MATCH p=(m:`方法`)-[:`下游调用`]->(a:`下游API`) WHERE m.nodeId IN $ids RETURN p',params);
 results.push({case:'真实ID依赖传递',passed:dependent.rows.length>0,ids:params.ids.length,rows:dependent.rows.length});console.log('bindings passed');
 for(const cypher of ['MATCH (n:`不存在的标签_验收`) RETURN n','MATCH (n) DELETE n RETURN n']){let blocked=false;try{await execute(cypher);}catch{blocked=true;}results.push({case:'非法查询拦截',passed:blocked,cypher});}
 await mkdir('reports',{recursive:true});await writeFile('reports/integration.json',JSON.stringify(results,null,2));
 console.log(JSON.stringify(results.map(({case:name,passed})=>({case:name,passed}))));
 if(results.some(r=>!r.passed))process.exitCode=1;
}finally{await closeDriver();}
