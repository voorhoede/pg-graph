import { n } from "../sql-ast";
import { pgTypeForJsValue } from "../utils";

export type GraphBuildContext = {
    createPlaceholderForValue(value: any, explicitType?: string): n.Cast | n.Placeholder
    get values(): readonly any[]
}

export function createGraphBuildContext(): GraphBuildContext {
    let placeholderValues: any[] = [];

    return {
        createPlaceholderForValue(value, explicitType): n.Cast | n.Placeholder {
            let i = placeholderValues.indexOf(value)
            if (i > -1) {
                i += 1
            } else {
                placeholderValues.push(value)
                i = placeholderValues.length
            }

            const type = explicitType ?? pgTypeForJsValue(value)

            return type ? new n.Cast(new n.Placeholder(i), type) : new n.Placeholder(i)
        },
        get values() {
            return placeholderValues
        }
    }
}

export type GraphToSqlContext = {
    table?: n.TableRefWithAlias,
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
