import { createGraphBuildContext, createGraphToSqlContext, GraphBuildContext } from "./context";
import { json, n } from "../sql-ast";
import { toSqlKey } from "./types";
import { createFormatter } from "../sql-ast/formatting";
import { createNodeToSqlContext } from "../sql-ast/context";
import { TabularSource, TabularSourceBuilder } from './tabular-source/types'
import { createRootTabularSource } from './tabular-source/root-tabular-source'

export type GraphQueryToSqlOptions = {
    prettifyJson?: boolean
}

export function graphQuery() {
    const sources: TabularSource[] = [];
    const graphBuildContext: GraphBuildContext = createGraphBuildContext()

    return {
        source(name: string, builder: TabularSourceBuilder) {
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

            if (options?.prettifyJson) {
                const data = statement.fields.get('data')!
                statement.fields.set('data', new n.FuncCall('jsonb_pretty', data))
            }

            if (statement.fields.size === 0) {
                json.convertToEmptyDataStatement(statement)
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