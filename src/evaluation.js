import {execute} from './graph.js';
import {load,update} from './store.js';
const canonical=value=>{
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  return value;
};
export function compareRows(actual,expected,columns) {
  if(actual.some(row=>columns.some(c=>!Object.hasOwn(row,c))))return {verdict:'review',reason:'生成结果列不符合测试约定，需人工核对'};
  const normalized=rows=>[...new Set(rows.map(row=>JSON.stringify(columns.map(c=>canonical(row[c])))))].sort();
  return JSON.stringify(normalized(actual))===JSON.stringify(normalized(expected))?{verdict:'correct',reason:'按指定列进行无序集合比较，结果一致'}:{verdict:'incorrect',reason:'结果集合与独立参考查询不同'};
}
export async function judge(test,result) {
  if(result.status!=='success')return {verdict:result.status==='clarification'?'review':'incorrect',reason:result.error||result.clarification||'查询未完整成功'};
  if(result.truncated)return {verdict:'review',reason:'生成结果被截断，不能直接判断完整性'};
  try {
    const reference=await execute(test.cypher,test.parameters);
    if(reference.truncated)return {verdict:'review',reason:'参考结果被截断'};
    const actual=result.rows||result.queries.filter(q=>!q.intermediate).flatMap(q=>q.rows);
    return {...compareRows(actual,reference.rows,test.columns),expected:reference.rows,actual};
  }catch(e){return {verdict:'review',reason:'参考查询失败：'+e.message};}
}
export function stats(results,total=30) {
  const counts={correct:0,incorrect:0,review:0};for(const r of results)if(r.verdict in counts)counts[r.verdict]++;
  const complete=results.length===total&&counts.review===0;
  return {...counts,total,run:results.length,accuracy:total?counts.correct/total:0,grade:total!==30?'子集评估':complete?(counts.correct>=27?'A':counts.correct>=24?'B':counts.correct>=20?'C':'D'):'待完成/复核'};
}
export async function review(runId,resultId,verdict,note) {
  if(!['correct','incorrect','review'].includes(verdict)||typeof note!=='string'||!note.trim())throw new Error('请填写判定和依据');
  return update('evaluation-runs.json',runs=>{const run=runs.find(r=>r.id===runId);const result=run?.results.find(r=>r.id===resultId);if(!result)throw new Error('评估结果不存在');result.verdict=verdict;result.reason=note;result.humanReviewed=true;run.stats=stats(run.results,run.total);return runs;});
}
