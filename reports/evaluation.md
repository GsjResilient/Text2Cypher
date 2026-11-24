# CodeGraph 实测与验收记录

## 最终题集

30/30 正确，0 不正确，0 待复核。按 PPT 题数门槛对应 A。

这是应用自动比较参考结果的成绩，尚未经过课程人工评分。题集为 10 道简单、12 道中等、8 道困难，参考查询不进入模型生成上下文。

评估汇总时间：2026-10-14T04:22:38.349Z。29 题复用同问题、同图谱版本的既有执行记录，其余本批重新执行。这是分批回归汇总，不是一次全量调用的成绩。每题实际时间、查询、预期结果和模型结果保存在 evaluation-77ad6904-4c72-4b1f-aba6-c91698b11241.json 中。

## 首轮与修正

首轮 26/30。旧题集及失败记录保留在 evaluation-5a317fb1-6df1-4c2e-bb34-2b39a776d9e3.json 中。开发中增加了方法调用方向约束、MQ 路由键语义预检以及节点列表与路径函数的使用规则。为加强独立性，部分复杂题改为跨通信类型去重计数、交叉验证和不同目标实体的反向影响，更新题目后重新运行。

## 软件验证

- 18 项自动化测试通过：只读拦截、路径边界、MQ 语义预检、修正重试、部分失败、实体消歧、取消、集合判定、报告生成、前端 DOM 交互、HTTP 接口和跨进程原子存储。
- 真实服务联调见 integration.json：同名消歧、选择后继续、自然语言总结、RPC/MQ 两个子查询的拓扑合并、真实 ID 传递、非法标签和写操作拦截均通过。
- HTTP 全链路见 http-smoke.json：提交任务、状态查询、历史记录与 Markdown 导出均通过。
- 30 组知识库示例和 30 道测试参考查询均实际执行通过。知识库示例均有非空结果，来源为 AI，仍待团队完成课程要求的人工复核。
- 本环境无可连接的浏览器自动化实例，前端完成模拟 DOM 交互测试，真实浏览器视觉验收尚未完成。

## 逐题记录

### S01 名称以 ts-admin 开头的微服务有哪些？只返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T03:58:42.497Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`) WHERE s.`图谱版本`=$version AND s.`服务名称` STARTS WITH $prefix RETURN DISTINCT s.`服务名称` AS service
```


### S02 当前图谱中消息队列节点有多少个？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T03:59:11.292Z，复用既有执行记录。

```cypher
MATCH (q:`消息队列`) WHERE q.`图谱版本`=$version RETURN count(DISTINCT q.nodeId) AS count
```


### S03 当前图谱中共有多少个 Controller 类？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T03:59:59.133Z，复用既有执行记录。

```cypher
MATCH (c:`类`) WHERE c.`图谱版本`=$version AND c.`类类型`='CONTROLLER' RETURN count(DISTINCT c.nodeId) AS count
```


### S04 查找全限定名为 foodsearch.controller.FoodController 的类，返回包名 package。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:00:55.509Z，复用既有执行记录。

```cypher
MATCH (c:`类`) WHERE c.`图谱版本`=$version AND c.`全限定名`=$fqName RETURN DISTINCT c.`包名` AS `package`
```


### S05 foodsearch.service.FoodServiceImpl.getAllFood 方法的返回类型是什么？返回 returnType。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:01:55.463Z，复用既有执行记录。

```cypher
MATCH (m:`方法`) WHERE m.`图谱版本`=$version AND m.`全限定名`=$methodName RETURN DISTINCT m.`返回类型` AS returnType
```


### S06 foodsearch.service.FoodServiceImpl 类属于哪个微服务？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:02:11.983Z，复用既有执行记录。

```cypher
MATCH (c:`类`)-[:`归属于`]->(svc:`微服务`) WHERE c.`图谱版本`=$version AND c.`全限定名`=$className RETURN DISTINCT svc.`服务名称` AS service
```


### S07 图谱中上游 API 使用了哪些不同的 HTTP 方法？返回 verb。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:02:42.680Z，复用既有执行记录。

```cypher
MATCH (a:`上游API`) WHERE a.`图谱版本`=$version RETURN DISTINCT a.`HTTP方法` AS verb
```


### S08 列出 email 队列的所属服务名，返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:02:54.481Z，复用既有执行记录。

```cypher
MATCH (q:`消息队列`) WHERE q.`图谱版本`=$version AND q.`队列名称`=$queue RETURN DISTINCT q.`所属服务名` AS service
```


### S09 有多少个名称以 ts-order 开头的微服务？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:03:13.543Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`) WHERE s.`图谱版本`=$version AND s.`服务名称` STARTS WITH $prefix RETURN count(DISTINCT s.nodeId) AS count
```


### S10 foodsearch.controller.FoodController.getAllFood 归属于哪个类？返回全限定类名 class。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:03:35.407Z，复用既有执行记录。

```cypher
MATCH (m:`方法`)-[:`归属于`]->(c:`类`) WHERE m.`图谱版本`=$version AND m.`全限定名`=$method RETURN DISTINCT c.`全限定名` AS class
```


### M01 ts-order-service 对外提供哪些入口 API？只返回去重路径 path。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:04:35.693Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(c:`类`)<-[:`归属于`]-(m:`方法`)-[:`服务于`]->(a:`上游API`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN DISTINCT a.`API路径` AS path
```


