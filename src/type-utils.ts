export type TableLike = {__tableName: string, __links?: TableRelationLink}

/**
 * The default table used when no generic was passed to graphQuery
 */
export type DefaultTable = TableLike & { __default: true }

export type TableFields<T extends TableLike> = Omit<T, '__tableName' | '__links'>
export type TableFieldNames<TF> = Extract<keyof TF, string>

export type TableName<T extends TableLike> = T['__tableName']
export type TableForTableName<T extends TableLike = TableLike, Name extends string = any> = T extends { __default: true }
    ? any
    : Extract<T, { __tableName: Name }>

/**
 * A one to one or one to many relation
 */
 export type TableRelationLink = { type: TableRelationType, destTable: string, destColumn: string }
 export type TableRelationType = 'one' | 'many'

export type TableRelationsByType<T extends TableLike, Type extends TableRelationType> = T extends { __default: true }
    ? TableRelationLink
    : Extract<Exclude<T['__links'], undefined>, { type: Type }>

export type TableNamesForRelations<T extends TableLike, Type extends TableRelationType> = TableRelationsByType<T, Type>['destTable']
export type TableRelationDestColumn<T extends TableLike, Type extends TableRelationType, Name extends TableNamesForRelations<T, Type>> = T extends { __default: true }
    ? string
    : Extract<TableRelationsByType<T, Type>, { destTable: Name }>['destColumn']

export type TableSelection<AT extends TableLike = TableLike, T extends TableLike = TableLike> = {
    all: AT,
    curr: T,
    fields: TableFields<T>,
    tableNames: TableName<AT>,
}

export type TableSelectionFromName<AT extends TableLike, Name extends TableName<AT>> = TableSelection<AT, TableForTableName<AT, Name>>