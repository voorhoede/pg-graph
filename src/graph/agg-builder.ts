import { GraphBuildContext } from "../graph/context";
import { n, json, SqlNode } from "../sql-ast";
import { BuiltinGroups } from "../sql-ast/json-utils";
import { createWhereBuilder, WhereBuilder } from "./where-builder";

export type AggBuilder = {
    count(options?: AggOptionsWithOptionalColumn): AggBuilder,
    sum(options: AggOptions): AggBuilder,
    avg(options: AggOptions): AggBuilder,
    min(options: AggOptions): AggBuilder,
    max(options: AggOptions): AggBuilder,
};

export type AggBuilderResult = {
    setTableContext(name: string): void
    addToStatement(statement: n.SelectStatement): void
}

export type AggOptions = {
    column: string,
    alias?: string,
    distinct?: boolean,
    filter?: (builderHandler: WhereBuilder) => void,
}

export type AggOptionsWithOptionalColumn = Partial<AggOptions> & Omit<AggOptions, 'column'>

export function createAggBuilder(ctx: GraphBuildContext): { builder: AggBuilder, result: AggBuilderResult } {
    const aggs: Array<(statement: n.SelectStatement) => void> = [];
    let tableContext: string

    type AvgCallFieldOptions = {
        statement: n.SelectStatement,
        funcName: string,
        arg: SqlNode,
        alias?: string,
        distinct?: boolean,
        filter?: (builderHandler: WhereBuilder) => void
    }

    function addAggCallField({ statement, funcName, arg, alias, distinct, filter }: AvgCallFieldOptions) {
        const { builder, result } = createWhereBuilder(ctx)

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
        return function (this: AggBuilder, options: AggOptions) {
            aggs.push((statement) => {
                addAggCallField({
                    statement,
                    funcName: name,
                    arg: new n.Column(options.column, tableContext),
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
            count(options: AggOptionsWithOptionalColumn = {}) {
                aggs.push((statement) => {
                    addAggCallField({
                        statement,
                        funcName: 'count',
                        arg: options.column ? new n.Column(options.column, tableContext) : new n.All(tableContext),
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
            addToStatement(statement: n.SelectStatement) {
                aggs.forEach(agg => {
                    agg(statement)
                })
            },
            setTableContext(name: string) {
                tableContext = name
            }
        }
    }
}