export type Formatter = ReturnType<typeof createFormatter>

export function createFormatter() {
    const lines: string[] = []
    let identation = 0
    let lineIndex = 0

    const identStr = () => ' '.repeat(identation * 4)

    return {
        write(text: string) {
            if (lines[lineIndex] === undefined) {
                lines[lineIndex] = identStr()
            }
            lines[lineIndex] += text
            return this
        },
        writeLine(line: string) {
            let i = lineIndex
            if (lines[lineIndex] !== undefined) {
                i = ++lineIndex
            }
            lines[i] = identStr() + line
            return this
        },
        break() {
            if (lines[lineIndex] !== undefined) {
                lineIndex++
            }
            return this
        },
        join<T>(items: Iterable<T>, fn: (item: T, index: number) => void, sep: string) {
            let index = 0
            for (let item of items) {
                if (index > 0) {
                    this.write(sep)
                }
                fn(item, index)
                index++
            }
            return this
        },
        joinLines<T>(items: T[], fn: (item: T, index: number) => void) {
            items.forEach((item, index) => {
                if (index > 0) {
                    this.break()
                }
                fn(item, index)
            })
            return this
        },
        startIndent() {
            identation++
            return this
        },
        endIndent() {
            identation--
            return this
        },
        toString() {
            return lines.join('\n')
        }
    }
}