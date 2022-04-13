import { fork } from 'child_process'
import { Duration } from './utils/time.js'
import fs from 'fs'
import chalk from 'chalk'
import Table from 'cli-table'
import logUpdate from 'log-update'


const WORKER = './src/worker.js'
const ACCOUNTS = './data/test.json'
const SHARD_SIZE = 10000
const LOG_ON_WORKER_EXIT = false
const NETWORK = 'ws://127.0.0.1:9944'

const DEBUG = false

const debug = (...args) => {
    if (DEBUG) {
        console.log(...args)
    }
}

class Master {
    __start
    // Default
    arg = []
    obj = {}
    // -----
    keys = []
    workers = []
    totalTxCount = 0
    // -----
    subscribeInterval
    constructor(arg, obj) {
        this.arg = arg
        this.obj = obj
        // -----
        this.accountFile = this.obj.accounts || ACCOUNTS
        this.shardSize = this.obj.shardSize || SHARD_SIZE
        this.network = this.obj.network || NETWORK
        this.slice = this.obj.slice
    }

    async main() {
        this.loadKeys()
        await this.createWorkers()
        await this.distributeKeys()
        await this.startAll()
        this.subscribeStatus()
    }

    get validWorkers() {
        return this.workers.filter(wk => !wk.exit)
    }

    async startAll() {
        const workers = this.validWorkers
        console.log(`Starting ${workers.length} workers...`)
        let start = new Duration()
        this.__start = start
        let errCount = 0
        let promises = workers.map(worker => {
            if (!worker.exit) {
                return new Promise((resolve, reject) => {
                    worker.process.send({ event: 'start' }, err => {
                        if (err) {
                            console.error(chalk.red(`**Send message to process error:`), err)
                            errCount++
                            return reject()
                        }
                        return resolve()
                    })
                })
            }
        })
        await Promise.allSettled(promises)
        console.log(`Done in ${start.elapsed().format()}. Started ${workers.length - errCount} workers tasks, failed: ${errCount}.`)

    }

    subscribeStatus() {
        this.subscribeInterval = setInterval(() => {
            const WORKERS = this.validWorkers
            let txTotal = 0
            let tpsTotal = 0
            let txPairTotal = 0
            const workerTable = new Table({ head: ['/', 'TX', 'TPS', 'TX PAIRS'].map(i => chalk.greenBright(i)) })
            for (const worker of WORKERS) {
                const status = worker.status
                if (status) {
                    txTotal += status.txCount
                    txPairTotal += status.txPairCount
                    tpsTotal += status.tps
                    workerTable.push({
                        [`Worker ${worker.id}`]: [(status.txCount || 0).toFixed(2), (status.tps || 0).toFixed(2), (status.txPairCount || 0).toFixed(2)]
                    })
                } else {
                    workerTable.push({
                        [`Worker ${worker.id}`]: [0, 0, 0]
                    })
                }
            }
            const totalTable = new Table()
            totalTable.push(
                { 'DURATION': this.__start.elapsed().format() },
                { 'TOTAL WORKERS': WORKERS.length },
                { 'TOTAL TX': txTotal },
                { 'TOTAL TPS': tpsTotal.toFixed(2) },
                { 'TOTAL TX PAIRS': txPairTotal },
                { 'AVG TX': (txTotal / WORKERS.length).toFixed(2) },
                { 'AVG TPS': (tpsTotal / WORKERS.length).toFixed(2) },
                { 'AVG TX PAIRS': (txPairTotal / WORKERS.length).toFixed(2) }
            )
            logUpdate(chalk.yellowBright(`\r${workerTable.toString()}\n${totalTable.toString()}`))
        }, 1000);
    }

    async distributeKeys() {
        if (!this.keys) {
            console.error(`Could not distribute empty keys to workers.`)
            return
        }
        const keys = this.keys.length
        const workers = this.validWorkers
        console.log(`Distributing ${keys} keys to ${workers.length} workers...`)

        let start = new Duration()
        let errCount = 0
        let promises = workers.map(worker => {
            if (!worker.exit) {
                return new Promise((resolve, reject) => {
                    worker.process.send({ event: 'distributeKeys', data: this.keys.splice(0, this.shardSize) }, err => {
                        if (err) {
                            console.error(chalk.red(`**Send message to process error:`), err)
                            errCount++
                            return reject()
                        }
                        return resolve()
                    })
                })
            }
        })
        await Promise.allSettled(promises)
        console.log(`Done in ${start.elapsed().format()}. Distributed ${keys} keys to ${workers.length - errCount} workers, failed: ${errCount}.`)
    }

    async createWorkers() {
        const workerCount = Math.round(this.keys.length / this.shardSize) || 1
        if (!workerCount) {
            console.error(chalk.red(`Could not create ${workerCount} workers.`))
            return
        }
        console.log(chalk.greenBright(`Total keys: ${this.keys.length}, Shard size: ${this.shardSize}. Worker count: ${workerCount}\nCreating workers...`))
        let start = new Duration()
        for (let i = 0; i < workerCount; i++) {
            this.workers.push(await this.createWorker(i, [`id=${i}`, `shardSize=${this.shardSize}`, `network=${this.network}`]))
        }
        console.log(`Done in ${start.elapsed().format()}. Created ${this.workers.length} workers.`)
    }

    loadKeys() {
        console.log(`Loading keyring data from "${this.accountFile}"...`)
        let start = new Duration()
        const keys = JSON.parse(fs.readFileSync(this.accountFile).toString())
        this.keys = this.slice ? keys.slice(...this.slice) : keys
        console.log(`Done in ${start.elapsed().format()}. Loaded ${this.keys.length} keys.`)
    }

    createWorker(id, params) {
        return new Promise(resolve => {
            const child = fork(WORKER, params)
            const worker = {
                id,
                ready: false,
                exit: false,
                createTime: new Duration(),
                process: child,
                status: {},
                updates: 0
            }
            const head = `Child process ${id ? `#${id} ` : ''}(${child.pid})`
            child.on('message', msg => {
                if (LOG_ON_WORKER_EXIT && msg.event === 'exit') {
                    console.log(
                        `${head} has exited, \n status: `,
                        msg.status, '\n value: ',
                        msg.val, '\n Running time: ',
                        msg.duration
                    )
                } else if (msg.event === 'status' && msg.data) {
                    worker.status = Object.assign(worker.status, msg.data)
                    worker.updates++
                    debug(`Receive worker #${id} pong x${worker.updates}`, worker.status)
                } else if (msg.event === 'waiting') {
                    worker.ready = true
                    return resolve(worker)
                }
            })
            child.on('error', err => {
                console.error(chalk.red(`${head} **Runtime error: `), err)
            })
            child.on('exit', (code, signal) => {
                if (worker) {
                    worker.exit = true
                }
            })
        })
    }
}

export {
    Master
}
