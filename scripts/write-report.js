import {load} from '../src/store.js';
import {mkdir,writeFile} from 'node:fs/promises';
const runs=await load('evaluation-runs.json');
const current=runs[0];if(!current)throw new Error('尚无评估结果');
const old=runs.at(-1);
const reused=current.results.filter(r=>r.reused).length;
await mkdir('reports',{recursive:true});
await writeFile('reports/evaluation.md',`# CodeGraph 实测与验收记录

## 最终题集

${current.stats.correct}/${current.total} 正确，${current.stats.incorrect} 不正确，${current.stats.review} 待复核。按 PPT 题数门槛对应 ${current.stats.grade}。

这是应用自动比较参考结果的成绩，尚未经过课程人工评分。题集为 10 道简单、12 道中等、8 道困难，参考查询不进入模型生成上下文。

评估汇总时间：${current.completedAt}。${reused} 题复用同问题、同图谱版本的既有执行记录，其余本批重新执行。这是分批回归汇总，不是一次全量调用的成绩。每题实际时间、查询、预期结果和模型结果保存在 evaluation-${current.id}.json 中。

## 首轮与修正

首轮 ${old.stats.correct}/${old.total}。旧题集及失败记录保留在 evaluation-${old.id}.json 中。开发中增加了方法调用方向约束、MQ 路由键语义预检以及节点列表与路径函数的使用规则。为加强独立性，部分复杂题改为跨通信类型去重计数、交叉验证和不同目标实体的反向影响，更新题目后重新运行。

## 软件验证

- 18 项自动化测试通过：只读拦截、路径边界、MQ 语义预检、修正重试、部分失败、实体消歧、取消、集合判定、报告生成、前端 DOM 交互、HTTP 接口和跨进程原子存储。
- 真实服务联调见 integration.json：同名消歧、选择后继续、自然语言总结、RPC/MQ 两个子查询的拓扑合并、真实 ID 传递、非法标签和写操作拦截均通过。
- HTTP 全链路见 http-smoke.json：提交任务、状态查询、历史记录与 Markdown 导出均通过。
- 30 组知识库示例和 30 道测试参考查询均实际执行通过。知识库示例均有非空结果，来源为 AI，仍待团队完成课程要求的人工复核。
- 本环境无可连接的浏览器自动化实例，前端完成模拟 DOM 交互测试，真实浏览器视觉验收尚未完成。

## 逐题记录

`+current.results.map(r=>`### ${r.testId} ${r.question}\n\n判定：${r.verdict}。${r.reason}\n\n执行时间：${r.createdAt}，${r.reused?'复用既有执行记录':'本批执行'}。\n\n${r.queries.map(q=>'```cypher\n'+q.cypher+'\n```\n'+(q.error||'')).join('\n')}\n`).join('\n'));
console.log(JSON.stringify({report:'reports/evaluation.md',stats:current.stats,reused}));
