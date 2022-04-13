## CHAIN-LOADTEST

区块链多进程压力测试框架


### 项目简介

本框架采用多进程模型，采用 `1 x MASTER + N x WORKER` 的架构，可对基于 substrate 的区块链进行持续性高并发压力测试。

**详细说明**

主进程（MASTER）启动时读取指定的账户 `x.json` 文件到内存中（账户文件包含多个助记词/种子，账户地址），随后主进程按指定的分片大小 `shardSize` 对 WORKERS 进行任务分配，使用 `fork` 启动 `账户数/分片大小` 个子进程（WORKERS），所有 WORKER 将连接同一个区块链网络。

WORKER 启动后将一直等待 MASTER 发送 `distributeKeys` 事件，也就是主进程将分片的账户发送到 WORKER 进行初始化，届时 WORKER 将回复 `waiting` 进行握手。随后 MASTER 可发送 `start` 到 WORKER 开始压力测试任务。

每个压力测试任务单元将以 `TxPair` 为单位进行。WORKER 将被分配的账户两两配对形成多个 `TxPair`，`TxPair` 中的两个账户将会不间断进行相互转账。

每个 WORKERS 间隔 1s 向 MASTER 发送当前 `status`，包含发送的交易数量、TPS、状态等信息，MASTER 订阅这些消息并输出在控制台。

## 测试服务器配置：

- 3 Node（2 验证节点）, 1 Requester (外加Prometheus指标采集器).
- 实例型号：`ecs.hfc7.2xlarge`
- 实例配置：`Intel Xeon Platinum (Cooper Lake) 8369 (3.3/3.8 GHZ)` 8C - 16G - SSD

**TIPS**

- REQUESTER 用于发送压测请求，Prometheus指标采集
- NODE 为节点，有两个验证节点，一个同步节点
- 所有服务器均开启了`NODE_EXPORTER`用于服务器性能监控。

**内网地址：**

NODE1 - `172.27.83.236`
NODE2 - `172.27.83.234`
NODE3 - `172.27.83.235`
REQUESTER (Prometheus) - `172.27.83.237`

**公网地址：**

NODE1 - `47.242.33.65`
NODE2 - `47.242.199.221`
NODE3 - `47.242.188.231`
REQUESTER (Prometheus) - `47.242.202.27`

## 测试流程

1.使用substrate编译 `subkey`工具（已魔改）中的 `generate-keys`批量生成sr25519账户1000个。

```
./subkey generate-keys --count=1000
```

将生成的 `keys.js` 转换为 `accounts.json`

```
import json

with open('keys.json') as fr:
    keys: list = json.load(fr)

fixed = [{ 
    "name": f'test{idx}', 
    "mnemonic": i['secretPhrase'],
    "address": i['ss58Address'] 
} for idx, i in enumerate(keys)]

with open('accounts.json', 'w') as fw:
    json.dump(fixed, fw)

with open('addresses.json', 'w') as fw:
    json.dump([i['address'] for i in fixed], fw)
```

2.基于local链生成 `customSpec.json。`

```
./node-template build-spec --disable-default-bootnode --chain local > customSpec.json`
```

3.将生成的账户文件信息写入创世文件中，并赋予初始余额。

```
import json

with open('customSpec.json') as f:
    spec: list = json.load(f)

balances: list = spec['genesis']['runtime']['balances']['balances']

with open('addresses.json') as f:
    addresses = json.load(f)

for address in addresses:
    balances.append([address, 1000000000000000000000])

with open('customSpec_new.json', 'w') as fw:
    json.dump(spec, fw)
