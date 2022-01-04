import { createGraphBuildContext, createGraphToSqlContext, GraphBuildContext } from "./context";
import { createRootTabularSource, TabularSourceBuilder, TabularSource } from "./tabular-source";
import { n } from "../sql-ast";
import { toSqlKey } from "./types";
import { createFormatter } from "../sql-ast/formatting";

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

            const formatter = createFormatter()

            statement.toSql({
                table: undefined,
                formatter,
            })

            return formatter.toString()
        },
        values(): readonly any[] {
            return graphBuildContext.values
        }
    }
}