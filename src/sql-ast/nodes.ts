import { SqlNode } from "./node-types";
import { JoinType, OrderDirection, ValidComparisonSign } from "./types";
import { WhereBuilderResultNode } from "../graph/where-builder";
import { NodeToSqlContext } from "./context";
import { escapeIdentifier } from "../utils";

export class Operator {
  constructor(
    public left:
      | FuncCall
      | AggCall
      | RawValue
      | Column
      | Subquery
      | Operator
      | Cast
      | Group,
    public operator: string,
    public right:
      | FuncCall
      | AggCall
      | RawValue
      | Column
      | Subquery
      | Operator
      | Cast
      | Group
  ) {}
  public toSql(ctx: NodeToSqlContext) {
    this.left.toSql(ctx);
    ctx.formatter.write(" " + this.operator + " ");
    this.right.toSql(ctx);
  }
}

export class WindowFilter {
  constructor(public node: FuncCall | AggCall, public where: Where) {}
  public toSql(ctx: NodeToSqlContext) {
    this.node.toSql(ctx);
    ctx.formatter.write(" FILTER (");
    this.where.toSql(ctx);
    ctx.formatter.write(")");
  }
}

export class WindowFunc {
  constructor(
    public node: FuncCall | AggCall,
    public partitionBy?: Column,
    public orderBy?: OrderBy
  ) {}
  public toSql(ctx: NodeToSqlContext) {
    this.node.toSql(ctx);
    ctx.formatter.write(" OVER (");
    if (this.partitionBy) {
      ctx.formatter.write(" PARTITION BY ");
      this.partitionBy.toSql(ctx);
      ctx.formatter.write(" ");
    }
    if (this.orderBy) {
      this.orderBy.toSql(ctx);
    }
    ctx.formatter.write(")");
  }
}

export class Cte {
  constructor(
    public name: string,
    public node: SelectStatement | Values,
    public notMaterialized?: boolean
  ) {}
  ref() {
    return new TableRef(this.name);
  }
  column(name: string) {
    return new Column(name, this.name);
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.startIndent().writeLine(`"${this.name}" AS`);

    if (this.notMaterialized) {
      ctx.formatter.write(" NOT MATERIALIZED");
    }

    ctx.formatter.write(" (");

    this.node.toSql(ctx);

    ctx.formatter.writeLine(`)`).endIndent();
  }
}

export class Where {
  constructor(public node: SqlNode) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.writeLine("WHERE").break().startIndent();
    this.node.toSql(ctx);
    ctx.formatter.endIndent();
  }
  and(other: SqlNode): And {
    return new And(this, other);
  }
  or(other: SqlNode): Or {
    return new Or(this, other);
  }
}

export class And {
  constructor(public left: SqlNode, public right: SqlNode) {}
  toSql(ctx: NodeToSqlContext) {
    this.left.toSql(ctx);
    ctx.formatter.write(" AND ");
    this.right.toSql(ctx);
  }
  and(other: SqlNode) {
    return new And(this, other);
  }
  or(other: SqlNode) {
    return new Or(this, other);
  }
}

export class Or {
  constructor(public left: SqlNode, public right: SqlNode) {}
  toSql(ctx: NodeToSqlContext) {
    this.left.toSql(ctx);
    ctx.formatter.write(" OR ");
    this.right.toSql(ctx);
  }
  and(other: SqlNode): And {
    return new And(this, other);
  }
  or(other: SqlNode): Or {
    return new Or(this, other);
  }
}

export class InList {
  public nodes: SqlNode[];
  constructor(...nodes: SqlNode[]) {
    this.nodes = nodes;
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter
      .write("(")
      .join(this.nodes, (node) => node.toSql(ctx), ", ")
      .write("(");
  }
}

export class Compare {
  constructor(
    public left: SqlNode,
    public comparison: ValidComparisonSign,
    public right: SqlNode
  ) {}
  toSql(ctx: NodeToSqlContext) {
    this.left.toSql(ctx);
    ctx.formatter.write(` ${this.comparison} `);
    this.right.toSql(ctx);
  }
  and(other: SqlNode) {
    return new And(this, other);
  }
  or(other: SqlNode) {
    return new Or(this, other);
  }
}

export class Identifier {
  constructor(public value: string) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write(this.value);
  }

  static true = new Identifier("TRUE");
  static false = new Identifier("FALSE");
  static null = new Identifier("NULL");
}

