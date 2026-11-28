// Runs the agent's queries in a process of their own (query.ts), so a slow query can be
// stopped by killing this process. Opens the table file read-only: nothing here can write.
// Ends by itself when the service that started it goes away.
import { DatabaseSync } from "node:sqlite";
import { runQuery } from "./sql.ts";

const db = new DatabaseSync(process.argv[2], { readOnly: true });
process.on("message", (m) => process.send({ n: m.n, a: runQuery(db, m.sql, m.maxRows) }));
process.on("disconnect", () => process.exit(0));
