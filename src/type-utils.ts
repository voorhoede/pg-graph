export type TableLike = {__tableName: string}

export type TableFields<T extends TableLike> = Omit<T, '__tableName'>
export type TableFieldNames<TF> = Extract<keyof TF, string>

export type TableName<T extends TableLike> = T['__tableName']
export type TableForTableName<T extends TableLike, Name extends string> = Extract<T, { __tableName: Name }>