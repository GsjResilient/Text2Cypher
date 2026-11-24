import {schema} from './graph.js';
import {update} from './store.js';
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
export async function judge(test,result,{schemaProvider=schema}={}) {
  if(result.status!=='success')return {verdict:result.status==='clarification'?'review':'incorrect',reason:result.error||result.clarification||'查询未完整成功'};
  if(result.truncated)return {verdict:'review',reason:'生成结果被截断，不能直接判断完整性'};
  try {
    const current=await schemaProvider();
    if(!test.schemaFingerprint)return {verdict:'review',reason:'测试题缺少 Schema 指纹，不能证明固定预期结果与当前图谱匹配'};
    if(test.schemaFingerprint!==current.fingerprint)return {verdict:'review',reason:`图谱 Schema 或数据已变化：测试 ${test.schemaFingerprint.slice(0,12)}，当前 ${current.fingerprint?.slice(0,12)||'未知'}，禁止复用旧预期结果`};
    if(!Array.isArray(test.expected))return {verdict:'review',reason:'测试题没有固定的预期结果'};
    if(test.expected.length===0&&test.allowEmpty!==true)return {verdict:'review',reason:'参考结果为空且未明确允许空结果，禁止把“共同返回空集”判为正确'};
    const actual=result.rows||result.queries.filter(q=>!q.intermediate).flatMap(q=>q.rows);
    const compared=compareRows(actual,test.expected,test.columns);
    if(compared.verdict!=='correct')return {...compared,expected:test.expected,actual,summaryVerdict:'skipped'};
    if(test.requireSummary!==false){
      if(typeof result.summary!=='string'||!result.summary.trim())return {verdict:'review',reason:'结果集一致，但缺少自然语言总结',expected:test.expected,actual,automatedVerdict:'correct',summaryVerdict:'missing'};
      return {...compared,reason:compared.reason+'；自然语言总结待人工复核',expected:test.expected,actual,summaryVerdict:'review'};
    }
    return {...compared,expected:test.expected,actual,summaryVerdict:'skipped'};
  }catch(e){return {verdict:'review',reason:'评测前置校验失败：'+e.message};}
}
export function stats(results,total=30) {
  const counts={correct:0,incorrect:0,review:0};for(const r of results)if(r.verdict in counts)counts[r.verdict]++;
  const summaryReview=results.filter(result=>result.summaryVerdict==='review'||result.summaryVerdict==='missing').length;
  const reused=results.filter(result=>result.reused).length;
  const complete=results.length===total&&counts.review===0&&summaryReview===0;
  const grade=total!==30?'子集评估':reused?'回归汇总（非正式评分）':complete?(counts.correct>=27?'A':counts.correct>=24?'B':counts.correct>=20?'C':'D'):'待完成/复核';
  return {...counts,summaryReview,reused,total,run:results.length,accuracy:total?counts.correct/total:0,grade};
}
export async function review(runId,resultId,verdict,note) {
  if(!['correct','incorrect','review'].includes(verdict)||typeof note!=='string'||!note.trim())throw new Error('请填写判定和依据');
  return update('evaluation-runs.json',runs=>{const run=runs.find(r=>r.id===runId);const result=run?.results.find(r=>r.id===resultId);if(!result)throw new Error('评估结果不存在');result.verdict=verdict;result.reason=note;result.humanReviewed=true;if(verdict==='correct')result.summaryVerdict='correct';run.stats=stats(run.results,run.total);return runs;});
}
