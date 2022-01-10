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

type AggBuilderOutput = { builder: AggBuilder, result: AggBuilderResult };

type AggItem = (statement: n.SelectStatement) => void;

export type AggOptions = {
    alias?: string,
    column: string,
    filter?: (builderHandler: WhereBuilder) => void,
}

export type AggOptionsWithOptionalColumn = Partial<AggOptions> & Omit<AggOptions, 'column'>

export function createAggBuilder(ctx: GraphBuildContext): AggBuilderOutput {
    const aggs: Array<AggItem> = [];
    let tableContext: string

    type AvgCallFieldOptions = {
        statement: n.SelectStatement,
        funcName: string,
        arg: SqlNode,
        alias?: string,
        filter?: (builderHandler: WhereBuilder) => void
    }

    function addAvgCallField({ statement, funcName, arg, alias, filter }: AvgCallFieldOptions) {
        const { builder, result } = createWhereBuilder(ctx)

        if (filter) {
            builder(filter)
            result.setTableContext(tableContext)
        }

        json.addField(
            statement,
            BuiltinGroups.Agg,
            alias ?? funcName,
            new n.AggCall(funcName, [arg], undefined, result.node)
        )
    }

    function createSimpleAggMethod(name: string) {
        return function (this: AggBuilder, options: AggOptions) {
            aggs.push((statement) => {
                addAvgCallField({
                    statement,
                    funcName: name,
                    arg: new n.Column(options.column, tableContext),
                    alias: options.alias,
                    filter: options.filter,
                })
            })
            return this
        }
    }

    return {
        builder: {
            count(options: AggOptionsWithOptionalColumn = {}) {
                aggs.push((statement) => {
                    addAvgCallField({
                        statement,
                        funcName: 'count',
                        arg: options.column ? new n.Column(options.column, tableContext) : new n.All(tableContext),
                        alias: options.alias,
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