export function formatTableName(name: string) {
    return '"' + name + '"'
}

export function formatTableField(table: string, field: string) {
    return formatTableName(table) + '.' + field
}