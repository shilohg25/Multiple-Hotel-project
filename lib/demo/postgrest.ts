// A small PostgREST-compatible query builder that runs supabase-js style calls
// (.from().select().eq()... and .rpc()) as SQL against a local database.
// Local demo mode only. It covers the subset of the API this app uses.

export type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }> };

export type Catalog = {
  columns: Map<string, Map<string, string>>; // table -> column -> SQL type
  fks: { table: string; column: string; ref: string; refColumn: string }[];
  pkeys: Map<string, string[]>;
  functions: Map<string, { args: { name: string; type: string }[]; returnsSet: boolean }>;
};

export type PgError = { message: string; code: string; details: string | null; hint: string | null };
export type PgResponse<T = unknown> = { data: T | null; error: PgError | null; count: number | null; status: number; statusText: string };

export async function loadCatalog(db: SqlRunner): Promise<Catalog> {
  const columns = new Map<string, Map<string, string>>();
  const cols = await db.query(`
    select c.relname as t, a.attname as c, format_type(a.atttypid, a.atttypmod) as ty
    from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') and a.attnum > 0 and not a.attisdropped
    order by c.relname, a.attnum`);
  for (const row of cols.rows) {
    const t = String(row.t);
    if (!columns.has(t)) columns.set(t, new Map());
    columns.get(t)!.set(String(row.c), String(row.ty));
  }
  const fkRows = await db.query(`
    select c.relname as t, a.attname as c, rc.relname as r, ra.attname as rcol
    from pg_constraint k
    join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_class rc on rc.oid = k.confrelid
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
    join pg_attribute ra on ra.attrelid = k.confrelid and ra.attnum = k.confkey[1]
    where k.contype = 'f' and n.nspname = 'public' and array_length(k.conkey, 1) = 1`);
  const fks = fkRows.rows.map((row) => ({ table: String(row.t), column: String(row.c), ref: String(row.r), refColumn: String(row.rcol) }));
  const pkRows = await db.query(`
    select c.relname as t, array_agg(a.attname::text order by a.attnum) as cols
    from pg_constraint k join pg_class c on c.oid = k.conrelid join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey)
    where k.contype = 'p' and n.nspname = 'public' group by c.relname`);
  const pkeys = new Map(pkRows.rows.map((row) => [String(row.t), row.cols as string[]]));
  const fnRows = await db.query(`
    select p.proname as name, p.proretset as rs,
      coalesce(p.proargnames, '{}') as names,
      array(select format_type(x, null) from unnest(p.proargtypes) x) as types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  const functions = new Map<string, { args: { name: string; type: string }[]; returnsSet: boolean }>();
  for (const row of fnRows.rows) {
    const names = row.names as string[];
    const types = row.types as string[];
    functions.set(String(row.name), { returnsSet: Boolean(row.rs), args: types.map((type, i) => ({ name: names[i], type })) });
  }
  return { columns, fks, pkeys, functions };
}

// ---------- select string parsing ----------

export type SelectItem =
  | { kind: 'star' }
  | { kind: 'col'; name: string; alias: string | null }
  | { kind: 'embed'; key: string; name: string; hint: string | null; inner: boolean; children: SelectItem[] };

function splitTopLevel(input: string, separator = ','): string[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const ch of input) {
    if (ch === '"') quoted = !quoted;
    if (!quoted && ch === '(') depth += 1;
    if (!quoted && ch === ')') depth -= 1;
    if (!quoted && depth === 0 && ch === separator) {
      out.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current);
  return out.map((part) => part.trim()).filter(Boolean);
}

export function parseSelect(select: string): SelectItem[] {
  const items: SelectItem[] = [];
  for (const raw of splitTopLevel(select.replace(/\s+/g, ' '))) {
    const token = raw.trim();
    if (token === '*') {
      items.push({ kind: 'star' });
      continue;
    }
    const embed = token.match(/^(?:([\w]+)\s*:\s*)?([\w]+)((?:![\w]+)*)\s*\(([\s\S]*)\)$/);
    if (embed) {
      const mods = embed[3].split('!').filter(Boolean);
      items.push({
        kind: 'embed',
        key: embed[1] || embed[2],
        name: embed[2],
        inner: mods.includes('inner'),
        hint: mods.find((mod) => mod !== 'inner' && mod !== 'left') || null,
        children: parseSelect(embed[4].trim() || '*')
      });
      continue;
    }
    const col = token.match(/^(?:([\w]+)\s*:\s*)?([\w]+)(?:::[\w ]+)?$/);
    if (!col) throw new Error(`Unsupported select item: ${token}`);
    items.push({ kind: 'col', alias: col[1] || null, name: col[2] });
  }
  return items;
}

// ---------- filters ----------

type Filter =
  | { kind: 'op'; column: string; op: string; value: unknown; negate?: boolean }
  | { kind: 'or'; parts: Filter[] };

const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in', 'cs', 'cd']);

function parsePgrstList(value: string): string[] {
  const inner = value.trim().replace(/^\(/, '').replace(/\)$/, '');
  return splitTopLevel(inner).map((item) => item.replace(/^"(.*)"$/, '$1'));
}

/** Parses "col.op.value,col2.not.op.value" (PostgREST or syntax). */
export function parseOr(expression: string): Filter[] {
  return splitTopLevel(expression).map((part) => {
    const nested = part.match(/^(and|or)\(([\s\S]*)\)$/);
    if (nested) {
      if (nested[1] === 'or') return { kind: 'or', parts: parseOr(nested[2]) } as Filter;
      throw new Error('and() inside or() is not supported in demo mode');
    }
    const first = part.indexOf('.');
    const column = part.slice(0, first);
    let rest = part.slice(first + 1);
    let negate = false;
    if (rest.startsWith('not.')) {
      negate = true;
      rest = rest.slice(4);
    }
    const second = rest.indexOf('.');
    const op = rest.slice(0, second);
    const raw = rest.slice(second + 1);
    if (!OPS.has(op)) throw new Error(`Unsupported or() operator: ${op}`);
    const value = op === 'in' ? parsePgrstList(raw) : op === 'like' || op === 'ilike' ? raw.replace(/\*/g, '%') : raw.replace(/^"(.*)"$/, '$1');
    return { kind: 'op', column, op, value, negate };
  });
}

function pgArrayLiteral(values: unknown[]): string {
  return `{${values.map((value) => (value === null || value === undefined ? 'NULL' : `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)).join(',')}}`;
}

class SqlBuilder {
  params: unknown[] = [];
  aliasCount = 0;
  catalog: Catalog;
  constructor(catalog: Catalog) {
    this.catalog = catalog;
  }

  param(value: unknown, type: string | null): string {
    this.params.push(value);
    return type ? `$${this.params.length}::${type}` : `$${this.params.length}`;
  }

  alias() {
    this.aliasCount += 1;
    return `t${this.aliasCount}`;
  }

  colType(table: string, column: string): string {
    const type = this.catalog.columns.get(table)?.get(column);
    if (!type) throw new PgrstError(`column ${table}.${column} does not exist`, '42703');
    return type;
  }

  serialize(table: string, column: string, value: unknown): unknown {
    if (value === null || value === undefined) return null;
    const type = this.colType(table, column);
    if (type === 'json' || type === 'jsonb') return JSON.stringify(value);
    if (type.endsWith('[]')) return Array.isArray(value) ? pgArrayLiteral(value) : String(value);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  filterSql(table: string, alias: string, filter: Filter): string {
    if (filter.kind === 'or') {
      const parts = filter.parts.map((part) => this.filterSql(table, alias, part));
      return parts.length ? `(${parts.join(' or ')})` : 'false';
    }
    const type = this.colType(table, filter.column);
    const ref = `${alias}."${filter.column}"`;
    let sql: string;
    const value = filter.value;
    switch (filter.op) {
      case 'eq':
      case 'neq':
      case 'gt':
      case 'gte':
      case 'lt':
      case 'lte': {
        const sym = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[filter.op];
        sql = `${ref} ${sym} ${this.param(this.serialize(table, filter.column, value), type)}`;
        break;
      }
      case 'like':
      case 'ilike':
        sql = `${ref}::text ${filter.op} ${this.param(String(value), 'text')}`;
        break;
      case 'is': {
        const v = value === null || value === 'null' ? 'null' : String(value) === 'true' ? 'true' : String(value) === 'false' ? 'false' : 'unknown';
        sql = `${ref} is ${v}`;
        break;
      }
      case 'in': {
        const list = Array.isArray(value) ? value : parsePgrstList(String(value));
        sql = `${ref} = any(${this.param(pgArrayLiteral(list), `${type}[]`)})`;
        break;
      }
      case 'cs':
        sql = type === 'jsonb' ? `${ref} @> ${this.param(JSON.stringify(value), 'jsonb')}` : `${ref} @> ${this.param(Array.isArray(value) ? pgArrayLiteral(value) : String(value), type)}`;
        break;
      case 'cd':
        sql = type === 'jsonb' ? `${ref} <@ ${this.param(JSON.stringify(value), 'jsonb')}` : `${ref} <@ ${this.param(Array.isArray(value) ? pgArrayLiteral(value) : String(value), type)}`;
        break;
      default:
        throw new PgrstError(`Unsupported filter operator ${filter.op}`, 'PGRST100');
    }
    return filter.negate ? `not (${sql})` : sql;
  }

  resolveEmbed(parent: string, item: Extract<SelectItem, { kind: 'embed' }>) {
    const { fks } = this.catalog;
    // alias:fk_column(...) -> many-to-one through that column
    const viaColumn = fks.find((fk) => fk.table === parent && fk.column === item.name);
    if (viaColumn) return { type: 'm2o' as const, table: viaColumn.ref, localColumn: viaColumn.column, remoteColumn: viaColumn.refColumn };
    if (!this.catalog.columns.has(item.name)) throw new PgrstError(`Could not find a relationship between '${parent}' and '${item.name}'`, 'PGRST200');
    let outgoing = fks.filter((fk) => fk.table === parent && fk.ref === item.name);
    if (item.hint) outgoing = outgoing.filter((fk) => fk.column === item.hint);
    if (outgoing.length) {
      const preferred = outgoing.find((fk) => fk.column === `${item.name.replace(/s$/, '')}_id`) || outgoing[0];
      return { type: 'm2o' as const, table: item.name, localColumn: preferred.column, remoteColumn: preferred.refColumn };
    }
    let incoming = fks.filter((fk) => fk.table === item.name && fk.ref === parent);
    if (item.hint) incoming = incoming.filter((fk) => fk.column === item.hint);
    if (incoming.length) {
      return { type: 'o2m' as const, table: item.name, localColumn: incoming[0].refColumn, remoteColumn: incoming[0].column };
    }
    throw new PgrstError(`Could not find a relationship between '${parent}' and '${item.name}' in the schema cache`, 'PGRST200');
  }

  /** jsonb expression for one row of `table` aliased `alias`. */
  projection(table: string, alias: string, items: SelectItem[], embedFilters: Map<string, Filter[]>): { expr: string; innerConditions: string[] } {
    const parts: string[] = [];
    const innerConditions: string[] = [];
    if (items.some((item) => item.kind === 'star')) parts.push(`to_jsonb(${alias})`);
    for (const item of items) {
      if (item.kind === 'col') {
        this.colType(table, item.name);
        parts.push(`jsonb_build_object('${item.alias || item.name}', ${alias}."${item.name}")`);
      } else if (item.kind === 'embed') {
        const rel = this.resolveEmbed(table, item);
        const child = this.alias();
        const nestedFilters = new Map<string, Filter[]>();
        const own: Filter[] = [];
        for (const filter of embedFilters.get(item.key) || []) {
          if (filter.kind === 'op' && filter.column.includes('.')) {
            const [head, ...rest] = filter.column.split('.');
            const list = nestedFilters.get(head) || [];
            list.push({ ...filter, column: rest.join('.') });
            nestedFilters.set(head, list);
          } else own.push(filter);
        }
        const join = `${child}."${rel.remoteColumn}" = ${alias}."${rel.localColumn}"`;
        const childProjection = this.projection(rel.table, child, item.children, nestedFilters);
        const conditions = [join, ...own.map((filter) => this.filterSql(rel.table, child, filter)), ...childProjection.innerConditions];
        const where = conditions.join(' and ');
        const sub = rel.type === 'm2o'
          ? `(select ${childProjection.expr} from public."${rel.table}" ${child} where ${where} limit 1)`
          : `coalesce((select jsonb_agg(${childProjection.expr}) from public."${rel.table}" ${child} where ${where}), '[]'::jsonb)`;
        parts.push(`jsonb_build_object('${item.key}', ${sub})`);
        if (item.inner) {
          const existsAlias = this.alias();
          const existsProjection = this.projection(rel.table, existsAlias, item.children, nestedFilters);
          const existsConditions = [
            `${existsAlias}."${rel.remoteColumn}" = ${alias}."${rel.localColumn}"`,
            ...own.map((filter) => this.filterSql(rel.table, existsAlias, filter)),
            ...existsProjection.innerConditions
          ];
          innerConditions.push(`exists (select 1 from public."${rel.table}" ${existsAlias} where ${existsConditions.join(' and ')})`);
        }
      }
    }
    return { expr: parts.length ? parts.join(' || ') : `'{}'::jsonb`, innerConditions };
  }
}

export class PgrstError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

function toPgError(error: unknown): PgError {
  const e = error as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: e?.message || String(error), code: e?.code || 'XX000', details: e?.detail ?? null, hint: e?.hint ?? null };
}

type Op = 'select' | 'insert' | 'update' | 'upsert' | 'delete';

export class DemoQuery<T = unknown> implements PromiseLike<PgResponse<T>> {
  private op: Op = 'select';
  private selectString: string | null = null;
  private countMode: string | null = null;
  private headOnly = false;
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean; nullsFirst?: boolean }[] = [];
  private limitCount: number | null = null;
  private offsetCount: number | null = null;
  private singleMode: 'single' | 'maybe' | null = null;
  private values: Record<string, unknown>[] = [];
  private onConflict: string | null = null;
  private ignoreDuplicates = false;
  private shouldThrow = false;

  private getDb: () => Promise<{ db: SqlRunner; catalog: Catalog }>;
  private table: string;

  constructor(getDb: () => Promise<{ db: SqlRunner; catalog: Catalog }>, table: string) {
    this.getDb = getDb;
    this.table = table;
  }

  select(columns = '*', options: { count?: string; head?: boolean } = {}) {
    this.selectString = columns;
    if (options.count) this.countMode = options.count;
    if (options.head) this.headOnly = true;
    return this;
  }
  insert(values: Record<string, unknown> | Record<string, unknown>[], options: { count?: string } = {}) {
    this.op = 'insert';
    this.values = Array.isArray(values) ? values : [values];
    if (options.count) this.countMode = options.count;
    return this;
  }
  upsert(values: Record<string, unknown> | Record<string, unknown>[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.values = Array.isArray(values) ? values : [values];
    this.onConflict = options.onConflict || null;
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates);
    return this;
  }
  update(values: Record<string, unknown>) {
    this.op = 'update';
    this.values = [values];
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  private add(column: string, op: string, value: unknown, negate = false) {
    this.filters.push({ kind: 'op', column, op, value, negate });
    return this;
  }
  eq(column: string, value: unknown) { return this.add(column, 'eq', value); }
  neq(column: string, value: unknown) { return this.add(column, 'neq', value); }
  gt(column: string, value: unknown) { return this.add(column, 'gt', value); }
  gte(column: string, value: unknown) { return this.add(column, 'gte', value); }
  lt(column: string, value: unknown) { return this.add(column, 'lt', value); }
  lte(column: string, value: unknown) { return this.add(column, 'lte', value); }
  like(column: string, value: string) { return this.add(column, 'like', value); }
  ilike(column: string, value: string) { return this.add(column, 'ilike', value); }
  is(column: string, value: unknown) { return this.add(column, 'is', value); }
  in(column: string, values: unknown[]) { return this.add(column, 'in', values); }
  contains(column: string, value: unknown) { return this.add(column, 'cs', value); }
  containedBy(column: string, value: unknown) { return this.add(column, 'cd', value); }
  match(query: Record<string, unknown>) {
    for (const [column, value] of Object.entries(query)) this.eq(column, value);
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    const parsed = operator === 'in' && typeof value === 'string' ? parsePgrstList(value) : value;
    return this.add(column, operator, parsed, true);
  }
  filter(column: string, operator: string, value: unknown) {
    if (operator.startsWith('not.')) return this.not(column, operator.slice(4), value);
    const parsed = operator === 'in' && typeof value === 'string' ? parsePgrstList(value) : value;
    return this.add(column, operator, parsed);
  }
  or(expression: string, options: { foreignTable?: string; referencedTable?: string } = {}) {
    const parts = parseOr(expression);
    const prefix = options.referencedTable || options.foreignTable;
    this.filters.push({ kind: 'or', parts: prefix ? parts.map((part) => (part.kind === 'op' ? { ...part, column: `${prefix}.${part.column}` } : part)) : parts });
    return this;
  }
  order(column: string, options: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string } = {}) {
    if (options.foreignTable || options.referencedTable) return this; // embedded ordering: not needed by this app
    this.orders.push({ column, ascending: options.ascending !== false, nullsFirst: options.nullsFirst });
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  range(from: number, to: number) {
    this.offsetCount = from;
    this.limitCount = to - from + 1;
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }
  throwOnError() {
    this.shouldThrow = true;
    return this;
  }
  returns() { return this; }
  abortSignal() { return this; }

  then<R1 = PgResponse<T>, R2 = never>(onfulfilled?: ((value: PgResponse<T>) => R1 | PromiseLike<R1>) | null, onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null): Promise<R1 | R2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<PgResponse<T>> {
    let result: PgResponse<T>;
    try {
      result = await this.run();
    } catch (error) {
      result = { data: null, error: toPgError(error), count: null, status: 400, statusText: 'Bad Request' };
    }
    if (result.error && this.shouldThrow) throw Object.assign(new Error(result.error.message), result.error);
    return result;
  }

  private splitFilters() {
    const top: Filter[] = [];
    const embedded = new Map<string, Filter[]>();
    for (const filter of this.filters) {
      if (filter.kind === 'op' && filter.column.includes('.')) {
        const [head, ...rest] = filter.column.split('.');
        const list = embedded.get(head) || [];
        list.push({ ...filter, column: rest.join('.') });
        embedded.set(head, list);
      } else top.push(filter);
    }
    return { top, embedded };
  }

  private async run(): Promise<PgResponse<T>> {
    const { db, catalog } = await this.getDb();
    if (!catalog.columns.has(this.table)) throw new PgrstError(`relation "public.${this.table}" does not exist`, '42P01');
    const b = new SqlBuilder(catalog);
    const { top, embedded } = this.splitFilters();
    const items = parseSelect(this.selectString || '*');
    const base = 't0';

    let source: string; // FROM clause producing rows aliased t0
    let cte = '';
    let whereParts: string[] = [];

    if (this.op === 'select') {
      source = `public."${this.table}" ${base}`;
      whereParts = top.map((filter) => b.filterSql(this.table, base, filter));
    } else if (this.op === 'insert' || this.op === 'upsert') {
      const columns = [...new Set(this.values.flatMap((row) => Object.keys(row).filter((key) => row[key] !== undefined)))];
      for (const column of columns) b.colType(this.table, column);
      const rows = this.values.map((row) => `(${columns.map((column) => (row[column] === undefined ? 'default' : b.param(b.serialize(this.table, column, row[column]), b.colType(this.table, column)))).join(', ')})`);
      let sql = columns.length
        ? `insert into public."${this.table}" (${columns.map((c) => `"${c}"`).join(', ')}) values ${rows.join(', ')}`
        : `insert into public."${this.table}" default values`;
      if (this.op === 'upsert') {
        const conflict = this.onConflict ? this.onConflict.split(',').map((c) => c.trim()) : catalog.pkeys.get(this.table) || ['id'];
        const updatable = columns.filter((column) => !conflict.includes(column));
        sql += ` on conflict (${conflict.map((c) => `"${c}"`).join(', ')}) ` + (this.ignoreDuplicates || !updatable.length ? 'do nothing' : `do update set ${updatable.map((c) => `"${c}" = excluded."${c}"`).join(', ')}`);
      }
      cte = `with m as (${sql} returning *) `;
      source = `m ${base}`;
    } else if (this.op === 'update') {
      const values = this.values[0] || {};
      const columns = Object.keys(values).filter((key) => values[key] !== undefined);
      if (!columns.length) throw new PgrstError('Empty update', 'PGRST100');
      const sets = columns.map((column) => `"${column}" = ${b.param(b.serialize(this.table, column, values[column]), b.colType(this.table, column))}`);
      const where = top.map((filter) => b.filterSql(this.table, base, filter));
      cte = `with m as (update public."${this.table}" ${base} set ${sets.join(', ')}${where.length ? ` where ${where.join(' and ')}` : ''} returning ${base}.*) `;
      source = `m ${base}`;
    } else {
      const where = top.map((filter) => b.filterSql(this.table, base, filter));
      cte = `with m as (delete from public."${this.table}" ${base}${where.length ? ` where ${where.join(' and ')}` : ''} returning ${base}.*) `;
      source = `m ${base}`;
    }

    const projection = b.projection(this.table, base, items, embedded);
    whereParts.push(...projection.innerConditions);
    const where = whereParts.length ? ` where ${whereParts.join(' and ')}` : '';
    const order = this.orders.length
      ? ` order by ${this.orders.map((o) => { b.colType(this.table, o.column); return `${base}."${o.column}" ${o.ascending ? 'asc' : 'desc'}${o.nullsFirst === undefined ? '' : o.nullsFirst ? ' nulls first' : ' nulls last'}`; }).join(', ')}`
      : '';
    const limit = this.limitCount !== null ? ` limit ${Number(this.limitCount)}` : '';
    const offset = this.offsetCount !== null ? ` offset ${Number(this.offsetCount)}` : '';

    const mutating = this.op !== 'select';
    const returnRows = !mutating || this.selectString !== null;
    let count: number | null = null;

    if (mutating) {
      // Run the write once, then shape its returned rows.
      const sql = `${cte}select ${projection.expr} as row from ${source}${where}${order}${limit}${offset}`;
      const result = await db.query(sql, b.params);
      const rows = result.rows.map((row) => row.row);
      if (this.countMode) count = rows.length;
      if (!returnRows) return { data: null, error: null, count, status: this.op === 'insert' ? 201 : 204, statusText: 'OK' };
      return this.finish(rows, count);
    }

    if (this.countMode) {
      const countSql = `select count(*)::int as n from (select ${projection.expr} as row from ${source}${where}) counted`;
      const countResult = await db.query(countSql, b.params);
      count = Number(countResult.rows[0]?.n ?? 0);
    }
    if (this.headOnly) return { data: null, error: null, count, status: 200, statusText: 'OK' };
    const sql = `select ${projection.expr} as row from ${source}${where}${order}${limit}${offset}`;
    const result = await db.query(sql, b.params);
    return this.finish(result.rows.map((row) => row.row), count);
  }

  private finish(rows: unknown[], count: number | null): PgResponse<T> {
    if (this.singleMode) {
      if (rows.length === 1) return { data: rows[0] as T, error: null, count, status: 200, statusText: 'OK' };
      if (rows.length === 0 && this.singleMode === 'maybe') return { data: null, error: null, count, status: 200, statusText: 'OK' };
      return {
        data: null,
        error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null },
        count,
        status: 406,
        statusText: 'Not Acceptable'
      };
    }
    return { data: rows as T, error: null, count, status: 200, statusText: 'OK' };
  }
}

export async function runRpc(getDb: () => Promise<{ db: SqlRunner; catalog: Catalog }>, name: string, args: Record<string, unknown> = {}): Promise<PgResponse> {
  try {
    const { db, catalog } = await getDb();
    const fn = catalog.functions.get(name);
    if (!fn) throw new PgrstError(`Could not find the function public.${name} in the schema cache`, 'PGRST202');
    const params: unknown[] = [];
    const named = Object.entries(args)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        const type = fn.args.find((arg) => arg.name === key)?.type;
        if (!type) throw new PgrstError(`Could not find the function public.${name}(${Object.keys(args).join(', ')})`, 'PGRST202');
        params.push(value === null ? null : type === 'jsonb' || type === 'json' ? JSON.stringify(value) : typeof value === 'object' ? JSON.stringify(value) : String(value));
        return `"${key}" => $${params.length}::${type}`;
      });
    const result = await db.query(`select to_jsonb(public."${name}"(${named.join(', ')})) as v`, params);
    const values = result.rows.map((row) => row.v);
    return { data: fn.returnsSet ? values : values[0] ?? null, error: null, count: null, status: 200, statusText: 'OK' };
  } catch (error) {
    return { data: null, error: toPgError(error), count: null, status: 400, statusText: 'Bad Request' };
  }
}
