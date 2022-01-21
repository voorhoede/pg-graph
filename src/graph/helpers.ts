import { n } from "../sql-ast";
import { RelationType } from "./types";

type Table = n.TableRefWithAlias | n.TableRef

export function createComparison(type: RelationType, ownTable: Table, otherTable: Table, foreignKey?: string) {
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
export function getOneBelongsToManyColumnRef(oneTable: Table, manyTable: Table, foreignKey?: string) {
    return new n.Column(getForeignKey(foreignKey, name(manyTable)), aliasOrName(oneTable))
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
export function getOneHasOneColumnRef(ownTable: Table, otherTable: Table, foreignKey?: string) {
    return new n.Column(getForeignKey(foreignKey, name(otherTable)), aliasOrName(ownTable))
}

export function getOwnColumnRef(table: Table) {
    return new n.Column('id', aliasOrName(table))
}

function name(table: Table) {
    return hasAlias(table) ? table.ref.name : table.name
}

function aliasOrName(table: Table) {
    return hasAlias(table) ? table.alias : table.name
}

function hasAlias(table: any): table is n.TableRefWithAlias {
    return !!table.alias
}

function getForeignKey(key: string | null | undefined, orGuessFromTable: string) {
    return key ?? guessForeignKey(orGuessFromTable)
}

function guessForeignKey(tableName: string) {
    return `${tableName.toLowerCase()}_id`
}