import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { dataDir } from "../lib/app-paths";

import * as schema from "./schema";

const databasePath = path.resolve(process.env.LOCAL_DB_PATH || path.join(dataDir(), "beeblio.sqlite"));
mkdirSync(path.dirname(databasePath), { recursive: true });
const client = new Database(databasePath);
client.pragma("journal_mode = WAL");
client.pragma("busy_timeout = 5000");
client.pragma("foreign_keys = ON");

export const db = drizzle(client, { schema });

export { schema };
