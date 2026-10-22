// The API returns at most 1000 rows per request (supabase/config.toml max_rows),
// and silently stops there. Lists that can grow past that — events above all —
// must be fetched page by page. The query must have a stable order (end it on
// a unique column such as id) so pages neither overlap nor skip rows.
const PAGE = 1000

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE) return out
  }
}
