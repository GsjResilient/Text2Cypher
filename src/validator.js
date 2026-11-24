// Restricted Cypher subset plus an independent EXPLAIN queryType check.
export function maskLiterals(query) {
  let out='';
  for(let i=0;i<query.length;i++) {
    const c=query[i];
    if(c==="'"||c==='"'||c==='`') {
      const quote=c;out+=' ';let closed=false;
      for(i++;i<query.length;i++) {
        if(query[i]==='\\'&&quote!=='`'){i++;continue;}
        if(query[i]===quote){if(query[i+1]===quote){i++;continue;}closed=true;break;}
      }
      if(!closed)throw new Error('字符串或标识符引号未闭合');
    }else out+=c;
  }return out;
}
export function validateCypher(input,maxHops=6) {
  if(typeof input!=='string'||!input.trim())throw new Error('Cypher 不能为空');
  const query=input.trim().replace(/;\s*$/,'');
  if(query.length>16000)throw new Error('Cypher 过长');
  const tokens=maskLiterals(query);
  if(/\/\*|\/\//.test(tokens))throw new Error('查询不允许注释');
  if(tokens.includes(';'))throw new Error('一次只能执行一条查询');
  if(!/^\s*(MATCH|OPTIONAL\s+MATCH|WITH)\b/i.test(tokens)||!/\bRETURN\b/i.test(tokens))throw new Error('仅支持 MATCH / WITH 开始并返回结果的查询');
  if(/\b(CREATE|MERGE|DELETE|DETACH|SET|REMOVE|DROP|LOAD|CSV|CALL|FOREACH|SHOW|ALTER|GRANT|DENY|REVOKE|USE|INSERT|FINISH|TRANSACTIONS|PROFILE|EXPLAIN)\b/i.test(tokens))throw new Error('只读校验失败：检测到禁用操作');
  if(/\b(EXISTS|COUNT|COLLECT)\s*\{/i.test(tokens)||/\]\s*\{|\)\s*\{|\)\s*[+*]/.test(tokens))throw new Error('不支持子查询或量化路径');
  if(/\)\s*-\s*\(/.test(tokens)||/\)\s*-\s*\[[^\]]*\]\s*-\s*\(/.test(tokens))throw new Error('关系必须明确方向');
  for(const match of tokens.matchAll(/\[[^\]]*\*([^\]]*)\]/g)) {
    const range=match[1].trim();
    if(!/^\d+(?:\s*\.\.\s*\d+)?$/.test(range))throw new Error('路径须指定有限上下界，如 *1..4');
    const bounds=range.split('..').map(Number);
    if(bounds.some(n=>n>maxHops)||bounds[0]<0||(bounds.length===2&&bounds[0]>bounds[1]))throw new Error(`路径长度必须在 0–${maxHops} 跳内`);
  }
  validateMessageRouting(query);
  return query;
}

function schemaTokens(query) {
  const withoutStrings=query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ');
  const identifiers=source=>[...source.matchAll(/`([^`]+)`|([\p{L}_][\p{L}\p{N}_]*)/gu)].map(match=>match[1]||match[2]);
  const labels=[];
  for(const match of withoutStrings.matchAll(/\(([^)]*)\)/g)) {
    const body=match[1].replace(/\{[\s\S]*$/,'');
    const colon=body.indexOf(':');
    if(colon>=0)labels.push(...identifiers(body.slice(colon+1)));
  }
  const relations=[];
  for(const match of withoutStrings.matchAll(/\[([^\]]*)\]/g)) {
    const body=match[1];const colon=body.indexOf(':');
    if(colon<0)continue;
    relations.push(...identifiers(body.slice(colon+1).replace(/\*[\s\S]*$/,'')));
  }
  const properties=[...withoutStrings.matchAll(/\.\s*(?:`([^`]+)`|([\p{L}_][\p{L}\p{N}_]*))/gu)].map(match=>match[1]||match[2]);
  return {labels:[...new Set(labels)],relations:[...new Set(relations)],properties:[...new Set(properties)]};
}