### M02 ts-preserve-service 通过直接 REST 调用依赖哪些服务？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:05:00.429Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(m:`方法`)-[:`下游调用`]->(a:`下游API`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN DISTINCT a.`目标服务名` AS service
```


### M03 有哪些服务通过直接 REST 调用访问 ts-order-service？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:05:26.966Z，复用既有执行记录。

```cypher
MATCH (caller:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(dapi:`下游API`)-[:`目标服务`]->(target:`微服务`) WHERE caller.`图谱版本`=$version AND target.`图谱版本`=$version AND target.`服务名称`=$targetService RETURN DISTINCT caller.`服务名称` AS service
```


### M04 ts-food-service 共提供多少个不同的入口 API 节点？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:05:53.168Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(c:`类`)<-[:`归属于`]-(m:`方法`)<-[:`归属于`]-(a:`上游API`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN count(DISTINCT a.nodeId) AS `count`
```


### M05 ts-food-service 直接 REST 调用涉及多少个不同目标服务？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:06:04.516Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(a:`下游API`)-[:`目标服务`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN count(DISTINCT t.`服务名称`) AS `count`
```


### M06 消费 food_delivery 消息的微服务名称是什么？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:06:38.823Z，复用既有执行记录。

```cypher
MATCH (q:`消息队列`)-[:`消费自`]->(m:`方法`)-[:`归属于`]->(c:`类`)-[:`归属于`]->(svc:`微服务`) WHERE q.`图谱版本`=$version AND q.`队列名称`=$queue AND m.`图谱版本`=$version AND c.`图谱版本`=$version AND svc.`图谱版本`=$version RETURN DISTINCT svc.`服务名称` AS service
```


### M07 直接通过 MQ 依赖 ts-delivery-service 的服务有哪些？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:06:55.245Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)-[:`消息依赖`]->(t:`微服务`) WHERE t.`图谱版本`=$version AND t.`服务名称`=$target AND s.`图谱版本`=$version RETURN DISTINCT s.`服务名称` AS service
```


### M08 ts-preserve-service 直接通过 MQ 依赖哪些服务？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:07:06.490Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)-[:`消息依赖`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN DISTINCT t.`服务名称` AS service
```


### M09 foodsearch.controller.FoodController.getAllFood 直接通过调用或接口调用连接哪些方法？返回全限定名 method。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:14:25.220Z，复用既有执行记录。

```cypher
MATCH (m:`方法`) WHERE m.`图谱版本`=$version AND m.`全限定名`=$method MATCH (m)-[:`调用`|`接口调用`]->(callee:`方法`) WHERE callee.`图谱版本`=$version RETURN DISTINCT callee.`全限定名` AS method
```


### M10 从 foodsearch.controller.FoodController.getAllFood 出发，在两跳方法调用或接口调用范围内有哪些可达方法？不包含零跳，返回 method。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:07:58.141Z，复用既有执行记录。

```cypher
MATCH (start:`方法`) WHERE start.`图谱版本`=$version AND start.`nodeId`=$startNodeId MATCH p=(start)-[:`调用`|`接口调用`*1..2]->(m:`方法`) WHERE all(n IN nodes(p) WHERE n.`图谱版本`=$version) RETURN DISTINCT m.`全限定名` AS `method`
```


### M11 ts-travel-service 的不同下游 API 使用了哪些 HTTP 方法？返回 verb。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:08:13.443Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(cls:`类`)<-[:`归属于`]-(mtd:`方法`)-[:`下游调用`]->(dapi:`下游API`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN DISTINCT dapi.`HTTP方法` AS verb
```


### M12 ts-food-service 中有多少个不同方法直接调用下游 API？返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:08:26.650Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(cls:`类`)<-[:`归属于`]-(m:`方法`)-[:`下游调用`]->(dapi:`下游API`) WHERE s.`图谱版本`=$version AND s.`服务名称`=$service RETURN count(DISTINCT m.`nodeId`) AS `count`
```


### H01 ts-food-service 直接通过 REST 或 MQ 依赖的目标服务，合并去重后共有多少个？只返回 count。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:20:08.456Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`) WHERE s.`图谱版本`=$version AND s.`nodeId`=$serviceId
OPTIONAL MATCH (s)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(a:`下游API`)
WHERE a.`图谱版本`=$version
WITH s, collect(DISTINCT a.`目标服务名`) AS restServices
OPTIONAL MATCH (s)-[:`消息依赖`]->(t:`微服务`)
WHERE t.`图谱版本`=$version
WITH s, restServices, collect(DISTINCT t.`服务名称`) AS mqServices
WITH restServices + mqServices AS allServices
UNWIND allServices AS service
RETURN count(DISTINCT service) AS count
```


### H02 ts-preserve-service 的每个 MQ 目标服务是否也被它直接通过 REST 调用？返回 service 和布尔值 hasRest。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:21:02.254Z，复用既有执行记录。

```cypher
MATCH (s:`微服务` {`nodeId`: $sourceId, `图谱版本`: $version})
OPTIONAL MATCH (s)-[:`消息依赖`]->(mqTarget:`微服务`)
WHERE mqTarget.`图谱版本`=$version
WITH s, collect(DISTINCT mqTarget.`服务名称`) AS mqServices
UNWIND (CASE WHEN mqServices IS NOT NULL AND size(mqServices) > 0 THEN mqServices ELSE [null] END) AS mqService
OPTIONAL MATCH (s)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(dapi:`下游API`)-[:`目标服务`]->(restTarget:`微服务`)
WHERE dapi.`图谱版本`=$version AND restTarget.`图谱版本`=$version AND restTarget.`服务名称` = mqService
WITH mqService, count(DISTINCT restTarget) > 0 AS hasRest
RETURN mqService AS service, hasRest
ORDER BY service
```


### H03 哪些不同的服务通过直接 REST 或 MQ 依赖 ts-delivery-service？返回去重 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:17:06.650Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(a:`下游API`)-[:`目标服务`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND t.`服务名称`=$target AND s.`服务名称` <> t.`服务名称` RETURN DISTINCT s.`服务名称` AS service
```

