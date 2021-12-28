import { nodeTypes, n } from "../sql-ast";

export type GraphBuildContext = {
    createPlaceholderForValue(value: any): nodeTypes.Identifier
    get values(): readonly any[]
}

export function createGraphBuildContext(): GraphBuildContext {
    let placeholderValues: any[] = [];

    return {
        createPlaceholderForValue(value: any): nodeTypes.Identifier {
            placeholderValues.push(value)
            return n.identifier(`$${(placeholderValues.length)}`)
        },
        get values() {
            return placeholderValues
        }
    }
}

export type GraphToSqlContext = {
    table?: string,
    tableAlias?: string,
    sub(): GraphToSqlContext,
    genTableAlias(): string,
}

export function createGraphToSqlContext(): GraphToSqlContext {
    const aliasCreator = tableAliasCreator()

    const proto: GraphToSqlContext = {
        genTableAlias() {
            return aliasCreator.next()
        },
        sub() {
            const subContext: GraphToSqlContext = Object.create(proto)
            subContext.table = null
            subContext.tableAlias = null
            return subContext
        }
    }

    return proto.sub()
}

function tableAliasCreator() {
    let alias = 'a'.charCodeAt(0)
    return {
        next() {
            return String.fromCharCode(alias++)
        }
    }
}