
import { ValidComparisonSign, n } from "../sql-ast"
import { isSqlNode, SqlNode } from "../sql-ast/node-types"
import { TableFieldNames } from "../type-utils"
import { GraphBuildContext } from "./context"

export type LogicalOperator = 'and' | 'or'

export interface WhereBuilderChain<Fields> {
    and: WhereBuilder<Fields>,
    or: WhereBuilder<Fields>
}

export type WhereBuilderResultNode = n.Compare | n.And | n.Or | n.Group | undefined

export type WhereBuilder<Fields, N extends TableFieldNames<Fields> = TableFieldNames<Fields>> = {
    (name: N, comparison: ValidComparisonSign, value: Fields[N]): WhereBuilderChain<Fields>,
    (handler: (b: WhereBuilder<Fields>) => void): WhereBuilderChain<Fields>,
}
export type WhereBuilderResult = {
    setTableContext(ref: n.TableRef): void
    get node(): WhereBuilderResultNode
}

/**
 * Creates a where builder which allows you to construct a complex 'where statement' containing multiple AND / OR and even nested combinations
 * @param ctx 
 * @returns 
 */
export function createWhereBuilder<Fields>(ctx: GraphBuildContext) {

    const fields: n.Column[] = []

    function createBuilderGroup(groupOp: LogicalOperator): { builder: WhereBuilder<Fields>, result: WhereBuilderResult } {
        let resultNode: WhereBuilderResultNode = undefined

        const chain: WhereBuilderChain<Fields> = {
            and: createOperatorMethod('and'),
            or: createOperatorMethod('or')
        }

        function createNodeForValue(value: unknown): SqlNode {
            if (isSqlNode(value)) {
                return value
            }
            return ctx.createPlaceholderForValue(value)
        }

        function createOperatorMethod(operator: LogicalOperator): WhereBuilder<Fields> {
            return function (nameOrBuilderHandler, comparison?: ValidComparisonSign, value?): WhereBuilderChain<Fields> {
                if (typeof nameOrBuilderHandler === 'string') { // name, comparison, value
                    addOperator(operator, nameOrBuilderHandler, comparison!, value)
                } else if(typeof nameOrBuilderHandler === 'function') { // subbuilder
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

        function addGroup(op: LogicalOperator, builderHandler: (b: WhereBuilder<Fields>) => void) {
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
            builder: chain[groupOp],
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