import chalk from 'chalk'
import { parseArgs } from './utils/cli.js'
import { Duration } from './utils/time.js'
import { types } from './constants.js'
import { sleep } from './utils/common.js'

import { Keyring } from '@polkadot/keyring'
import { ApiPromise, WsProvider } from '@polkadot/api'
import { BN } from '@polkadot/util'


const { arg, obj } = parseArgs(process.argv.slice(2))
const WORKER_ID = obj.id
const NETWORK = obj.network
const HEAD = `Worker (${WORKER_ID})`

const KEYRING = new Keyring({ type: 'sr25519' })
const PROVIDER = new WsProvider(NETWORK)
const API = await ApiPromise.create({ types, provider: PROVIDER })

class Account {
    pair
    info = { nonce: -1 }
    txRecord = {}
    // -----
    name
    mnemonic
    address
    constructor(key) {
        this.name = key.name
        this.mnemonic = key.mnemonic
        this.address = key.address
        // -----
        this.pair = KEYRING.addFromMnemonic(this.mnemonic)
        this.txRecord = { inBlock: 0, finalized: 0, err: 0 }
    }

    async updateInfo() {
        const nonce = await API.rpc.system.accountNextIndex(this.pair.address)
        this.info = { nonce: new BN(nonce.toString()) }
        /* const { nonce, data } = await API.query.system.account(this.pair.address)
        this.info = { nonce: new BN(nonce.toString()), balance: new BN(data.free.toString()) } */
    }

    async transfer(target, value) {
        try {
            const nonce = this.info && this.info.nonce
            await API.tx.balances
                .transferKeepAlive(target.address, value || 1)
                .signAndSend(this.pair, { nonce })
            if (nonce.constructor === BN) {
                this.info.nonce = nonce.add(new BN(1))
            } else if (this.info.nonce !== -1) {
                this.info.nonce++
            }
        } catch (err) {
            console.error(chalk.red(`**${HEAD} Transfer error: `)/* , err */)
        }
    }
}

class TxPair {
    account1
    account2
    immediates = []
    running = false
    transferCount = 0
    constructor(account1, account2) {
        this.account1 = account1
        this.account2 = account2
    }

    get accounts() {
        return [this.account1, this.account2]
    }

    async init() {
        for (const account of this.accounts) {
            await account.updateInfo()
        }
    }

    startTask() {
        const createTask = (transferer, target) => {
            const immediate = setImmediate(async () => {
                while (this.running) {
                    this.transferCount++
                    await transferer.transfer(target)
                    await sleep(1)
                }
                clearImmediate(immediate)
            })
            this.immediates.push(immediate)
        }
        if (this.running) {
            console.error(chalk.red(`${HEAD} Could not start TxPair task beacuse already started.`))
            return
        }
        this.running = true
        createTask(this.account1, this.account2)
        createTask(this.account2, this.account1)
    }

    stopTask() {
        console.log(`${HEAD} TxPair task stopped.`)
        this.running = false
    }
}

class Worker {
    __create
    __start
    txCount = 0
    // -----
    id
    currentStatus
    statusInterval
    shardSize
    keys = []
    idleTxPairs = []
    runningTxPairs = []
    // -----
    running = false
    generating = false
    spawning = false
    // -----
    txPairsGenerate
    spawner
    constructor() {
        this.id = obj.id
        this.shardSize = obj.shardSize
    }

    async main() {
        this.__create = new Duration()
        const currentStatus = (status) => {
            console.log(chalk.greenBright(`${HEAD} ${status}...`))
            this.currentStatus = status
        }
        while (true) {
            currentStatus('WaitingForInit')
            await this.waitingForInit()
            currentStatus('WaitingForStart')
            await this.waitingForStart()
            currentStatus('WaitingForStop')
            await this.waitingForStop()
            currentStatus('***STOPPED***')
        }
    }

    async startAll() {
        if (!this.running) {
            this.running = true
            this.__start = new Duration()
            this.txPairsGenerate = setImmediate(() => {
                this.generateTxPairs()
            })
            this.spawner = setImmediate(() => {
                this.spawnLoop()
            })
        }
    }

