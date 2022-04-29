import { createGraphBuildContext, createGraphToSqlContext } from "./context";
import { JoinType, json, n } from "../sql-ast";
import { toSqlKey } from "./types";
import { createFormatter } from "../sql-ast/formatting";
import { createNodeToSqlContext } from "../sql-ast/context";
import { TabularSource, TabularSourceBuilder } from './tabular-source/types'
import { createRootTabularSource } from './tabular-source/root-tabular-source'
import type { DefaultTable, TableLike, TableName, TableSelectionFromName } from '../type-utils'

export type GraphQueryToSqlOptions = {
    prettifyJson?: boolean
}

export function graphQuery<AT extends TableLike = DefaultTable>() {
    const sources: TabularSource<any>[] = [];
    const graphBuildContext = createGraphBuildContext()

    return {
        source<SourceName extends TableName<AT>>(name: SourceName, builder: TabularSourceBuilder<TableSelectionFromName<AT, SourceName>>) {
            const item = createRootTabularSource({
                buildContext: graphBuildContext,
                name,
                builder
            });
            sources.push(item)
            return item;
        },
        toSql(options?: GraphQueryToSqlOptions): string {
            const statement = new n.SelectStatement()
            const graphToSqlCtx = createGraphToSqlContext()

            sources.forEach(source => {
                source[toSqlKey](statement, graphToSqlCtx)
            })

            // this hacky thing is needed because we want to make sure that we always have at least one row (even with nulls).
            // Otherwise no response is returned from the db
            statement.joins.push(
                new n.Join(JoinType.RIGHT_JOIN,
                    new n.DerivedTable(
                        new n.Values([
                            [new n.RawValue(1)]
                        ])
                        , '_'
                    ),
                    n.Identifier.true
                )
            )

            if (statement.fields.size === 0) {
                json.convertToEmptyDataStatement(statement)
            } else {
                if (options?.prettifyJson) {
                    const data = statement.fields.get('data')!
                    statement.fields.set('data', new n.FuncCall('jsonb_pretty', data))
                }
            }

            const formatter = createFormatter()

            statement.toSql(createNodeToSqlContext(formatter))

            return formatter.toString()
        },
        values(): readonly any[] {
            return graphBuildContext.values
        }
    }
}