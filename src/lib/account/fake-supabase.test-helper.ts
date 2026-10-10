/**
 * Minimal in-memory stand-in for the Supabase query builder, covering exactly the calls the account route
 * handlers make (select/insert/upsert/update/delete with eq/gt/in/order/limit, maybeSingle/single, count).
 * Test-only: imported by *.test.ts files.
 */

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

export class FakeDb {
  tables: Record<string, Row[]> = {};
  private seq: Record<string, number> = {};

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  nextId(table: string): number {
    this.seq[table] = (this.seq[table] ?? 0) + 1;
    return this.seq[table];
  }

  client() {
    return { from: (table: string) => new FakeQuery(this, table) };
  }
}

const UNIQUE: Record<string, string[][]> = {
  watchlist: [["user_id", "ref"]],
  alerts: [["user_id", "ref", "kind"]],
  subscriptions: [["user_id"], ["stripe_customer_id"]],
  profiles: [["id"], ["telegram_link_code"]],
};

const SERIAL_TABLES = new Set(["watchlist", "tracked_homes", "alerts", "saved_calculations", "leads"]);

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row | null = null;
  private onConflict: string[] = [];
  private ignoreDuplicates = false;
  private countExact = false;
  private head = false;
  private orderBy: { col: string; asc: boolean } | null = null;
  private max: number | null = null;
  private mode: "many" | "maybe" | "single" = "many";

  constructor(
    private db: FakeDb,
    private table: string,
  ) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "select") {
      this.countExact = opts?.count === "exact";
      this.head = Boolean(opts?.head);
    }
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  upsert(row: Row, opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
    this.op = "upsert";
    this.payload = row;
    this.onConflict = (opts?.onConflict ?? "id").split(",").map((s) => s.trim());
    this.ignoreDuplicates = Boolean(opts?.ignoreDuplicates);
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }
  eq(col: string, value: unknown) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  gt(col: string, value: number) {
    this.filters.push((r) => Number(r[col]) > value);
    return this;
  }
  in(col: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[col]));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }

  private matches(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private violatesUnique(row: Row, except?: Row): boolean {
    for (const cols of UNIQUE[this.table] ?? []) {
      if (cols.some((c) => row[c] == null)) continue;
      if (this.db.rows(this.table).some((r) => r !== except && cols.every((c) => r[c] === row[c]))) return true;
    }
    return false;
  }

  private execute(): { data: unknown; error: unknown; count?: number | null } {
    const now = new Date().toISOString();
    let result: Row[] = [];
    if (this.op === "select") {
      result = this.matches();
    } else if (this.op === "insert") {
      const row: Row = { created_at: now, ...this.payload };
      if (SERIAL_TABLES.has(this.table) && row.id == null) row.id = this.db.nextId(this.table);
      if (this.table === "alerts") row.active ??= true;
      if (this.violatesUnique(row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
      this.db.rows(this.table).push(row);
      result = [row];
    } else if (this.op === "upsert") {
      const payload = this.payload!;
      const existing = this.db.rows(this.table).find((r) => this.onConflict.every((c) => r[c] === payload[c]));
      if (existing) {
        if (!this.ignoreDuplicates) Object.assign(existing, payload);
        result = [existing];
      } else {
        const row: Row = { created_at: now, ...payload };
        if (SERIAL_TABLES.has(this.table) && row.id == null) row.id = this.db.nextId(this.table);
        if (this.violatesUnique(row)) return { data: null, error: { code: "23505", message: "duplicate key" } };
        this.db.rows(this.table).push(row);
        result = [row];
      }
    } else if (this.op === "update") {
      result = this.matches();
      for (const r of result) Object.assign(r, this.payload);
    } else if (this.op === "delete") {
      result = this.matches();
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !result.includes(r));
    }
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      result = [...result].sort((a, b) => (a[col]! < b[col]! ? -1 : a[col]! > b[col]! ? 1 : 0) * (asc ? 1 : -1));
    }
    if (this.max != null) result = result.slice(0, this.max);
    const copy = result.map((r) => ({ ...r }));
    if (this.countExact) return { data: this.head ? null : copy, error: null, count: copy.length };
    if (this.mode === "maybe") return { data: copy[0] ?? null, error: null };
    if (this.mode === "single") return copy.length === 1 ? { data: copy[0], error: null } : { data: null, error: { code: "PGRST116", message: "not single" } };
    return { data: copy, error: null };
  }

  then<R1 = { data: unknown; error: unknown; count?: number | null }, R2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    // Resolve on a later microtask so concurrent requests interleave like real network calls.
    return Promise.resolve()
      .then(() => this.execute())
      .then(onfulfilled, onrejected);
  }
}
