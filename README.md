## MVX-LOADTEST

MVX 多进程压力测试框架

### 介绍

本框架采用多进程模型，采用`1 x MASTER + N x WORKER`的架构，可对基于SUBSTRATE的区块链进行持续性高并发压力测试。

**详细说明**

主进程（MASTER）启动时读取指定的账户`x.json`文件到内存中（账户文件包含多个助记词/种子，账户地址），随后主进程按指定的分片大小`shardSize`对WORKERS进行任务分配，使用`fork`启动`账户数/分片大小`个子进程（WORKERS），所有WORKER将连接同一个区块链网络。

WORKER启动后将一直等待MASTER发送`distributeKeys`事件，也就是主进程将分片的账户发送到WORKER进行初始化，届时WORKER将回复`waiting`进行握手。随后MASTER可发送`start`到WORKER开始压力测试任务。

每个压力测试任务单元将以`TxPair`为单位进行。WORKER将被分配的账户两两配对形成多个`TxPair`，`TxPair`中的两个账户将会不间断进行相互转账。

每个WORKERS间隔1s向MASTER发送当前`status`，包含发送的交易数量、TPS、状态等信息，MASTER订阅这些消息并输出在控制台。

### 演示

```bash
Loading keyring data from "./data/test.json"...
Done in 198us. Loaded 4 keys.
Total keys: 4, Shard size: 2. Worker count: 2
Creating workers...
2021-07-12 14:27:36        METADATA: Unknown types found, no types for AssetFeedata, ChainConfig
Worker (0) WaitingForInit...
2021-07-12 14:27:39        METADATA: Unknown types found, no types for AssetFeedata, ChainConfig
Worker (1) WaitingForInit...
Done in 5s. Created 2 workers.
Distributing 4 keys to 2 workers...
Done in 487us. Distributed 4 keys to 2 workers, failed: 0.
Starting 2 workers...
Done in 152us. Started 2 workers tasks, failed: 0.
Worker (0) WaitingForStart...
Worker (0) WaitingForStop...
Worker (0) GENERATING TxPairs...
Worker (1) WaitingForStart...
Worker (1) WaitingForStop...
Worker (1) GENERATING TxPairs...
Worker (0) SPAWNING TASKS...
Worker (1) SPAWNING TASKS...
┌──────────┬──────────┬────────┐
│ /        │ TX       │ TPS    │
├──────────┼──────────┼────────┤
│ Worker 0 │ 10084.00 │ 201.68 │
├──────────┼──────────┼────────┤
│ Worker 1 │ 10091.00 │ 201.82 │
└──────────┴──────────┴────────┘
┌───────────────┬──────────┐
│ DURATION      │ 51s      │
├───────────────┼──────────┤
│ TOTAL WORKERS │ 2        │
├───────────────┼──────────┤
│ TOTAL TX      │ 20175    │
├───────────────┼──────────┤
│ TOTAL TPS     │ 403.50   │
├───────────────┼──────────┤
│ AVG TX        │ 10087.50 │
├───────────────┼──────────┤
│ AVG TPS       │ 201.75   │
└───────────────┴──────────┘
```

### 运行

**首先安装包管理工具pnpm**

```
npm i -g pnpm
```

**安装项目依赖**

```
pnpm i
```

**运行**

```
node .
```

**传参**

```
node . --args shardSize=1000 network=ws://127.0.0.1:9944
```
