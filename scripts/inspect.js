import {schema,read,plain,closeDriver} from '../src/graph.js';
import {mkdir,writeFile} from 'node:fs/promises';
try {
 const s=await schema();
 await mkdir('data',{recursive:true});
 await writeFile('data/schema-snapshot.json',JSON.stringify(s,null,2));
 console.log(JSON.stringify({nodes:s.nodes.map(n=>({label:n.label,properties:n.properties,sample:n.samples[0]})),relations:s.relations.map(r=>({type:r.type,samples:r.samples}))}));
 for(const q of [
  'MATCH (a)-[r]->(b) RETURN labels(a) AS source,type(r) AS type, labels(b) AS target,count(*) AS count ORDER BY count DESC LIMIT 60',
  'MATCH (n:`方法`) WHERE n.`方法名` = "getAllFood" OR n.`简名` = "getAllFood" RETURN properties(n) AS p LIMIT 5',
  'MATCH (n:`消息队列`) RETURN properties(n) AS p LIMIT 5',
 ]) {const r=await read(q);console.log(JSON.stringify(r.records.map(r=>plain(r.toObject()))));}
} finally {await closeDriver();}