function schemaPatterns(query) {
  const code=query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ');
  const identifier=text=>(text.match(/`([^`]+)`|([\p{L}_][\p{L}\p{N}_]*)/u)||[]).slice(1).find(Boolean);
  const aliases=new Map();
  for(const match of code.matchAll(/\(([^)]*)\)/g)){const beforeMap=match[1].replace(/\{[\s\S]*$/,'');const colon=beforeMap.indexOf(':');if(colon<0)continue;const alias=identifier(beforeMap.slice(0,colon)),label=identifier(beforeMap.slice(colon+1));if(alias&&label)aliases.set(alias,label);}
  const nodeLabel=body=>{const beforeMap=body.replace(/\{[\s\S]*$/,'');const colon=beforeMap.indexOf(':');if(colon>=0)return identifier(beforeMap.slice(colon+1));return aliases.get(identifier(beforeMap))||null;};
  const relationTypes=body=>{const colon=body.indexOf(':');if(colon<0)return [];return [...body.slice(colon+1).replace(/\*[\s\S]*$/,'').matchAll(/`([^`]+)`|([\p{L}_][\p{L}\p{N}_]*)/gu)].map(match=>match[1]||match[2]);};
  const patterns=[];
  for(const match of code.matchAll(/\(([^)]*)\)\s*(<-|-)\s*\[([^\]]*)\]\s*(->|-)\s*\(([^)]*)\)/g)) {
    const left=nodeLabel(match[1]),right=nodeLabel(match[5]),types=relationTypes(match[3]);
    if(!left||!right||!types.length)continue;
    if(match[2]==='-'&&match[4]==='->')patterns.push({source:left,target:right,types});
    else if(match[2]==='<-'&&match[4]==='-')patterns.push({source:right,target:left,types});
  }
  return patterns;
}

export function validateSchemaReferences(query,structure) {
  if(!structure?.nodes||!structure?.relations)throw new Error('Schema 不可用，无法校验查询');
  const references=schemaTokens(query);
  const labels=new Set(structure.nodes.map(node=>node.label));
  const relations=new Set(structure.relations.map(relation=>relation.type));
  const properties=new Set(structure.propertyKeys||structure.nodes.flatMap(node=>node.properties||[]));
  for(const relation of structure.relations)for(const sample of relation.samples||[])for(const key of Object.keys(sample.properties||{}))properties.add(key);
  const unknownLabels=references.labels.filter(label=>!labels.has(label));
  const unknownRelations=references.relations.filter(type=>!relations.has(type));
  const unknownProperties=references.properties.filter(property=>!properties.has(property));
  const problems=[];
  if(unknownLabels.length)problems.push(`不存在的节点标签：${unknownLabels.join('、')}`);
  if(unknownRelations.length)problems.push(`不存在的关系类型：${unknownRelations.join('、')}`);
  if(unknownProperties.length)problems.push(`不存在的属性：${unknownProperties.join('、')}`);
  const invalidEndpoints=[];
  for(const pattern of schemaPatterns(query))for(const type of pattern.types){
    const relation=structure.relations.find(candidate=>candidate.type===type);if(!relation)continue;
    const valid=(relation.endpoints||[]).some(endpoint=>(endpoint.source||[]).includes(pattern.source)&&(endpoint.target||[]).includes(pattern.target));
    if(!valid)invalidEndpoints.push(`${pattern.source}-[:${type}]->${pattern.target}`);
  }
  if(invalidEndpoints.length)problems.push(`关系方向或端点与 Schema 不符：${[...new Set(invalidEndpoints)].join('、')}`);
  if(problems.length)throw new Error('Schema 校验失败：'+problems.join('；'));
  return references;
}

export function validateMessageRouting(query){
  // Domain preflight: a shared default exchange must not mix different routing keys.
  const code=query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ').replaceAll('`','');
  const aliases=type=>[...code.matchAll(new RegExp('\\[\\s*([\\p{L}_][\\p{L}\\p{N}_]*)\\s*:\\s*'+type,'gu'))].map(m=>m[1]);
  const flows=aliases('消息流');
  if(flows.length>=2&&/消息交换机/u.test(code)&&/消息队列/u.test(code)){
    const routed=flows.some(a=>flows.some(b=>a!==b&&new RegExp(`(?:${a}\\s*\\.\\s*路由键\\s*=\\s*${b}\\s*\\.\\s*路由键|${b}\\s*\\.\\s*路由键\\s*=\\s*${a}\\s*\\.\\s*路由键)`,'u').test(code)));
    if(!routed||!/消息流类型/u.test(code))throw new Error('MQ 语义预检失败：通用“消息流”关系必须限定消息流类型，并显式比较发布与路由的路由键');
  }
  if(!/:\s*发布至/u.test(code))return;
  if(!/:\s*路由至/u.test(code))return;
  const pubs=aliases('发布至'),routes=aliases('路由至');
  const paired=routes.length&&pubs.length&&routes.every(r=>pubs.some(p=>new RegExp(`(?:${p}\\s*\\.\\s*路由键\\s*=\\s*${r}\\s*\\.\\s*路由键|${r}\\s*\\.\\s*路由键\\s*=\\s*${p}\\s*\\.\\s*路由键)`,'u').test(code)));
  if(!paired)throw new Error('MQ 语义预检失败：发布至与路由至必须分别绑定关系变量，并显式比较 pub.`路由键` = route.`路由键`，避免共享交换机造成错误关联');
}
