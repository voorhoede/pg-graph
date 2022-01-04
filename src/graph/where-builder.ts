
import { ValidComparisonSign, n } from "../sql-ast"
import { isSqlNode, SqlNode } from "../sql-ast/node-types"
import { GraphBuildContext } from "./context"

export type LogicalOpType = 'and' | 'or'

export interface WhereBuilderChain {
    and(f: (b: WhereBuilder) => void): WhereBuilderChain,
    and(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
    or(f: (b: WhereBuilder) => void): WhereBuilderChain,
    or(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
}

export type WhereBuilderResultNode = n.Compare | n.And | n.Or | n.Group | null
export type WhereBuilder = (nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) => WhereBuilderChain
export type WhereBuilderResult = {
    setTableContext(name: string): void
    get node(): WhereBuilderResultNode
}

type Output = { builder: WhereBuilder, result: WhereBuilderResult };

/**
 * Creates a where builder which allows you to construct a complex 'where statement' containing multiple AND / OR and even nested combinations
 * @param ctx 
 * @returns 
 */
export function createWhereBuilder(ctx: GraphBuildContext): Output {

    const fields: n.Field[] = []

    function createBuilderGroup(groupOp: LogicalOpType): Output {
        let resultNode: WhereBuilderResultNode = null

        const add = (op: LogicalOpType) => (nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown): WhereBuilderChain => {
            if (typeof nameOrBuilderHandler === 'string') { // name, comparison, value
                addOp(op, nameOrBuilderHandler, comparison!, value)
            } else { // subbuilder
                addGroup(op, nameOrBuilderHandler)
            }
            return chain
        }

        const chain: WhereBuilderChain = {
            and: add('and'),
            or: add('or')
        }

        function createNodeForValue(value: unknown): SqlNode {
            if (isSqlNode(value)) {
                return value
            }
            return ctx.createPlaceholderForValue(value)
        }

        function addOp(op: LogicalOpType, name: string, comparison: ValidComparisonSign, value: unknown) {
            let valueNode: SqlNode;

            if ((comparison === 'IN' || comparison === 'NOT IN')) {
                if (!Array.isArray(value)) {
                    throw new Error('Unexpected value. For IN or NOT IN operators the value should be an array')
                }

                valueNode = new n.InList(...value.map(createNodeForValue))
            } else {
                valueNode = createNodeForValue(value)
            }

            const field = new n.Field(name)
            fields.push(field)

            const node = new n.Compare(field, comparison, valueNode)
            if (!resultNode) {
                resultNode = node
            } else {
                resultNode = op === 'and' ? new n.And(resultNode, node) : new n.Or(resultNode, node)
            }
        }

        function addGroup(op: LogicalOpType, builderHandler: (b: WhereBuilder) => void) {
            const { builder, result } = createBuilderGroup(op)
            builderHandler(builder)
            if (result.node) {
                if (!resultNode) {
                    resultNode = new n.Group(result.node)
                } else {
                    resultNode = op === 'and' ? new n.And(resultNode, new n.Group(result.node)) : new n.Or(resultNode, new n.Group(result.node))
                }
            }
        }

        return {
            builder(nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) {
                return (chain[groupOp] as WhereBuilder)(nameOrBuilderHandler, comparison, value)
            },
            result: {
                setTableContext(name: string) {
                    fields.forEach(field => {
                        field.table = name
                    })
                },
                get node() {
                    let node: WhereBuilderResultNode = resultNode
                    if (node && node instanceof n.Group) {
                        node = node.unwrap() as WhereBuilderResultNode
                    }
                    return node
                },
            }
        }
    };

    return createBuilderGroup('and')
}