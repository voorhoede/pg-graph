import { SelectField } from "./nodes";
import { n } from "./";

export enum BuiltinGroups {
    Data = 'data',
    Agg = 'agg'
}

const isHiddenFieldName = (fieldName: string) => fieldName.startsWith('_')

export function createHiddenFieldName(fieldName: string) {
    return '_' + fieldName
}

/**
 * Clear the select statement so that the output will be an empty json array
 * @param statement 
 */
export function convertToEmptyDataStatement(statement: n.SelectStatement) {
    statement.fields.clear()
    statement.fields.set('data', new n.Cast(new n.RawValue('[]'), 'json'))
    statement.orderByColumns.length = 0
    statement.groupBys.length = 0
    statement.source = undefined
    statement.ctes.clear()
    statement.joins.length = 0
}

/**
 * Copy json fields from one statement to another
 * @param from 
 * @param to 
 * @param group 
 * @param jsonProp 
 */
export function copyFieldsInto(from: n.SelectStatement, to: n.SelectStatement, group: string, jsonProp: string) {
    const srcData = from.fields.get('data')
    if (srcData) {
        addField(to, group, jsonProp, srcData)
    }
}

/**
 * Add a single json field to the given object in the given statement
 * @param statement where the json field is added
 * @param group the name of the object
 * @param jsonProp the key within the object
 * @param field the data
 */
export function addField(statement: n.SelectStatement, group: string, jsonProp: string, field: SelectField) {
    let dataField: n.FuncCall = statement.fields.get(group) as n.FuncCall
    if (!dataField) {
        dataField = new n.FuncCall('jsonb_build_object');
        statement.fields.set(group, dataField)
    }
    dataField.args.push(new n.RawValue(jsonProp), field)
}

/**
 * Convert the field with the name 'data' into a json aggregration. 
 * This will modify the select statement so that the aggregration returns the correct data
 * @param statement 
 * @param nullField 
 * @returns 
 */
export function convertDataFieldsToAgg(statement: n.SelectStatement, nullField?: n.Column) {
    let dataField = statement.fields.get(BuiltinGroups.Data)
    if (!dataField) {
        return
    }

    if (!(dataField instanceof n.FuncCall) || dataField.name === 'jsonb_agg') {
        throw new Error('Field is already wrapped by jsonb_agg')
    }

    /**
     * Limit is not taken in consideration when Aggregrating. This was a bit of surprise to me...
     * To make this work we have to add the limit to a subquery.
     */
    if (statement.limit) {
        if (statement.source instanceof n.TableRefWithAlias) {

            const subSelect = new n.SelectStatement();
            subSelect.fields.set(Symbol(), new n.All())
            subSelect.limit = statement.limit
            subSelect.offset = statement.offset
            subSelect.source = statement.source.ref;
            statement.copyOrderBysTo(subSelect)
            statement.copyWhereClauseTo(subSelect)
            statement.copyJoinsTo(subSelect)

            statement.orderByColumns.length = 0
            statement.clearWhereClause()
            statement.limit = undefined
            statement.offset = undefined
            statement.joins = []
            statement.source = new n.DerivedTable(
                subSelect,
                statement.source.name
            )

        }
    }

    let orderBy: n.OrderBy | undefined = undefined
    if (statement.orderByColumns.length) {
        orderBy = new n.OrderBy(...statement.orderByColumns)
        statement.orderByColumns.length = 0
    }

    const call = new n.AggCall('jsonb_agg', [
        dataField
    ], {
        orderBy,
    })

    let field: SelectField;
    if (nullField) {
        field = new n.FuncCall('coalesce',
            new n.WindowFilter(
                call,
                new n.Where(
                    new n.Compare(
                        nullField,
                        'IS NOT',
                        n.Identifier.null
                    )
                )
            ),
            new n.Cast(new n.RawValue('[]'), 'jsonb')
        )
    } else {
        field = new n.FuncCall('coalesce',
            call,
            new n.Cast(new n.RawValue('[]'), 'jsonb')
        )
    }

    statement.fields.set(BuiltinGroups.Data, field)
}

type SpecialFieldReferencesOptions = {
    src: n.DerivedTable | n.Cte,
    dest: n.SelectStatement,
    withPrefix: string
}

export function addReferencesToChildFields({ src, dest, withPrefix }: SpecialFieldReferencesOptions) {
    let fromSelect: n.SelectStatement
    let target: string
    if (src instanceof n.DerivedTable && src.select instanceof n.SelectStatement) {
        target = src.alias
        fromSelect = src.select
    } else if (src instanceof n.Cte && src.node instanceof n.SelectStatement) {
        target = src.name
        fromSelect = src.node
    } else {
        throw new Error('From should be a derived table or Cte (Common Table Expression)')
    }

    for (let [alias,] of fromSelect.fields) {
        if (typeof alias === 'string' && !isHiddenFieldName(alias)) {
            if (alias === BuiltinGroups.Data) {
                addField(dest, BuiltinGroups.Data, withPrefix, new n.FuncCall('coalesce', new n.Column(alias, target), new n.RawValue('[]')))
            } else {
                addField(dest, BuiltinGroups.Data, withPrefix + capitalizeFirst(alias), new n.Column(alias, target))
            }
        }
    }
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.substring(1)