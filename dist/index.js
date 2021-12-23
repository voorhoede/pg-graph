var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __markAsModule = (target) => __defProp(target, "__esModule", { value: true });
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __reExport = (target, module2, copyDefault, desc) => {
  if (module2 && typeof module2 === "object" || typeof module2 === "function") {
    for (let key of __getOwnPropNames(module2))
      if (!__hasOwnProp.call(target, key) && (copyDefault || key !== "default"))
        __defProp(target, key, { get: () => module2[key], enumerable: !(desc = __getOwnPropDesc(module2, key)) || desc.enumerable });
  }
  return target;
};
var __toCommonJS = /* @__PURE__ */ ((cache) => {
  return (module2, temp) => {
    return cache && cache.get(module2) || (temp = __reExport(__markAsModule({}), module2, 1), cache && cache.set(module2, temp), temp);
  };
})(typeof WeakMap !== "undefined" ? /* @__PURE__ */ new WeakMap() : 0);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  graphQuery: () => graphQuery
});

// src/builder.ts
function funcCall(name, ...args) {
  return {
    type: "funcCall",
    name,
    args,
    toSql() {
      const argsToStr = args.map((arg) => arg.toSql()).join(", ");
      return `${name}(${argsToStr})`;
    }
  };
}
function rawValue(value, cast) {
  return {
    type: "rawValue",
    value,
    cast,
    toSql() {
      let formattedValue = value;
      switch (typeof value) {
        case "string": {
          formattedValue = `'${value}'`;
          break;
        }
        case "number": {
          formattedValue = value;
          break;
        }
      }
      return `${formattedValue}${formatCast(cast)}`;
    }
  };
}
function tableRef(name) {
  return {
    type: "tableRef",
    name,
    field(field) {
      return tableField(name, field);
    },
    allFields() {
      return tableAllFields(name);
    },
    toSql() {
      return `"${name}"`;
    }
  };
}
function tableRefWithAlias(ref, alias) {
  return {
    type: "tableRefWithAlias",
    ref,
    toSql() {
      return ref.toSql() + " " + alias;
    }
  };
}
function tableAllFields(table) {
  return {
    type: "tableAllFieldsRef",
    table,
    toSql() {
      return `"${table}".*`;
    }
  };
}
function tableField(table, field, cast) {
  return {
    type: "tableFieldRef",
    table,
    field,
    cast,
    toSql() {
      return `"${table}".${field}${formatCast(cast)}`;
    }
  };
}
function subquery(select) {
  return {
    type: "subquery",
    toSql() {
      return "(" + select.toSql() + ") ";
    }
  };
}
function derivedTable(select, alias) {
  return {
    type: "derivedTable",
    toSql() {
      return "(" + select.toSql() + ") " + alias;
    }
  };
}
var JoinType = /* @__PURE__ */ ((JoinType2) => {
  JoinType2["INNER_JOIN"] = "INNER_JOIN";
  JoinType2["LEFT_JOIN"] = "LEFT JOIN";
  JoinType2["LEFT_OUTER_JOIN"] = "LEFT OUTER JOIN";
  JoinType2["RIGHT_JOIN"] = "RIGHT_JOIN";
  JoinType2["RIGHT_OUTER_JOIN"] = "RIGHT OUTER JOIN";
  JoinType2["FULL_OUTER"] = "FULL OUTER";
  JoinType2["CROSS_JOIN"] = "CROSS JOIN";
  JoinType2["LEFT_JOIN_NATURAL"] = "LEFT JOIN NATURAL";
  return JoinType2;
})(JoinType || {});
function selectStatement() {
  function createJoinCollection() {
    let joins = [];
    return {
      get length() {
        return joins.length;
      },
      add(type, src, a, b) {
        joins.push({ type, src, a, b });
      },
      toSql() {
        return joins.map((join) => {
          return `${join.type} ${join.src.toSql()} ON ${join.a.toSql()} = ${join.b.toSql()}`;
        }).join(" ");
      },
      [Symbol.iterator]() {
        return joins[Symbol.iterator]();
      }
    };
  }
  function createFieldCollection() {
    let fields = [];
    return {
      get length() {
        return fields.length;
      },
      add(sql, alias) {
        fields.push({ sql, alias });
      },
      toSql() {
        if (!fields.length) {
          return "1";
        }
        return fields.map((field) => {
          return field.sql.toSql() + (field.alias ? ` as ${field.alias}` : "");
        }).join(", ");
      },
      json() {
        fields = [{ sql: funcCall("json_build_object", ...this.flattened()) }];
      },
      jsonAgg() {
        fields = [{ sql: funcCall("json_agg", funcCall("json_build_object", ...this.flattened())) }];
      },
      flattened() {
        const args = [];
        fields.forEach((field) => {
          args.push(rawValue(field.alias));
          args.push(field.sql);
        });
        return args;
      },
      [Symbol.iterator]() {
        return fields[Symbol.iterator]();
      }
    };
  }
  const fieldCollection = createFieldCollection();
  const joinCollection = createJoinCollection();
  const groupBys = [];
  let whereClause;
  let source;
  return {
    type: "selectStatement",
    get fields() {
      return fieldCollection;
    },
    get joins() {
      return joinCollection;
    },
    source(tableOrView, alias) {
      source = alias ? tableRefWithAlias(tableOrView, alias) : tableOrView;
    },
    addGroupBy(sql) {
      groupBys.push(sql);
    },
    addWhereClause(sql) {
      whereClause = { sql };
    },
    toSql() {
      const parts = [];
      if (source) {
        parts.push("FROM " + source.toSql());
      }
      if (joinCollection.length) {
        parts.push(joinCollection.toSql());
      }
      if (whereClause) {
        parts.push("WHERE " + whereClause.sql);
      }
      if (groupBys.length) {
        parts.push("GROUP BY " + groupBys.map((groupBy) => groupBy.toSql()).join(","));
      }
      return `SELECT ${fieldCollection.toSql()}${parts.length ? " " + parts.join(" ") : ""}`;
    }
  };
}
function formatCast(name) {
  return name ? "::" + name : "";
}

