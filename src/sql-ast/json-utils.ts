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

export function copyFieldsInto(from: n.SelectStatement, to: n.SelectStatement, group: string, jsonProp: string) {
    const srcData = from.fields.get('data')
    if (srcData) {
        addField(to, group, jsonProp, srcData)
    }
}

export function addField(statement: n.SelectStatement, group: string, jsonProp: string, field: SelectField) {
    let dataField: n.FuncCall = statement.fields.get(group) as n.FuncCall
    if (!dataField) {
        dataField = new n.FuncCall('jsonb_build_object');
        statement.fields.add(dataField, group)
    }
    dataField.args.push(new n.RawValue(jsonProp), field)
}

export function convertDataFieldsToAgg(statement: n.SelectStatement, nullField?: n.Field) {
    let dataField = statement.fields.get(BuiltinGroups.Data)
    if (!dataField) {
        return
    }

    if (!(dataField instanceof n.FuncCall) || dataField.name === 'jsonb_agg') {
        throw new Error('Field is already wrapped by jsonb_agg')
    }

    let orderBy: n.OrderBy | undefined = undefined
    if (statement.orderByColumns.length) {
        orderBy = new n.OrderBy(...statement.orderByColumns)
        statement.orderByColumns.length = 0
    }

    const call = new n.AggCall('jsonb_agg', [
        dataField
    ], orderBy)

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
            new n.RawValue('[]', 'jsonb')
        )
    } else {
        field = new n.FuncCall('coalesce',
            call,
            new n.RawValue('[]', 'jsonb')
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
    if (src instanceof n.DerivedTable) {
        target = src.alias
        fromSelect = src.select
    } else if (src instanceof n.Cte) {
        target = src.name
        fromSelect = src.node
    } else {
        throw new Error('From should be a derived table or Cte (Common Table Expression)')
    }

    for (let { alias } of fromSelect.fields) {
        if (alias && !isHiddenFieldName(alias)) {
            if (alias === BuiltinGroups.Data) {
                addField(dest, BuiltinGroups.Data, withPrefix, new n.Field(alias, target))
            } else {
                addField(dest, BuiltinGroups.Data, withPrefix + capitalizeFirst(alias), new n.Field(alias, target))
            }
        }
    }
}

const capitalizeFirst = (s: string) => s.charAt(0).toUpperCase() + s.substring(1)