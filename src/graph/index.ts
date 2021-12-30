import { createGraphBuildContext, createGraphToSqlContext, GraphBuildContext } from "./context";
import { createRootTabularSource, TabularSourceBuilder, TabularSource } from "./tabular-source";
import { n } from "../sql-ast";
import { toSqlKey } from "./types";

export function graphQuery() {
    const sources: TabularSource[] = [];
    const graphBuildContext: GraphBuildContext = createGraphBuildContext()

    return {
        source(name: string, builder: TabularSourceBuilder) {
            const item = createRootTabularSource({
                ctx: graphBuildContext,
                name: name,
                builder
            });
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