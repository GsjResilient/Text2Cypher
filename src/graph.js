import neo4j from 'neo4j-driver';
import {createHash} from 'node:crypto';
import {config,configured} from './config.js';
import {validateCypher,validateSchemaReferences} from './validator.js';

let driver;
export function getDriver() {
  if (!configured(config.uri) || !configured(config.password)) throw new Error('请先配置真实的 Neo4j 连接信息');
  return driver ||= neo4j.driver(config.uri, neo4j.auth.basic(config.user,config.password), {connectionTimeout:7000,connectionAcquisitionTimeout:8000,maxConnectionPoolSize:8});
}
export async function closeDriver() {await driver?.close();}
export async function read(query, parameters = {}) {
  const session = getDriver().session({database:config.database,defaultAccessMode:neo4j.session.READ});
  try {const pending=session.run(query,parameters,{timeout:config.timeout});const keys=await pending.keys();return {...await pending,keys};}
  finally {await session.close();}
}
export function plain(value) {
  if (neo4j.isInt(value)) return value.inSafeRange() ? value.toNumber() : value.toString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,plain(v)]));
  return value;
}
let cached;
export function fingerprintSchema(value) {
  const stable={
    graphVersion:value.graphVersion,
    nodes:(value.nodes||[]).map(node=>({label:node.label,properties:[...(node.properties||[])].sort()})).sort((a,b)=>a.label.localeCompare(b.label)),
    relations:(value.relations||[]).map(relation=>({type:relation.type,endpoints:(relation.endpoints||[]).map(endpoint=>({source:[...(endpoint.source||[])].sort(),target:[...(endpoint.target||[])].sort()})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))})).sort((a,b)=>a.type.localeCompare(b.type)),
    counts:value.counts||{},
  };
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
export async function schema(refresh = false) {
  if (cached && !refresh && Date.now()-cached.time < 300000) return cached.value;
  const labels = await read('CALL db.labels() YIELD label RETURN label');
  const types = await read('CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType');
  const properties = await read('CALL db.propertyKeys() YIELD propertyKey RETURN propertyKey');
  const nodes = [];
  for (const record of labels.records) {
    const label = record.get('label');
    const escaped = label.replaceAll('`','``');
    const sample = await read(`MATCH (n:\`${escaped}\`) RETURN properties(n) AS p LIMIT 3`);
    nodes.push({label, properties:[...new Set(sample.records.flatMap(r=>Object.keys(r.get('p'))))],samples:sample.records.map(r=>plain(r.get('p')))});
  }
  const relations = [];
  for (const record of types.records) {
    const type=record.get('relationshipType');
    const escaped=type.replaceAll('`','``');
    const sample=await read(`MATCH (a)-[r:\`${escaped}\`]->(b) RETURN labels(a) AS source, labels(b) AS target, properties(r) AS properties LIMIT 8`);
    relations.push({type,samples:sample.records.map(r=>plain(r.toObject()))});
  }
  const endpoints=await read('MATCH (a)-[r]->(b) RETURN DISTINCT labels(a) AS source,type(r) AS type,labels(b) AS target');
  for(const relation of relations) relation.endpoints=endpoints.records.filter(r=>r.get('type')===relation.type).map(r=>({source:r.get('source'),target:r.get('target')}));
  let completeProperties=false;
  try {
    const metadata=await read('CALL db.schema.nodeTypeProperties() YIELD nodeLabels, propertyName RETURN nodeLabels, propertyName');
    for(const node of nodes) node.properties=[...new Set(metadata.records.filter(r=>r.get('nodeLabels').includes(node.label)).map(r=>r.get('propertyName')).filter(Boolean))];
    completeProperties=true;
  }catch{/* Metadata procedure may be restricted on some installations. */}
  const nodeCounts=await read('MATCH (n) WHERE n.`图谱版本`=$version UNWIND labels(n) AS label RETURN label, count(*) AS count',{version:config.graphVersion});
  const relationCounts=await read('MATCH ()-[r]->() WHERE r.`图谱版本`=$version RETURN type(r) AS type, count(*) AS count',{version:config.graphVersion});
  const counts={
    nodes:Object.fromEntries(nodeCounts.records.map(record=>[record.get('label'),plain(record.get('count'))])),
    relations:Object.fromEntries(relationCounts.records.map(record=>[record.get('type'),plain(record.get('count'))])),
  };
  const value={nodes,relations,counts,graphVersion:config.graphVersion,completeProperties,propertyKeys:properties.records.map(r=>r.get('propertyKey')),note:completeProperties?'节点属性取自全库元数据；示例属性值为采样。':'节点属性为采样，propertyKeys 为全库属性名；不能以采样缺失推断属性不存在。',fetchedAt:new Date().toISOString()};
  value.fingerprint=fingerprintSchema(value);
  cached={time:Date.now(),value};return value;
}
export async function candidates(question,extraTerms=[]) {
  const terms=[...new Set([...extraTerms,...(question.match(/[A-Za-z_][A-Za-z0-9_.-]{2,}/g)||[])].filter(t=>!['api','rpc','mq','rest','http','controller'].includes(t.toLowerCase())).slice(0,8))];
  if (!terms.length) return [];
  const result=await read('MATCH (n) WHERE n.`图谱版本` = $version AND any(k IN ["服务名称","方法名","全限定名","简名","队列名称","交换机名称","API路径","nodeId"] WHERE any(term IN $terms WHERE toLower(toString(n[k])) = toLower(term))) RETURN elementId(n) AS id, labels(n) AS labels, properties(n) AS properties LIMIT 25',{terms,version:config.graphVersion});
  return result.records.map(r=>plain(r.toObject()));
}
export async function execute(cypher, parameters = {}) {
  const query=validateCypher(cypher,config.maxHops);
  validateSchemaReferences(query,await schema());
  const explain=await read(`EXPLAIN ${query}`,parameters);
  if (explain.summary.queryType !== 'r') throw new Error('数据库执行计划未确认该语句为只读');
  const invalid=(explain.summary.notifications||[]).filter(n=>/Unknown(Label|RelationshipType|PropertyKey)/i.test(n.code));
  if (invalid.length) throw new Error('Schema 校验失败：'+invalid.map(n=>n.description).join('；'));
  const result=await read(`CALL { ${query} } RETURN * LIMIT ${config.maxRows + 1}`,parameters);
  const limited=result.records.length>=config.maxRows;
  const records=result.records.slice(0,config.maxRows);
  const nodes=new Map(),edges=new Map();
  const addNode=n=>{const id=n.elementId||String(n.identity);nodes.set(id,{id,labels:n.labels,properties:plain(n.properties)});};
  const addEdge=r=>{const id=r.elementId||String(r.identity);edges.set(id,{id,source:r.startNodeElementId||String(r.start),target:r.endNodeElementId||String(r.end),type:r.type,properties:plain(r.properties)});};
  const visit=v=>{
    if (!v) return;
    if (v instanceof neo4j.types.Node) addNode(v);
    else if (v instanceof neo4j.types.Relationship) addEdge(v);
    else if (v instanceof neo4j.types.Path) {addNode(v.start);addNode(v.end);v.segments.forEach(s=>{addNode(s.start);addNode(s.end);addEdge(s.relationship);});}
    else if (Array.isArray(v)) v.forEach(visit);
    else if (typeof v==='object') Object.values(v).forEach(visit);
  };
  records.forEach(r=>r.forEach(visit));
  const missing=[...new Set([...edges.values()].flatMap(e=>[e.source,e.target]))].filter(id=>!nodes.has(id));
  if(missing.length){const endpoints=await read('MATCH (n) WHERE elementId(n) IN $ids RETURN n',{ids:missing});endpoints.records.forEach(r=>addNode(r.get('n')));}
  return {columns:result.keys,rows:records.map(r=>plain(r.toObject())),graph:{nodes:[...nodes.values()],edges:[...edges.values()]},truncated:limited,warnings:(explain.summary.notifications||[]).map(n=>n.description)};
}
