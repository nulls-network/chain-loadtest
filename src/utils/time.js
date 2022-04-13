export function timeFormat(time) {
    if (time > 1000000000) {
        return `${time / 1000000000n}s`
    } else if (time > 1000000) {
        return `${time / 1000000n}ms`
    } else if (time > 1000) {
        return `${time / 1000n}us`
    }
    return `${time}ns`
}


export class Duration {
    start
    end
    duration
    isElapsed

    constructor() {
        this.restart()
    }

    restart() {
        this.start = process.hrtime.bigint()
    }

    elapsed() {
        this.end = process.hrtime.bigint()
        this.duration = this.end - this.start
        this.isElapsed = true
        return this
    }

    get durationSecond() {
        return new Number(this.duration / 1000000000n)
    }

    digit() {
        return this.duration
    }

    format() {
        return timeFormat(this.duration)
    }
}
