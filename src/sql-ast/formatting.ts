export type Formatter = ReturnType<typeof createFormatter>

export function createFormatter() {
    const lines = []
    return {
        writeLine(line: string) {
            lines.push(line)
        },
        format() {
            return lines.join('')
        }
    }
}