export class FuncCall {
  public args: SqlNode[];
  constructor(public name: String, ...args: SqlNode[]) {
    this.args = args;
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write(`${this.name}(`);

    if (this.name === "jsonb_build_object") {
      ctx.formatter
        .break()
        .startIndent()
        .join(
          this.args,
          (arg, index) => {
            if (index > 0 && index % 2 === 0) {
              ctx.formatter.break();
            }
            arg.toSql(ctx);
          },
          ", "
        )
        .endIndent()
        .break();
    } else {
      const containsFuncCalls = this.args.some(
        (arg) => arg instanceof FuncCall || arg instanceof AggCall
      );

      if (containsFuncCalls) {
        ctx.formatter.break();

        ctx.formatter.join(
          this.args,
          (arg) => {
            ctx.formatter.break();
            ctx.formatter.startIndent();
            arg.toSql(ctx);
            ctx.formatter.endIndent();
          },
          ", "
        );
        ctx.formatter.break();
      } else {
        ctx.formatter.join(this.args, (arg) => arg.toSql(ctx), ", ");
      }
    }
    ctx.formatter.write(`)`);
  }
}

type AggCallOptions = {
  orderBy?: OrderBy;
  filter?: SqlNode;
  distinct?: boolean;
};

export class AggCall {
  constructor(
    public name: string,
    public args: SqlNode[],
    public additionalOptions: AggCallOptions = {}
  ) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write(`${this.name}(`);

    if (this.additionalOptions.distinct) {
      ctx.formatter.write("DISTINCT ");
    }

    const containsFuncCalls = this.args.some(
      (arg) => arg instanceof FuncCall || arg instanceof AggCall
    );

    if (containsFuncCalls) {
      ctx.formatter.break();

      ctx.formatter.join(
        this.args,
        (arg) => {
          ctx.formatter.break();
          ctx.formatter.startIndent();
          arg.toSql(ctx);
          ctx.formatter.endIndent();
        },
        ", "
      );
      ctx.formatter.break();
    } else {
      ctx.formatter.join(this.args, (arg) => arg.toSql(ctx), ", ");
    }

    if (this.additionalOptions.orderBy) {
      ctx.formatter.break().startIndent();
      this.additionalOptions.orderBy.toSql(ctx);
      ctx.formatter.endIndent().break();
    }

    ctx.formatter.write(`)`);

    if (this.additionalOptions.filter) {
      ctx.formatter.write(" FILTER (").startIndent();
      new Where(this.additionalOptions.filter).toSql(ctx);
      ctx.formatter.endIndent().break().write(")");
    }
  }
}

export class OrderBy {
  public columns: OrderByColumn[];
  constructor(...columns: OrderByColumn[]) {
    this.columns = columns;
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter
      .write("ORDER BY ")
      .startIndent()
      .break()
      .join(this.columns, (col) => col.toSql(ctx), ", ")
      .endIndent();
  }
}

export class CompositeType {
  public items: SqlNode[];
  constructor(...items: SqlNode[]) {
    this.items = items;
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter
      .write("(")
      .join(this.items, (col) => col.toSql(ctx), ",")
      .write(")");
  }
}

export class OrderByColumn {
  constructor(
    public column: Column | CompositeType,
    public mode?: OrderDirection
  ) {}
  toSql(ctx: NodeToSqlContext) {
    this.column.toSql(ctx);
    if (this.mode) {
      ctx.formatter.write(" " + this.mode);
    }
  }
}

export class RawValue {
  constructor(public value: unknown) {}
  toSql(ctx: NodeToSqlContext) {
    let formattedValue = this.value;
    switch (typeof this.value) {
      case "string": {
        formattedValue = `'${this.value.replace(/'/g, "\\'")}'`;
        break;
      }
      case "number": {
        formattedValue = this.value;
        break;
      }
    }

    ctx.formatter.write(formattedValue as string);
  }
}

export class TableRef {
  constructor(public name: string) {}
  allColumns() {
    return new All(this.name);
  }
  column(name: string) {
    return new Column(name, this.name);
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write(escapeIdentifier(this.name));
  }
}

export class TableRefWithAlias extends TableRef {
  constructor(public ref: TableRef, name: string) {
    super(name);
  }
  toSql(ctx: NodeToSqlContext) {
    this.ref.toSql(ctx);
    ctx.formatter.write(" " + escapeIdentifier(this.name));
  }
}

