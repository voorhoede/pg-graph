export { graphQuery } from './graph'

type And = {
    type: 'and'
}

type Group = {
    type: 'group',
    node: SqlNode
}

type SqlNode = Group | And;


type And2 = ReturnType<typeof and>
type Group2 = ReturnType<typeof group>

type SqlNode2 = And2 | Group2;

function and() {
    return {
        type: 'group'
    }
}

function group(n: SqlNode2) {
    return {
        type: 'group',
        node: n,
    }
}

class And3 {
    readonly type: 'and' = 'and';
}

class Group3 {
    readonly type: 'hoi' = 'hoi';
}

type SqlNode3 = Group3 | And3;