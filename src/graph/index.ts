import { createGraphBuildContext, createGraphToSqlContext, GraphBuildContext } from "./context";
import { createTableSource, TableSourceBuilder, TableSource } from "./table-source";
import { n } from "../sql-ast";
import { toSqlKey } from "./types";

export function graphQuery() {
    const sources: TableSource[] = [];
    const graphBuildContext: GraphBuildContext = createGraphBuildContext()

    return {
        source(name: string, fn: TableSourceBuilder) {
            const item = createTableSource(graphBuildContext, name, undefined, fn);
            sources.push(item)
            return item;
        },
        toSql(): string {
            const statement = n.selectStatement()
            const ctx = createGraphToSqlContext()

            sources.forEach(source => {
                source[toSqlKey](statement, ctx)
            })

            statement.fields.convertToJsonObject('data')

            return statement.toSql()
        },
        values(): readonly any[] {
            return graphBuildContext.values
        }
    }
}