```cypher
MATCH (s:`微服务`)-[:`消息依赖`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND t.`服务名称`=$target AND s.`服务名称` <> t.`服务名称` RETURN DISTINCT s.`服务名称` AS service
```


### H04 food_delivery 完整消息链路连接哪些发送方法与消费方法？匹配发布和路由的路由键，返回 sender、receiver 的全限定名。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:17:57.163Z，复用既有执行记录。

```cypher
MATCH (sender:`方法`)-[pub:`发布至`]->(ex:`消息交换机`)-[route:`路由至`]->(q:`消息队列`)-[:`消费自`]->(receiver:`方法`) WHERE q.`图谱版本`=$version AND q.`队列名称`=$queue AND pub.`路由键`=route.`路由键` AND all(n IN [sender, ex, q, receiver] WHERE n.`图谱版本`=$version) RETURN DISTINCT sender.`全限定名` AS sender, receiver.`全限定名` AS receiver
```


### H05 哪些微服务发布消息到 email 队列？沿方法归属定位发送方，且匹配路由键，返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:18:22.942Z，复用既有执行记录。

```cypher
MATCH (m:`方法`)-[pub:`发布至`]->(ex:`消息交换机`)-[route:`路由至`]->(q:`消息队列`), (m)-[:`归属于`]->(cls:`类`)-[:`归属于`]->(svc:`微服务`) WHERE m.`图谱版本`=$version AND q.`队列名称`=$queue AND pub.`路由键`=route.`路由键` AND all(n IN [cls, svc] WHERE n.`图谱版本`=$version) RETURN DISTINCT svc.`服务名称` AS service
```


### H06 修改 foodsearch.mq.RabbitSend.send，四跳方法调用范围内潜在影响哪些上游 API？只返回去重 path。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:22:17.173Z，本批执行。

```cypher
MATCH (start:`方法` {`nodeId`: $startMethodId, `图谱版本`: $version})
MATCH p=(start)<-[:`调用`|`接口调用`*0..4]-(caller:`方法`)
WHERE all(n IN nodes(p) WHERE n.`图谱版本`=$version)
WITH DISTINCT caller
MATCH (api:`上游API`)-[:`归属于`]->(caller)
WHERE api.`图谱版本`=$version
RETURN DISTINCT api.`API路径` AS path
```


### H07 foodsearch.controller.FoodController.getAllFood 在四跳调用或接口调用内可访问哪些下游服务？返回 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:12:42.590Z，复用既有执行记录。

```cypher
MATCH (m:`方法`) WHERE m.`图谱版本`=$version AND m.`nodeId`=$methodId MATCH p=(m)-[:`调用`|`接口调用`*0..4]->(x:`方法`)-[:`下游调用`]->(a:`下游API`) WHERE all(n IN nodes(p) WHERE n.`图谱版本`=$version) RETURN DISTINCT a.`目标服务名` AS service
```


### H08 哪些不同的服务通过直接 REST 或 MQ 依赖 ts-notification-service？返回去重 service。

判定：correct。按指定列进行无序集合比较，结果一致

执行时间：2026-10-14T04:12:58.070Z，复用既有执行记录。

```cypher
MATCH (s:`微服务`)<-[:`归属于`]-(:`类`)<-[:`归属于`]-(:`方法`)-[:`下游调用`]->(a:`下游API`)-[:`目标服务`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND t.`服务名称`=$target RETURN DISTINCT s.`服务名称` AS service
```

```cypher
MATCH (s:`微服务`)-[:`消息依赖`]->(t:`微服务`) WHERE s.`图谱版本`=$version AND t.`服务名称`=$target RETURN DISTINCT s.`服务名称` AS service
```

