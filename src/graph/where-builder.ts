
import { ValidComparisonSign, nodeTypes, n } from "../sql-ast"
import { isSqlNode, SqlNode } from "../sql-ast/node-types"
import { and, or } from "../sql-ast/nodes"
import { GraphBuildContext } from "./context"

export type LogicalOpType = 'and' | 'or'

export interface WhereBuilderChain {
    and(f: (b: WhereBuilder) => void): WhereBuilderChain,
    and(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
    or(f: (b: WhereBuilder) => void): WhereBuilderChain,
    or(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
}

export type WhereBuilder = (nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) => WhereBuilderChain
export type WhereBuilderResult = { get node(): nodeTypes.SqlNode | null }

type Output = { builder: WhereBuilder, result: WhereBuilderResult };

/**
 * Creates a where builder which allows you to construct a complex 'where statement' containing multiple AND / OR and even nested combinations
 * @param ctx 
 * @returns 
 */
export function createWhereBuilder(ctx: GraphBuildContext): Output {
    function createBuilderGroup(groupOp: LogicalOpType): Output {
        let resultNode: nodeTypes.Compare | nodeTypes.And | nodeTypes.Or | nodeTypes.Group | null = null

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

                valueNode = n.inList(...value.map(createNodeForValue))
            } else {
                valueNode = createNodeForValue(value)
            }

            const node = n.compare(n.field(name), comparison, valueNode)
            if (!resultNode) {
                resultNode = node
            } else {
                resultNode = op === 'and' ? and(resultNode, node) : or(resultNode, node)
            }
        }

        function addGroup(op: LogicalOpType, builderHandler: (b: WhereBuilder) => void) {
            const { builder, result } = createBuilderGroup(op)
            builderHandler(builder)
            if (result.node) {
                if (!resultNode) {
                    resultNode = n.group(result.node)
                } else {
                    resultNode = op === 'and' ? and(resultNode, n.group(result.node)) : or(resultNode, n.group(result.node))
                }
            }
        }

        return {
            builder(nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) {
                return (chain[groupOp] as WhereBuilder)(nameOrBuilderHandler, comparison, value)
            },
            result: {
                get node() {
                    let n: SqlNode = resultNode
                    if (n.type === 'group') {
                        n = n.unwrap()
                    }
                    return n
                },
            }
        }
    };

    return createBuilderGroup('and')
}