// src/index.ts
var toSql = Symbol("to sql");
function createContext() {
  let alias = "a".charCodeAt(0);
  const proto = {
    genTableAlias() {
      return String.fromCharCode(alias++);
    },
    sub() {
      const subContext = Object.create(proto);
      subContext.table = null;
      return subContext;
    }
  };
  const ctx = Object.create(proto);
  ctx.table = null;
  return ctx;
}
function createField(name) {
  let jsonProp = name;
  return {
    type: 1 /* FIELD */,
    alias(alias) {
      console.log(alias);
      jsonProp = alias;
      return this;
    },
    [toSql](statement, ctx) {
      statement.fields.add(tableField(ctx.table, name), jsonProp);
    }
  };
}
function createValue(jsonProp, value) {
  return {
    type: 2 /* VALUE */,
    [toSql](statement) {
      statement.fields.add(rawValue(value, jsonProp));
    }
  };
}
function createWhereClause(sql) {
  return {
    type: 3 /* WHERE */,
    [toSql](statement) {
      statement.addWhereClause(sql);
    }
  };
}
function createTableSource(fieldName, fn) {
  const children = [];
  let targetTable, alias = fieldName;
  const hasSubRelations = () => children.some((child) => child.type === 0 /* TABLE */);
  const callToSqlForChilds = (statement, ctx) => {
    children.forEach((child) => child[toSql](statement, ctx));
  };
  const instance = {
    type: 0 /* TABLE */,
    many(fieldName2, fn2) {
      let item = createTableSource(fieldName2, fn2);
      children.push(item);
      return item;
    },
    alias(jsonProp) {
      alias = jsonProp;
      return this;
    },
    where(sql) {
      children.push(createWhereClause(sql));
      return this;
    },
    targetTable(name) {
      targetTable = name;
      return this;
    },
    field(name) {
      const field = createField(name);
      children.push(field);
      return field;
    },
    value(jsonProp, value) {
      const v = createValue(jsonProp, value);
      children.push(v);
      return v;
    },
    [toSql](statement, ctx) {
      const table = targetTable || fieldName;
      if (ctx.table) {
        const alias2 = ctx.genTableAlias();
        const subCtx = ctx.sub();
        subCtx.table = alias2;
        const a = tableField(alias2, `${ctx.table.toLowerCase()}_id`);
        const b = tableField(ctx.table, "id");
        if (hasSubRelations()) {
          const derivedJoinTable = selectStatement();
          derivedJoinTable.source(tableRef(table), alias2);
          callToSqlForChilds(derivedJoinTable, subCtx);
          derivedJoinTable.addWhereClause(`${a}=${b}`);
          const derivedAlias = ctx.genTableAlias();
          statement.joins.add(JoinType.LEFT_JOIN_NATURAL, derivedTable(derivedJoinTable, derivedAlias), rawValue(1), rawValue(1));
          statement.fields.add(funcCall("json_agg", tableAllFields(derivedAlias)), fieldName);
        } else {
          statement.joins.add(JoinType.LEFT_JOIN, tableRefWithAlias(tableRef(table), alias2), a, b);
          const subStatement = selectStatement();
          callToSqlForChilds(subStatement, subCtx);
          statement.fields.add(funcCall("json_agg", ...subStatement.fields.flattened()), fieldName);
        }
        statement.addGroupBy(tableField(ctx.table, "id"));
      } else {
        const alias2 = ctx.genTableAlias();
        const subCtx = ctx.sub();
        subCtx.table = alias2;
        const subSelect = selectStatement();
        subSelect.source(tableRef(table), alias2);
        callToSqlForChilds(subSelect, subCtx);
        subSelect.fields.jsonAgg();
        statement.fields.add(subquery(subSelect), fieldName);
      }
    }
  };
  fn?.(instance);
  return instance;
}
function graphQuery() {
  const sources = [];
  return {
    source(name, fn) {
      const item = createTableSource(name, fn);
      sources.push(item);
      return item;
    },
    toSql() {
      const statement = selectStatement();
      const ctx = createContext();
      const jsonSelect = selectStatement();
      sources[0][toSql](jsonSelect, ctx);
      statement.fields.add(funcCall("json_build_object", ...jsonSelect.fields.flattened()));
      return statement.toSql();
    }
  };
}
var graph = graphQuery();
graph.source("User", (user) => {
  user.field("email");
  user.many("Tree", (tree) => {
    tree.field("name").alias("tree_name");
  });
});
console.log(graph.toSql());
module.exports = __toCommonJS(src_exports);
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  graphQuery
});
