export type ValidComparisonSign = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IS' | 'IS NOT' | 'IN' | 'NOT IN' | 'LIKE'

export enum OrderDirection {
    ASC = 'ASC',
    DESC = 'DESC',
}

export enum JoinType {
    INNER_JOIN = 'INNER JOIN',
    LEFT_JOIN = 'LEFT JOIN',
    LEFT_OUTER_JOIN = 'LEFT OUTER JOIN',
    RIGHT_JOIN = 'RIGHT JOIN',
    RIGHT_OUTER_JOIN = 'RIGHT OUTER JOIN',
    FULL_OUTER = 'FULL OUTER',
    CROSS_JOIN = 'CROSS JOIN',
    LEFT_JOIN_LATERAL = 'LEFT JOIN LATERAL',
    INNER_JOIN_LATERAL = 'INNER JOIN LATERAL',
    RIGHT_JOIN_LATERAL = 'RIGHT JOIN LATERAL',
}