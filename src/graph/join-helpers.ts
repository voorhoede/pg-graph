import { n } from "../sql-ast";
import { RelationType } from "./types";


export function createComparison(type: RelationType, ownTable: n.TableRef, otherTable: n.TableRef, foreignKey?: string) {
    if (type === RelationType.Many) {
        return new n.Compare(
            getOneBelongsToManyColumnRef(ownTable, otherTable, foreignKey),
            '=',
            getOwnColumnRef(otherTable),
        )
    } else {
        return new n.Compare(
            getOneHasOneColumnRef(otherTable, ownTable, foreignKey),
            '=',
            getOwnColumnRef(ownTable),
        )
    }
}

/**
 * First table has key that points to many other rows in other table
 * 
 * Blog has many comments
 * 
 * Foreign key is on comment
 * 
 * @param oneTable 
 * @param manyTable 
 * @param foreignKey 
 * @returns 
 */
export function getOneBelongsToManyColumnRef(oneTable: n.TableRef, manyTable: n.TableRef, foreignKey?: string) {
    return new n.Column(getForeignKey(foreignKey, name(manyTable)), oneTable.name)
}

/**
 * Foreign table has key that points to own table. For example:
 * User has one gift
 * 
 * User is own table
 * Gift is other table
 * 
 * Result:
 * user.gift_id
 * 
 * @param ownTable 
 * @param otherTable 
 * @param foreignKey 
 * @returns 
 */
export function getOneHasOneColumnRef(ownTable: n.TableRef, otherTable: n.TableRef, foreignKey?: string) {
    return new n.Column(getForeignKey(foreignKey, name(otherTable)), ownTable.name)
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