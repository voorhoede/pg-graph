import { GraphBuildContext } from "../graph/context";
import { n, json } from "../sql-ast";
import { BuiltinGroups } from "../sql-ast/json-utils";

export type AggBuilder = {
    count(): void,
    sum(column: string): void,
    avg(column: string): void,
};


export type AggBuilderResult = {
    setTableContext(name: string): void
    addToStatement(statement: n.SelectStatement): void
}

type Output = { builder: AggBuilder, result: AggBuilderResult };

type AggItem = (statement: n.SelectStatement) => void;

export function createAggBuilder(_ctx: GraphBuildContext): Output {
    const aggs: Array<AggItem> = [];
    let tableContext: string

    return {
        builder: {
            count() {
                aggs.push((statement) => {
                    json.addField(statement, BuiltinGroups.Agg, 'count', new n.AggCall('count', [new n.Field('id', tableContext)]))
                })
            },
            sum(column: string) {
                aggs.push((statement) => {
                    json.addField(statement, BuiltinGroups.Agg, 'sum', new n.AggCall('sum', [new n.Field(column, tableContext)]))
                })
            },
            avg(column: string) {
                aggs.push((statement) => {
                    json.addField(statement, BuiltinGroups.Agg, 'avg', new n.AggCall('avg', [new n.Field(column, tableContext)]))
                })
            }
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