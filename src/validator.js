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

export function validateMessageRouting(query){
  // Domain preflight: a shared default exchange must not mix different routing keys.
  const code=query.replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g,' ').replaceAll('`','');
  if(!/:\s*发布至/u.test(code))return;
  if(!/:\s*路由至/u.test(code))return;
  const aliases=type=>[...code.matchAll(new RegExp('\\[\\s*([\\p{L}_][\\p{L}\\p{N}_]*)\\s*:\\s*'+type,'gu'))].map(m=>m[1]);
  const pubs=aliases('发布至'),routes=aliases('路由至');
  const paired=routes.length&&pubs.length&&routes.every(r=>pubs.some(p=>new RegExp(`(?:${p}\\s*\\.\\s*路由键\\s*=\\s*${r}\\s*\\.\\s*路由键|${r}\\s*\\.\\s*路由键\\s*=\\s*${p}\\s*\\.\\s*路由键)`,'u').test(code)));
  if(!paired)throw new Error('MQ 语义预检失败：发布至与路由至必须分别绑定关系变量，并显式比较 pub.`路由键` = route.`路由键`，避免共享交换机造成错误关联');
}
