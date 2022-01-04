import { Formatter, createFormatter } from "./formatting"

export type NodeToSqlContext = {
    table?: string,
    formatter: Formatter,
}

export function createNodeToSqlContext(formatter = createFormatter()) {
    return {
        table: undefined,
        formatter
    }
}