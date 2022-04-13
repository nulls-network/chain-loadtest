export function tryParse(param) {
    try {
        return eval(param)
    } catch (_) {
        return param
    }
}

export function parseArgs(args) {
    const [reg, arg, obj] = [/(.*)=(.*)/, [], {}]
    args.forEach((i) => {
        const reged = reg.exec(i)
        reged ? obj[reged[1]] = tryParse(reged[2]) : arg.push(tryParse(i))
    })
    return { arg, obj }
}
