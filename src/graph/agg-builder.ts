import { GraphBuildContext } from "../graph/context";
import { n, json, SqlNode } from "../sql-ast";
import { BuiltinGroups } from "../sql-ast/json-utils";
import { TableFieldNames } from "../type-utils";
import { createWhereBuilder, WhereBuilder } from "./where-builder";

export type AggBuilder<Fields> = {
    count(options?: AggOptionsWithOptionalColumn<Fields>): AggBuilder<Fields>,
    sum(options: AggOptions<Fields>): AggBuilder<Fields>,
    avg(options: AggOptions<Fields>): AggBuilder<Fields>,
    min(options: AggOptions<Fields>): AggBuilder<Fields>,
    max(options: AggOptions<Fields>): AggBuilder<Fields>,
};

export type AggBuilderResult = {
    setTableContext(table: n.TableRef): void
    addToStatement(statement: n.SelectStatement): void
}

export type AggOptions<Fields> = {
    column: TableFieldNames<Fields>,
    alias?: string,
    distinct?: boolean,
    filter?: (builder: WhereBuilder<Fields>) => void,
}

export type AggOptionsWithOptionalColumn<Fields> = Partial<AggOptions<Fields>> & Omit<AggOptions<Fields>, 'column'>

export function createAggBuilder<Fields>(ctx: GraphBuildContext): { builder: AggBuilder<Fields>, result: AggBuilderResult } {
    const aggs: Array<(statement: n.SelectStatement) => void> = [];
    let tableContext: n.TableRef

    type AvgCallFieldOptions = {
        statement: n.SelectStatement,
        funcName: string,
        arg: SqlNode,
        alias?: string,
        distinct?: boolean,
        filter?: (builder: WhereBuilder<Fields>) => void
    }

    function addAggCallField({ statement, funcName, arg, alias, distinct, filter }: AvgCallFieldOptions) {
        const { builder, result } = createWhereBuilder<Fields>(ctx)

        if (filter) {
            builder(filter)
            result.setTableContext(tableContext)
        }

        json.addField(
            statement,
            BuiltinGroups.Agg,
            alias ?? funcName,
            new n.AggCall(funcName, [arg], {
                filter: result.node,
                distinct,
            })
        )
    }

    function createSimpleAggMethod(name: string) {
        return function (this: AggBuilder<Fields>, options: AggOptions<Fields>) {
            aggs.push((statement) => {
                addAggCallField({
                    statement,
                    funcName: name,
                    arg: tableContext.column(options.column),
                    alias: options.alias,
                    filter: options.filter,
                    distinct: options.distinct,
                })
            })
            return this
        }
    }

    return {
        builder: {
            count(options: AggOptionsWithOptionalColumn<Fields> = {}) {
                aggs.push((statement) => {
                    addAggCallField({
                        statement,
                        funcName: 'count',
                        arg: options.column ? tableContext.column(options.column) : tableContext.allColumns(),
                        alias: options.alias,
                        distinct: options.distinct,
                    })
                })
                return this
            },
            sum: createSimpleAggMethod('sum'),
            avg: createSimpleAggMethod('avg'),
            min: createSimpleAggMethod('min'),
            max: createSimpleAggMethod('max'),
        },
        result: {
            addToStatement(statement) {
                aggs.forEach(agg => {
                    agg(statement)
                })
            },
            setTableContext(ref) {
                tableContext = ref
            }
        }
    }
}