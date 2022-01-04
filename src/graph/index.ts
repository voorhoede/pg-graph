import { createGraphBuildContext, createGraphToSqlContext, GraphBuildContext } from "./context";
import { createRootTabularSource, TabularSourceBuilder, TabularSource } from "./tabular-source";
import { n } from "../sql-ast";
import { toSqlKey } from "./types";
import { createFormatter } from "../sql-ast/formatting";
import { createNodeToSqlContext } from "../sql-ast/context";

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
            const statement = new n.SelectStatement()
            const graphToSqlCtx = createGraphToSqlContext()

            sources.forEach(source => {
                source[toSqlKey](statement, graphToSqlCtx)
            })

            statement.convertFieldsToJsonObject('data')

            const formatter = createFormatter()

            statement.toSql(createNodeToSqlContext(formatter))

            return formatter.toString()
        },
        values(): readonly any[] {
            return graphBuildContext.values
        }
    }
}