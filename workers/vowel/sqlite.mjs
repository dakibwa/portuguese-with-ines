/** The booking handlers' D1 interface, backed by one tutor's SQLite object. */
export function sqliteDatabase(storage) {
  const execute = (query, values = []) => {
    const cursor = storage.sql.exec(
      query,
      ...values.map((value) =>
        typeof value === "boolean" ? Number(value) : value,
      ),
    );
    const results = cursor.toArray();
    const meta = storage.sql
      .exec("SELECT changes() AS changes, last_insert_rowid() AS last_row_id")
      .toArray()[0];
    return { success: true, results, meta };
  };
  return {
    prepare(query) {
      const statement = {
        values: [],
        bind(...values) {
          return { ...statement, values };
        },
        execute() {
          return execute(query, this.values);
        },
        async first(column) {
          const row = this.execute().results[0] ?? null;
          return column && row ? row[column] : row;
        },
        async all() {
          return this.execute();
        },
        async run() {
          return this.execute();
        },
      };
      return statement;
    },
    async batch(statements) {
      return storage.transactionSync(() =>
        statements.map((statement) => statement.execute()),
      );
    },
    async exec(query) {
      storage.transactionSync(() => storage.sql.exec(query).toArray());
      return { count: 1 };
    },
  };
}
