
import { ValidComparisonSign, nodeTypes, n } from "../sql-ast"
import { GraphBuildContext, GraphToSqlContext } from "./context"

export type LogicalOpType = 'and' | 'or'

export interface WhereBuilderChain {
    and(f: (b: WhereBuilder) => void): WhereBuilderChain,
    and(name: string, comparison: ValidComparisonSign, value: string): WhereBuilderChain,
    or(f: (b: WhereBuilder) => void): WhereBuilderChain,
    or(name: string, comparison: ValidComparisonSign, value: string): WhereBuilderChain,
}

export type WhereBuilder = (name: string, comparison: ValidComparisonSign, value: string) => WhereBuilderChain
export type WhereBuilderResult = { apply(ctx: GraphToSqlContext), get node(): nodeTypes.SqlNode }

type Output = { builder: WhereBuilder, result: WhereBuilderResult };

export function createWhereBuilder(ctx: GraphBuildContext): Output {
    const fields: nodeTypes.TableFieldRef[] = []

    function createBuilderGroup(groupOp: LogicalOpType): Output {
        let resultNode: nodeTypes.Compare | nodeTypes.And | nodeTypes.Or | null = null

        const chain: WhereBuilderChain = {
            and(nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: string): WhereBuilderChain {
                if (typeof nameOrBuilderHandler === 'string') {
                    addOp('and', nameOrBuilderHandler, comparison, value)
                } else {
                    addGroup('and', nameOrBuilderHandler)
                }
                return chain
            },
            or(nameOrBuilderHandler: ((b: WhereBuilder) => void) | string, comparison?: ValidComparisonSign, value?: string): WhereBuilderChain {
                if (typeof nameOrBuilderHandler === 'string') {
                    addOp('or', nameOrBuilderHandler, comparison, value)
                } else {
                    addGroup('or', nameOrBuilderHandler)
                }
                return chain
            }
        }

        function addOp(op: LogicalOpType, name: string, comparison: ValidComparisonSign, value: string) {
            const field = n.tableField('', name)
            fields.push(field)

            const node = n.compare(field, comparison, ctx.createPlaceholderForValue(value))
            if (!resultNode) {
                resultNode = node
            } else {
                resultNode = resultNode[op](node)
            }
        }

        function addGroup(op: LogicalOpType, builderHandler: (b: WhereBuilder) => void) {
            const { builder, result } = createBuilderGroup(op)
            builderHandler(builder)
            resultNode = resultNode.and(n.group(result.node))
        }

        return {
            builder: (name: string, comparison: ValidComparisonSign, value: string) => {
                chain[groupOp](name, comparison, value)
                return chain
            },
            result: {
                get node() {
                    return resultNode
                },
                apply(ctx: GraphToSqlContext) {
                    fields.forEach(field => {
                        field.table = ctx.tableAlias
                    })
                }
            }
        }
    };

    return createBuilderGroup('and')
}