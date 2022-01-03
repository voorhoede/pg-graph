
import { ValidComparisonSign, nodeTypes, n } from "../sql-ast"
import { isSqlNode, SqlNode } from "../sql-ast/node-types"
import { GraphBuildContext } from "./context"

export type LogicalOpType = 'and' | 'or'

export interface WhereBuilderChain {
    and(f: (b: WhereBuilder) => void): WhereBuilderChain,
    and(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
    or(f: (b: WhereBuilder) => void): WhereBuilderChain,
    or(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
}

export type WhereBuilder = (name: string, comparison: ValidComparisonSign, value: unknown) => WhereBuilderChain
export type WhereBuilderResult = { get node(): nodeTypes.SqlNode }

type Output = { builder: WhereBuilder, result: WhereBuilderResult };

/**
 * Creates a where builder which allows you to construct a complex 'where statement' containing multiple AND / OR and even nested combinations
 * @param ctx 
 * @returns 
 */
export function createWhereBuilder(ctx: GraphBuildContext): Output {
    function createBuilderGroup(groupOp: LogicalOpType): Output {
        let resultNode: nodeTypes.Compare | nodeTypes.And | nodeTypes.Or | null = null

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
                resultNode = resultNode[op](node)
            }
        }

        function addGroup(op: LogicalOpType, builderHandler: (b: WhereBuilder) => void) {
            const { builder, result } = createBuilderGroup(op)
            builderHandler(builder)
            resultNode = resultNode.and(n.group(result.node)) // TODO this is incorrect
        }

        return {
            builder: (name: string, comparison: ValidComparisonSign, value: unknown) => {
                chain[groupOp](name, comparison, value)
                return chain
            },
            result: {
                get node() {
                    return resultNode ?? n.identifier.true
                },
            }
        }
    };

    return createBuilderGroup('and')
}