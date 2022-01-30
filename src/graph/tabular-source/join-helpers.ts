import { n } from "../../sql-ast";

export function createPointsToComparison(ownTable: n.TableRef, otherTable: n.TableRef, foreignKey?: string) {
    return new n.Compare(
        getPointsToColumnRef(ownTable, otherTable, foreignKey),
        '=',
        getOwnColumnRef(otherTable),
    )
}

/**
 * First table has key that points to many other rows in other table
 * 
 * Blog has many comments
 * 
 * Foreign key is on comment
 * 
 * @param firstTable 
 * @param pointsTo 
 * @param foreignKey 
 * @returns 
 */
export function getPointsToColumnRef(firstTable: n.TableRef, pointsTo: n.TableRef, foreignKey?: string) {
    return new n.Column(getForeignKey(foreignKey, name(pointsTo)), firstTable.name)
}


export function getOwnColumnRef(table: n.TableRef) {
    return new n.Column('id', table.name)
}

function name(table: n.TableRef) {
    return table instanceof n.TableRefWithAlias ? table.ref.name : table.name
}

function getForeignKey(key: string | null | undefined, orGuessFromTable: string) {
    return key ?? guessForeignKey(orGuessFromTable)
}

function guessForeignKey(tableName: string) {
    return `${tableName.toLowerCase()}_id`
}