export class All {
  constructor(public table?: string) {}
  toSql(ctx: NodeToSqlContext) {
    if (this.table) {
      new TableRef(this.table).toSql(ctx);
      ctx.formatter.write(".*");
    } else {
      ctx.formatter.write("*");
    }
  }
}

export class Column {
  constructor(public name: string, public table?: string) {}
  toSql(ctx: NodeToSqlContext) {
    const resolvedTable = this.table ?? ctx.table;
    if (typeof resolvedTable === "string") {
      new TableRef(resolvedTable).toSql(ctx);
      ctx.formatter.write(`.${escapeIdentifier(this.name)}`);
    } else {
      ctx.formatter.write(escapeIdentifier(this.name));
    }
  }
}

export class Group {
  constructor(public node: SqlNode) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write("(");
    this.node.toSql(ctx);
    ctx.formatter.write(")");
  }
}

export class Subquery {
  constructor(public select: SelectStatement) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write("(");
    ctx.formatter.break();
    this.select.toSql(ctx);
    ctx.formatter.writeLine(")");
  }
}

export class DerivedTable {
  constructor(public select: SelectStatement | Values, public alias: string) {}
  ref() {
    return new TableRef(this.alias);
  }
  column(name: string) {
    return new Column(name, this.alias);
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write("(");
    ctx.formatter.break();
    this.select.toSql(ctx);
    ctx.formatter.writeLine(") ");
    new TableRef(this.alias).toSql(ctx);
  }
}

export class Placeholder {
  constructor(public id: number) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write("$" + this.id);
  }
}

export class Join {
  constructor(
    public type: JoinType,
    public src: DerivedTable | TableRef | TableRefWithAlias,
    public compare?: Compare | Identifier | RawValue
  ) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.writeLine(`${this.type}`).break().startIndent();
    this.src.toSql(ctx);
    if (this.compare) {
      ctx.formatter.write(` ON `);
      this.compare.toSql(ctx);
    }
    ctx.formatter.endIndent();
  }
}

type When = {
  when: SqlNode;
  then: SqlNode;
};

export class Case {
  public expression?: SqlNode;
  public branches: When[];
  public fallback?: SqlNode;

  constructor(expression: SqlNode, branches: When[], fallback?: SqlNode);
  constructor(branches: When[], fallback?: SqlNode);
  constructor(...args: any[]) {
    if (args.length === 3) {
      this.expression = args[0];
      this.branches = args[1];
      this.fallback = args[2];
    } else {
      this.branches = args[0];
      this.fallback = args[1];
    }
  }
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.write(`CASE`);

    if (this.expression) {
      ctx.formatter.write(" ");
      this.expression.toSql(ctx);
    }

    ctx.formatter.break().startIndent();

    this.branches.forEach((branch) => {
      ctx.formatter.writeLine("WHEN ");
      branch.when.toSql(ctx);
      ctx.formatter.write(" THEN ");
      branch.then.toSql(ctx);
      ctx.formatter.break();
    });

    if (this.fallback) {
      ctx.formatter.writeLine("ELSE ");
      this.fallback.toSql(ctx);
    }

    ctx.formatter.endIndent();

    ctx.formatter.writeLine("END");
  }
}

export class Values {
  constructor(public rows: [RawValue[]]) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.startIndent();
    ctx.formatter.write("VALUES ");
    ctx.formatter.join(
      this.rows,
      (row) => {
        ctx.formatter.write("(");
        ctx.formatter.join(
          row,
          (item) => {
            item.toSql(ctx);
          },
          ", "
        );
        ctx.formatter.write(")");
      },
      ", "
    );
    ctx.formatter.endIndent();
  }
}

export class Cast {
  constructor(
    public node:
      | FuncCall
      | AggCall
      | Column
      | RawValue
      | Group
      | Placeholder
      | Cast,
    public castTo: string
  ) {}
  toSql(ctx: NodeToSqlContext) {
    this.node.toSql(ctx);
    ctx.formatter.write("::" + this.castTo);
  }
}

export class Having {
  constructor(public node: Compare) {}
  toSql(ctx: NodeToSqlContext) {
    ctx.formatter.writeLine("HAVING");
    ctx.formatter.break();
    ctx.formatter.startIndent();
    this.node.toSql(ctx);
    ctx.formatter.endIndent();
  }
}

