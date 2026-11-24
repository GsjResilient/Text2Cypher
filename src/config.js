export const configured=value=>typeof value==='string'&&value.trim()!==''&&!/replace_with|your-host|changeme/i.test(value);
export const config = {
  port: Number(process.env.PORT || 3210),
  baseUrl: process.env.SILICONFLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
  apiKey: process.env.SILICONFLOW_API_KEY,
  model: process.env.LLM_MODEL || 'deepseek-ai/DeepSeek-V3.2',
  uri: process.env.NEO4J_URI,
  user: process.env.NEO4J_USER || 'neo4j',
  password: process.env.NEO4J_PASSWORD,
  database: process.env.NEO4J_DATABASE || 'neo4j',
  timeout: Number(process.env.QUERY_TIMEOUT_MS || 15000),
  maxRows: Number(process.env.MAX_ROWS || 200),
  maxHops: Number(process.env.MAX_HOPS || 6),
  graphVersion: process.env.GRAPH_VERSION || 'master-to-dd92845',
};
