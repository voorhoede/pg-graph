export type RelationLink = { destTable: string, destColumn: string }

export type TableLike = {__tableName: string, __links?: RelationLink}

export type TableFields<T extends TableLike> = Omit<T, '__tableName' | '__links'>
export type TableFieldNames<TF> = Extract<keyof TF, string> extends never ? string : Extract<keyof TF, string>

export type TableName<T extends TableLike> = T['__tableName']
export type TableForTableName<T extends TableLike = TableLike, Name extends string = any> = Extract<T, { __tableName: Name }> extends never ? any : Extract<T, { __tableName: Name }>

export type TableRelationType = 'one' | 'many'

export type TableRelationsByType<T extends TableLike, Type extends TableRelationType> = Extract<Exclude<T['__links'], undefined>, { type: Type }> extends never ?
    any
    : Extract<Exclude<T['__links'], undefined>, { type: Type }>

export type TableNamesForRelations<T extends TableLike, Type extends TableRelationType, Link extends RelationLink = TableRelationsByType<T, Type>> = Link['destTable']
export type TableRelationDestColumn<T extends TableLike, Type extends TableRelationType, Name extends TableNamesForRelations<T, Type>> = Extract<TableRelationsByType<T, Type>, { destTable: Name }>['destColumn']