export type SelectField =
  | Column
  | Subquery
  | FuncCall
  | AggCall
  | WindowFunc
  | RawValue
  | Placeholder
  | Group
  | Operator
  | All;


export class SelectStatement {
  public fields = new Map<string | Symbol, SelectField>();
  public ctes = new Map<string, Cte>();
  public joins: Join[] = [];
  public groupBys: Column[] = [];
  public orderByColumns: OrderByColumn[] = [];
  public source?: TableRefWithAlias | TableRef | DerivedTable;
  public limit?:
    | Column
    | FuncCall
    | Cast
    | RawValue
    | Group
    | Subquery
    | Operator;
  public offset?:
    | Column
    | FuncCall
    | Cast
    | RawValue
    | Group
    | Subquery
    | Operator;
  public having?: Compare;
  public whereClause?: WhereBuilderResultNode;

  addWhereClause(node: Exclude<WhereBuilderResultNode, undefined>) {
    this.whereClause = this.whereClause
      ? new And(this.whereClause, node)
      : node;
  }

  copyOrderBysTo(other: SelectStatement) {
    other.orderByColumns = other.orderByColumns.concat(this.orderByColumns);
  }
  copyGroupBysTo(other: SelectStatement) {
    other.groupBys = other.groupBys.concat(this.groupBys);
  }
  copyJoinsTo(other: SelectStatement) {
    other.joins = other.joins.concat(this.joins);
  }
  copyWhereClauseTo(other: SelectStatement) {
    if (this.whereClause) {
      other.addWhereClause(this.whereClause);
    }
  }
  copyFieldsTo(other: SelectStatement) {
    for (let [key, node] of this.fields.entries()) {
      other.fields.set(key, node);
    }
  }
  toSql(ctx: NodeToSqlContext) {
    let tableName: string | undefined;
    if (this.source instanceof TableRef) {
      tableName = this.source.name;
    }

    const subCtx: NodeToSqlContext = {
      table: tableName,
      formatter: ctx.formatter,
    };

    if (this.ctes.size) {
      ctx.formatter.writeLine("WITH");
      ctx.formatter.join(
        this.ctes.entries(),
        ([, cte]) => cte.toSql(subCtx),
        ", "
      );
    }

    ctx.formatter.startIndent().writeLine("SELECT").break().startIndent();

    if (!this.fields.size) {
      ctx.formatter.write("1");
    } else {
      ctx.formatter.join(
        this.fields.entries(),
        ([alias, node], index) => {
          if (index > 0) {
            ctx.formatter.break();
          }
          node.toSql(subCtx);
          if (typeof alias === "string") {
            ctx.formatter.write(` AS "${alias}"`);
          }
        },
        ","
      );
    }

    ctx.formatter.endIndent();

    if (this.source) {
      ctx.formatter.writeLine("FROM ").break().startIndent();

      this.source.toSql(subCtx);

      ctx.formatter.break().endIndent();
    }

    if (this.joins.length > 0 && !this.source) {
      throw new Error("Joins without a source is not allowed");
    }

    ctx.formatter.joinLines(this.joins, (join) => {
      join.toSql(subCtx);
    });

    if (this.whereClause) {
      new Where(this.whereClause).toSql(subCtx);
    }

    if (this.groupBys.length) {
      ctx.formatter.writeLine("GROUP BY ");
      ctx.formatter.join(
        this.groupBys,
        (groupByCol) => groupByCol.toSql(subCtx),
        ", "
      );
    }

    if (this.having) {
      ctx.formatter.writeLine("HAVING");
      ctx.formatter.break();
      ctx.formatter.startIndent();
      this.having.toSql(ctx);
      ctx.formatter.endIndent();
    }

    if (this.orderByColumns.length) {
      ctx.formatter.break();
      new OrderBy(...this.orderByColumns).toSql(subCtx);
    }

    if (this.limit) {
      ctx.formatter.writeLine("LIMIT");
      ctx.formatter.startIndent();
      ctx.formatter.break();
      this.limit.toSql(subCtx);
      ctx.formatter.endIndent();
    }

    if (this.offset) {
      ctx.formatter.writeLine("OFFSET");
      ctx.formatter.startIndent();
      ctx.formatter.break();
      this.offset.toSql(subCtx);
      ctx.formatter.endIndent();
    }

    ctx.formatter.endIndent();
  }
}
