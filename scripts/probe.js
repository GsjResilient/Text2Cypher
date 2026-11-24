import {schema,closeDriver} from '../src/graph.js';
import {chatJson} from '../src/llm.js';
try {
  const result=await Promise.allSettled([schema(),chatJson([{role:'user',content:'仅返回 JSON：{"ok":true}'}],32)]);
  for(let i=0;i<result.length;i++) console.log(JSON.stringify({service:i?'llm':'neo4j',status:result[i].status,data:i?result[i].value:result[i].value?{labels:result[i].value.nodes.map(n=>n.label),relationships:result[i].value.relations.map(r=>r.type)}:undefined,error:result[i].reason?.message}));
} finally {await closeDriver();}