```

4.编译创世文件。

```
./node-template build-spec --chain=customSpec_new.json --raw --disable-default-bootnode > customSpecRaw.json
```

5.组网，使用编译后的 `customSpecRaw.json` 启动区块链，两个validator，一个同步节点。

```
./node-template --chain=customSpecRaw.json --tmp --rpc-methods Unsafe --ws-external --rpc-cors all
```

6.将生成的账户 `accounts.jso`n放入 `substrate-loadtest `测试框架 `data`目录中，启动压力测试程序开始压测。

将1000个账户按100分片，也就是10个进程进行压测，使用内网地址进行请求。

```
node . --args accounts=./data/accounts.json shardSize=100 network=ws://172.27.83.236:9946
```

## 压测

启动 `substrate-loadtest`测试框架，可以看到压测服务器启动了10个进程，有两个进程挂了。

![pgpng](https://images.gitee.com/uploads/images/2021/0712/164038_6e8299f7_4788263.png)

实际上不管有几个进程，REQUESTER最高的总发送TPS都大约为1450左右，不超过1500。

如下，在另一次测试中只挂了一个进程，但是TOTAL TPS比挂两个进程时要高一点。

说明这个应该受限于网络IO，REQUEST的发送TPS达到最大值了。

![25266png](https://images.gitee.com/uploads/images/2021/0712/164857_7c628dec_4788263.png)

我也尝试过把分片数设置为20，启动50个WORKER，但实际上效果差不多。
![spawningpng](https://images.gitee.com/uploads/images/2021/0712/164249_acef6f77_4788263.png)

继续查看REQUESTER的主机信息

压测机的网络IO占用较高

![41png](https://images.gitee.com/uploads/images/2021/0712/165011_21039ad4_4788263.png)

![42png](https://images.gitee.com/uploads/images/2021/0712/165018_473cc498_4788263.png)

压测机IO高占用

![43png](https://images.gitee.com/uploads/images/2021/0712/165123_c2f1748c_4788263.png)

### 压测机情况

可以看到**压测机在测试期间的平均CPU占用几乎达到了100%**，发送压测请求基本上已经压榨出了这台服务器的性能。

![t42png](https://images.gitee.com/uploads/images/2021/0712/170613_528ccacb_4788263.png)

![t4png](https://images.gitee.com/uploads/images/2021/0712/170444_3fde5daf_4788263.png)

### 压测机的情况大概如上，下面是节点机的状况

### 节点1：

节点1直接被我们的压测机请求，可以看到CPU占用和网络IO有较大波动。

压测期间的8核心CPU占用大概在20%左右，峰值达到28%
![n12png](https://images.gitee.com/uploads/images/2021/0712/170712_891945dd_4788263.png)

![node1png](https://images.gitee.com/uploads/images/2021/0712/165359_745742c4_4788263.png)

### 节点2：

节点2也是验证节点，但是性能压力相比节点1稍低一点

CPU峰值在25%

![t22png](https://images.gitee.com/uploads/images/2021/0712/170849_5e0cd683_4788263.png)

![node2png](https://images.gitee.com/uploads/images/2021/0712/165454_3497c2f5_4788263.png)

### 节点3：

节点3不承担验证工作，只进行同步，所以CPU压力比节点1、2都小。

平均CPU占用在15%左右，峰值为20%。

![N333png](https://images.gitee.com/uploads/images/2021/0712/171015_ba537214_4788263.png)

![node3png](https://images.gitee.com/uploads/images/2021/0712/165605_d3680389_4788263.png)

## 总结：负载 - 节点1（验证+直接被请求）>节点2（验证）>节点3（仅同步）

 CPU占用（峰值）：节点1 30% - 节点2 25% - 节点3 20%

 网络IO：节点1 > 节点2 > 节点3

## 以上是NODE-EXPLORER对服务器的检测情况，下面展示substrate自己的prometheus统计

节点1：

出块速度受到微小影响，但是总体没有什么很大的变化。

![xczxcpng](https://images.gitee.com/uploads/images/2021/0712/171322_e3d79e41_4788263.png)

### 出块效果

实际上，测试时曾到达过节点交易队列的上限，节点日志如下：

可以看到有大量交易无法进入队列

![channelBurstpng](https://images.gitee.com/uploads/images/2021/0712/171416_96897f9e_4788263.png)

可以看到大部分块都可以包含3000-4000以上交易数，最大的块可以包含4500笔交易。以6秒出块速度计算，TPS大约为750，我们REQUESTER请求机的发送速率为1450TPS，所以可以看出，区块链的实际处理速度大约为请求机发送速率的一半，并且，速率的瓶颈不在于节点CPU和内存（都远低于8C 16G配置占用的最大值）。

![ckpng](https://images.gitee.com/uploads/images/2021/0712/171652_88fb4e28_4788263.png)

## 第二个测试方案

刚才的测试只是用REQUESTER去请求NODE1，这次我们将1000个账户分为500各两份，分别用500个账户同时去请求NODE1和NODE2.

```
nohup node . --args accounts=./data/0.json shardSize=100 network=ws://172.27.83.236:9946 >> 0.out & 
nohup node . --args accounts=./data/1.json shardSize=100 network=ws://172.27.83.234:9947 >> 1.out &
```

可以看到，即便是独立启动两个主进程分别对两个节点发起请求，REQUESTER的最大请求的速率依然是1400TPS左右。

![thenpng](https://images.gitee.com/uploads/images/2021/0712/174635_f14b7d95_4788263.png)

这次似乎没有出现交易队列已满的情况

出块情况：
![vvvffggpng](https://images.gitee.com/uploads/images/2021/0712/174809_a2451760_4788263.png)

大部分块可以包含4000笔以上的交易。

### 节点状况

#### 节点1：

这次与上次不同，节点1的CPU占用降低了10%-15%。

![nnn1png](https://images.gitee.com/uploads/images/2021/0712/174916_b6a486de_4788263.png)

#### 节点2：

由于节点2率先被REQUESTER请求约15s，CPU占用集中到了节点2上。

可以看到，CPU占用峰值约为30%，看起来就像是与节点1形成了一种互补。

![nnnn2png](https://images.gitee.com/uploads/images/2021/0712/175018_9e828aba_4788263.png)

#### 节点3：

节点3表现没有什么变化，毕竟只负责进行同步。

![节点3png](https://images.gitee.com/uploads/images/2021/0712/175307_e5a25bf2_4788263.png)

## 总结

- 双验证节点，8C 16G服务器上的区块链处理性能约为750TPS（节点CPU占用为20-30%）；

- 而压测服务器最大请求速率为1450TPS左右（压测机CPU已达到95%以上）。

- 单块最大可包含4500笔交易。

- 节点和压测机内存占用均为2-3G。

- 与CPU和内存相比，节点更需要的是网络IO、磁盘性能。

- 可尝试使用多台压测机进行压测，进一步压榨测试区块链网络的速度。但是区块链网络的处理量可能不会被压榨出更多，因为本次测试出现过队列已满的情况。
