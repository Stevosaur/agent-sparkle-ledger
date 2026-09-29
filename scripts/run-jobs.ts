import "dotenv/config";
import { drain } from "../src/lib/events/bus";
import { pool } from "../src/lib/db/client";

drain(1000)
  .then((n) => console.log(`processed ${n} events`))
  .finally(() => pool.end());
