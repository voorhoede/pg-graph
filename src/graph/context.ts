import { n } from "../sql-ast";

export type GraphBuildContext = {
    createPlaceholderForValue(value: any): n.Placeholder
    get values(): readonly any[]
}

export function createGraphBuildContext(): GraphBuildContext {
    let placeholderValues: any[] = [];

    return {
        createPlaceholderForValue(value: any): n.Placeholder {
            let i = placeholderValues.indexOf(value)
            if (i > -1) {
                i += 1
            } else {
                placeholderValues.push(value)
                i = placeholderValues.length
            }

            return new n.Placeholder(i, jsTypeToPgType(value))
        },
        get values() {
            return placeholderValues
        }
    }
}

export type GraphToSqlContext = {
    table?: string,
    tableAlias?: string,
    subRelationCount?: number,
    depth: number,
    createSubContext(): GraphToSqlContext,
    genTableAlias(prefix?: string): string,
}

export function createGraphToSqlContext(): GraphToSqlContext {
    const aliasCreator = tableAliasCreator()

    const proto: GraphToSqlContext = {
        depth: 0,
        genTableAlias(prefix?: string) {
            return (prefix ? prefix + '_' : '') + aliasCreator.next()
        },
        createSubContext() {
            const subContext: GraphToSqlContext = Object.create(proto)
            subContext.depth = this.depth + 1
            return subContext
        }
    }

    return proto.createSubContext()
}

function tableAliasCreator() {
    let alias = 'a'.charCodeAt(0)
    return {
        next() {
            return String.fromCharCode(alias++)
        }
    }
}

function jsTypeToPgType(value: any) {
    switch (typeof value) {
        case 'string':
            return 'text'
        case 'number':
            return 'int'
    }
}