import { n } from "../../sql-ast";
import { GraphBuildContext } from "../context";

export type CountCondition = {
    toSql(statement: n.SelectStatement, tableAlias: string): void;
    requiresAtLeast(count: number): boolean;
}

export type CountConditionOperator = '>='

export function createCountCondition(buildCtx: GraphBuildContext, operator: CountConditionOperator, value: number) {
    return {
        toSql(statement: n.SelectStatement, tableAlias: string) {
            statement.having = new n.Compare(
                new n.AggCall('count', [new n.All(tableAlias)]),
                operator,
                buildCtx.createPlaceholderForValue(value)
            )
        },
        requiresAtLeast(count: number) {
            return operator === '>=' && value >= count
        }
    }
}