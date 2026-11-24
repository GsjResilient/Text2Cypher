export function markdown(results,title='代码图谱查询报告') {
  const list=Array.isArray(results)?results:[results];
  const fence=value=>'\n```json\n'+JSON.stringify(value,null,2)+'\n```\n';
  return `# ${title}\n\n生成时间：${new Date().toISOString()}\n\n`+list.map(r=>`## ${r.question}\n\n状态：${r.status}\n\n${r.summary||r.clarification||r.error||''}\n\n${(r.caveats||[]).map(c=>'- '+c).join('\n')}\n\n`+(r.queries||[]).map(q=>`### ${q.name}\n\n状态：${q.status}\n\n\`\`\`cypher\n${q.cypher}\n\`\`\`\n\n参数：${fence(q.parameters)}\n结果：${fence(q.rows)}${q.error?'错误：'+q.error:''}`).join('\n')+`\n### 执行过程\n${(r.trace||[]).map(t=>`- ${t.time} / ${t.stage}：${t.detail}`).join('\n')}`).join('\n\n---\n\n');
}
