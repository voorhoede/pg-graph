export { graphQuery } from "./graph";
export { installPlugin } from "./plugins";

// const g = graphQuery<Tables>();

// // g.source("User", (s) => {
// //   s.field("given_name");

// //   s.throughMany("Order", (q) => {
// //     q("date_ordered", "=", new Date());
// //   }).one("Gift", (q) => {
// //     q.field("status");
// //   });

// //   s.where("email", "=", "remco@voorhoede.nl");

// //   // s.many("TreeRelation", (q) => {
// //   //   q.field("tree_relation");
// //   //   q.toSqlHints({
// //   //     lateralJoin: true,
// //   //   })
// //   // });
// // });

// // console.log(g.toSql());

import { Tables, TreeRelationType } from "../types";
import { graphQuery } from "./graph";

// const query = graphQuery();

// query.source("user", (user) => {
//   user.field("name");

//   user.throughOne("domain").one("blog", (q) => {
//     q.field("name");
//     q.toSqlHints({
//       joinStrategy: "agg",
//     });

//     //q.limit(1);
//   });

//   user.where("name", "=", "Remco");
// });

// console.log(query.toSql());

// const query2 = graphQuery();

// query2.source("user", (user) => {
//   user.field("name");

//   user.throughOne("domain").many("blog", (q) => {
//     q.field("name");
//     q.toSqlHints({
//       joinStrategy: "lateral",
//     });

//     //q.limit(1);
//   });

//   user.where("name", "=", "Remco");
// });

// console.log(query2.toSql());

const query3 = graphQuery();

query3.source("user", (user) => {
  user.field("name");

  user
    .throughMany("page")
    .throughOne("domain")
    .many("blog", (q) => {
      q.field("name");
      q.toSqlHints({
        joinStrategy: "lateral",
      });

      //q.limit(1);
    });

  user.where("name", "=", "Remco");
});

console.log(query3.toSql());

// const query4 = graphQuery();

// query4.source("user", (user) => {
//   user.field("name");

//   user.many("blog", (q) => {
//     q.field("name");
//     q.toSqlHints({
//       lateralJoin: true,
//     });

//     //q.limit(1);
//   });

//   user.where("name", "=", "Remco");
// });

// console.log(query4.toSql());

// const query5 = graphQuery();

// query5.source("user", (user) => {
//   user.field("name");

//   user.one("blog", (q) => {
//     q.field("name");
//     q.toSqlHints({
//       lateralJoin: true,
//     });
//     q.atLeast(1)

//     //q.limit(1);
//   });

//   user.where("name", "=", "Remco");
// });

// console.log(query5.toSql());

// const query6 = graphQuery();

// query6.source("user", (user) => {
//   user.field("name");

//   user.throughMany("page").one("blog", (q) => {
//     q.field("name");
//     q.toSqlHints({
//       lateralJoin: true,
//     });

//     //q.limit(1);
//   });

//   user.where("name", "=", "Remco");
// });

// console.log(query6.toSql());
