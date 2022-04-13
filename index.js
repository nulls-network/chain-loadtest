import { Master } from './src/master.js'
import { parseArgs } from './src/utils/cli.js'
import chalk from 'chalk'

const { arg, obj } = parseArgs(process.argv.slice(2))

const master = new Master(arg, obj)
try {
    const val = await master.main()
    /* console.log(chalk.yellowBright('Running success with: '), val) */
} catch (err) {
    console.log(chalk.red('**Runtime errors:'), err)
}
/* process.exit(1) */
