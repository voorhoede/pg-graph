
import { JoinType, json, n } from "../../sql-ast";
import { createBaseTabularSource } from "./base-tabular-source";
import { TableSelection, TabularSourceOptions } from "./types";
import { itemsToSql } from "./items-to-sql";

export function createRootTabularSource<S extends TableSelection>(options: TabularSourceOptions<S>) {
    return createBaseTabularSource(options, ({ targetTableName, statement, ctx, items, name, countCondition }) => {
        const targetTable = new n.TableRefWithAlias(new n.TableRef(targetTableName), ctx.genTableAlias(targetTableName))

        const subCtx = ctx.createSubContext()
        subCtx.table = targetTable

        const cteSelect = new n.SelectStatement()
        cteSelect.source = targetTable

        // apply all items to the cteSelect
        itemsToSql(items, cteSelect, subCtx)

        json.convertDataFieldsToAgg(cteSelect)

        if (cteSelect.fields.size === 0) {
            json.convertToEmptyDataStatement(cteSelect)
            return
        }

        if (countCondition) {
            countCondition.toSql(cteSelect, targetTable.name)
        }

        const cte = new n.Cte(`${name}Cte`, cteSelect)
        statement.ctes.set(cte.name, cte)

        if (!statement.source) {
            statement.source = new n.TableRef(cte.name)
        } else {
            statement.joins.push(new n.Join(JoinType.CROSS_JOIN, new n.TableRef(cte.name)))
        }

        json.addReferencesToChildFields({
            withPrefix: name,
            dest: statement,
            src: cte,
        })
    })
}