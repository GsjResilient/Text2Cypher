import {queryAgent} from './agent.js';
import {load,update,id} from './store.js';
import {judge,stats} from './evaluation.js';
export class JobManager {
  constructor(agent=queryAgent){this.agent=agent;this.jobs=new Map();this.queue=Promise.resolve();}
  create(items,{evaluation=false}={}) {
    if(!Array.isArray(items)||!items.length||items.length>30)throw new Error('每次需提交 1–30 个问题');
    for(const item of items)if(typeof item.question!=='string'||!item.question.trim()||item.question.length>2000||!['simple','medium','complex'].includes(item.level))throw new Error('问题或难度格式不正确');
    const active=[...this.jobs.values()].filter(j=>['queued','running'].includes(j.status));if(active.length>=5)throw new Error('任务队列已满');
    const job={id:id(),status:'queued',items,results:[],total:items.length,completed:0,createdAt:new Date().toISOString(),evaluation,controller:new AbortController()};
    this.jobs.set(job.id,job);this.queue=this.queue.catch(()=>{}).then(()=>this.run(job));return this.snapshot(job.id);
  }
  snapshot(jobId){const job=this.jobs.get(jobId);if(!job)return null;const {controller,items,...view}=job;return structuredClone(view);}
  cancel(jobId){const job=this.jobs.get(jobId);if(!job)throw new Error('任务不存在');if(['queued','running'].includes(job.status)){job.controller.abort(new Error('用户取消任务'));job.cancelRequested=true;}return this.snapshot(jobId);}
  async run(job) {
    job.status='running';
    try {
      for(const item of job.items) {
        if(job.controller.signal.aborted)break;
        job.currentQuestion=item.question;
        const result=await this.agent(item.question,item.level,{signal:job.controller.signal,context:item.context,outputContract:item.columns?{columns:item.columns,types:item.columnTypes,instruction:item.output}:null,summarize:true,onProgress:p=>{job.progress=p;}});
        if(job.evaluation){const grading=await judge(item,result);job.results.push({...result,...grading,testId:item.id});}
        else job.results.push(result);
        job.completed++;
      }
      const statuses=job.results.map(r=>r.status);
      job.status=job.controller.signal.aborted?'cancelled':statuses.every(s=>s==='success')?'success':statuses.every(s=>s==='error')?'error':statuses.length===1?statuses[0]:'partial';
    }catch(e){job.status='error';job.error=e.message;}
    job.completedAt=new Date().toISOString();
    if(job.evaluation){job.stats=stats(job.results,job.total);await update('evaluation-runs.json',runs=>[this.snapshot(job.id),...runs].slice(0,30));}
    await update('jobs.json',jobs=>[this.snapshot(job.id),...jobs.filter(j=>j.id!==job.id)].slice(0,100));
    // Keep the newest jobs only once complete; persisted reports remain available.
    if(this.jobs.size>100){for(const [key,value] of this.jobs)if(!['queued','running'].includes(value.status)&&key!==job.id){this.jobs.delete(key);break;}}
  }
}
export const jobs=new JobManager();
