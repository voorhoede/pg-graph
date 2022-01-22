
import { ValidComparisonSign, n } from "../sql-ast"
import { isSqlNode, SqlNode } from "../sql-ast/node-types"
import { GraphBuildContext } from "./context"

export type LogicalOperator = 'and' | 'or'

export interface WhereBuilderChain {
    and(handler: (b: WhereBuilder) => void): WhereBuilderChain,
    and(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
    or(handler: (b: WhereBuilder) => void): WhereBuilderChain,
    or(name: string, comparison: ValidComparisonSign, value: unknown): WhereBuilderChain,
}

export type WhereBuilderResultNode = n.Compare | n.And | n.Or | n.Group | undefined
export type WhereBuilder = (nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) => WhereBuilderChain
export type WhereBuilderResult = {
    setTableContext(ref: n.TableRef): void
    get node(): WhereBuilderResultNode
}

/**
 * Creates a where builder which allows you to construct a complex 'where statement' containing multiple AND / OR and even nested combinations
 * @param ctx 
 * @returns 
 */
export function createWhereBuilder(ctx: GraphBuildContext) {

    const fields: n.Column[] = []

    function createBuilderGroup(groupOp: LogicalOperator): { builder: WhereBuilder, result: WhereBuilderResult } {
        let resultNode: WhereBuilderResultNode = undefined

        const chain: WhereBuilderChain = {
            and: createOperatorMethod('and'),
            or: createOperatorMethod('or')
        }

        function createNodeForValue(value: unknown): SqlNode {
            if (isSqlNode(value)) {
                return value
            }
            return ctx.createPlaceholderForValue(value)
        }

        function createOperatorMethod(operator: LogicalOperator) {
            return function (nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown): WhereBuilderChain {
                if (typeof nameOrBuilderHandler === 'string') { // name, comparison, value
                    addOperator(operator, nameOrBuilderHandler, comparison!, value)
                } else { // subbuilder
                    addGroup(operator, nameOrBuilderHandler)
                }
                return chain
            }
        }

        function addOperator(op: LogicalOperator, name: string, comparison: ValidComparisonSign, value: unknown) {
            let valueNode: SqlNode;

            if ((comparison === 'IN' || comparison === 'NOT IN')) {
                if (!Array.isArray(value)) {
                    throw new Error('Unexpected value. For IN or NOT IN operators the value should be an array')
                }

                valueNode = new n.InList(...value.map(createNodeForValue))
            } else {
                valueNode = createNodeForValue(value)
            }

            const field = new n.Column(name)
            fields.push(field)

            const node = new n.Compare(field, comparison, valueNode)
            if (!resultNode) {
                resultNode = node
            } else {
                resultNode = op === 'and'
                    ? new n.And(resultNode, node)
                    : new n.Or(resultNode, node)
            }
        }

        function addGroup(op: LogicalOperator, builderHandler: (b: WhereBuilder) => void) {
            const { builder, result } = createBuilderGroup(op)
            builderHandler(builder)
            if (result.node) {
                if (!resultNode) {
                    resultNode = new n.Group(result.node)
                } else {
                    resultNode = op === 'and'
                        ? new n.And(resultNode, new n.Group(result.node))
                        : new n.Or(resultNode, new n.Group(result.node))
                }
            }
        }

        return {
            builder(nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: unknown) {
                return (chain[groupOp] as WhereBuilder)(nameOrBuilderHandler, comparison, value)
            },
            result: {
                setTableContext(ref) {
                    fields.forEach(field => {
                        field.table = ref.name
                    })
                },
                get node() {
                    let node: WhereBuilderResultNode = resultNode
                    if (node && node instanceof n.Group) {
                        node = node.node as WhereBuilderResultNode
                    }
                    return node
                },
            }
        }
    };

    return createBuilderGroup('and')
}