export type Formatter = ReturnType<typeof createFormatter>

export function createFormatter() {
    const lines = []
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
        join<T>(items: T[], fn: (item: T, index: number) => void, sep: string) {
            items.forEach((item, index) => {
                if (index > 0) {
                    if (sep === undefined) {
                        this.break()
                    } else {
                        this.write(sep)
                    }
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