    async spawnLoop() {
        if (!this.spawning) {
            this.spawning = true
            console.log(chalk.yellowBright(`${HEAD} SPAWNING TASKS...`))
            let count = 0
            let noMore = 0
            while (this.spawning && this.running) {
                if (noMore > 8) {
                    break
                }
                const txPair = this.idleTxPairs.pop()
                if (txPair) {
                    txPair.startTask()
                    this.runningTxPairs.push(txPair)
                    count++
                    await sleep(1)
                } else {
                    if (!this.generating) {
                        noMore++
                    }
                    await sleep(1500)
                }
            }
            console.log(`${HEAD} Started ${count} TxPair tasks.`)
            this.spawning = false
        }
    }

    async generateTxPairs() {
        if (!this.generating) {
            this.generating = true
            console.log(chalk.yellowBright(`${HEAD} GENERATING TxPairs...`))
            let count = 0
            const start = new Duration()
            let noMore = 0
            while (this.generating && this.running) {
                if (noMore > 8) {
                    break
                }
                const [k1, k2] = [this.keys.pop(), this.keys.pop()]
                if (k1 && k2) {
                    const txPair = new TxPair(new Account(k1), new Account(k2))
                    await txPair.init()
                    this.idleTxPairs.push(txPair)
                    count++
                    await sleep(1)
                } else {
                    noMore++
                    await sleep(1500)
                }
            }
            console.log(`${HEAD} Generated ${count} TxPairs in ${start.elapsed().format()}.`)
            this.generating = false
        }
    }

    stopAll() {
        if (this.running) {
            this.running = false
            for (const txPair of this.runningTxPairs) {
                txPair.stopTask()
            }
            console.log(`${HEAD} Stoped ${this.runningTxPairs.length} TxPair tasks.`)
        }
    }

    waitingForInit() {
        this.statusInterval = setInterval(() => {
            let txCount = 0
            for (const txPair of this.runningTxPairs) {
                txCount += txPair.transferCount
            }
            const startTime = this.__start ? this.__start.elapsed().durationSecond : 0
            const createTime = this.__create ? this.__create.elapsed().durationSecond : 0
            this.txCount = txCount
            const TPS = txCount / startTime
            process.send({
                event: 'status',
                data: {
                    id: WORKER_ID,
                    head: HEAD,
                    running: this.running,
                    generating: this.generating,
                    spawning: this.spawning,
                    txCount,
                    tps: TPS,
                    startTime,
                    createTime,
                    currentStatus: this.currentStatus,
                    txPairCount: this.runningTxPairs.length
                }
            })
        }, 1000);
        return new Promise((resolve, _reject) => {
            process.on('message', msg => {
                if (msg.event === 'distributeKeys' && msg.data) {
                    this.keys = [...this.keys, ...msg.data]
                    return resolve()
                } else if (msg.event === 'exit') {
                    this.exit(1, `${HEAD} Receipt of exit order`)
                }
            })
            // Tell the Master, we have been ready to receive messages
            process.send({ event: 'waiting' })
        })
    }

    waitingForStart() {
        return new Promise((resolve, _reject) => {
            process.on('message', msg => {
                if (msg.event === 'start') {
                    this.startAll()
                    return resolve()
                }
            })
        })
    }

    waitingForStop() {
        return new Promise((resolve, _reject) => {
            process.on('message', msg => {
                if (msg.event === 'stop') {
                    this.stopAll()
                    return resolve()
                }
            })
        })
    }

    exit(status, val) {
        const time = this.__create.elapsed()
        process.send({
            event: 'exit',
            status,
            val,
            duration: time.format(),
            durationNumber: time.duration.toString()
        })
        process.exit(status)
    }
}

// Start task
const worker = new Worker()
try {
    const val = await worker.main()
    console.log(`${HEAD} Done with: `, val)
    /* worker.exit(1, val) */

} catch (val) {
    worker.exit(0, val)

}
