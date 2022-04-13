export function timeFormat(time: bigint): string
export class Duration {
    start: bigint
    end: bigint
    duration: bigint
    isElapsed: boolean

    get durationSecond(): number

    restart(): void
    elapsed(): Duration
    digit(): bigint
    format(): string 
}
