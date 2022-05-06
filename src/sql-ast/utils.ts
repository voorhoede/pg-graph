import { WhereBuilderResultNode } from "../graph/where-builder";
import { SqlNode, n } from "../sql-ast";

export function walkWhereClause(whereClause: Exclude<WhereBuilderResultNode, undefined> | undefined, cb: (node: n.Compare) => n.Compare | undefined): WhereBuilderResultNode | undefined {
    if(!whereClause) {
        return undefined
    }

    function traverse(node: SqlNode): SqlNode | undefined {
        if(node instanceof n.And || node instanceof n.Or) {
            const l = traverse(node.left);
            const r = traverse(node.right);
            if(!l || !r) {
                return l || r || undefined;
            }
            const clz = node instanceof n.And ? n.And : n.Or
            return new clz(l, r)
        }
        else if(node instanceof n.Group) {
            const newGroupContent = traverse(node.node);
            if(!newGroupContent) {
                return undefined;
            }
            return new n.Group(newGroupContent);
        }
        else if (node instanceof n.Compare) {
            return cb(node)
        }
        return node
    }

    function assertValidWhereClauseNode(node?: SqlNode): asserts node is WhereBuilderResultNode {
        if(node && ![n.Compare, n.Group, n.Compare, n.And, n.Or].some(n => node instanceof n)) {
            throw new Error('Invalid where clause node')
        }
    }

    const result = traverse(whereClause)

    assertValidWhereClauseNode(result)

    return result
}