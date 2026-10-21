import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file (see .env.example).'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// PostgREST caps a single response at the project's default max rows (1000)
// even when a query legitimately matches more. This pages through with
// .range() until a page comes back short, so every matching row is returned.
//
// buildQuery must be a function that returns a FRESH query each call (not a
// query object built once) and must end in a deterministic .order() with a
// unique tiebreaker column (e.g. id) so row order is stable across pages.
const PAGE_SIZE = 1000;

export async function fetchAllRows(buildQuery) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1);
    if (error) return { data: allRows, error };
    allRows = allRows.concat(data || []);
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: allRows, error: null };
}

// A .in(column, ids) filter puts every id directly in the request URL, so a
// large id list can exceed the server's URL length limit and 400 the whole
// request. This chunks the id list into smaller .in() queries.
//
// buildQuery must be a function returning a fresh query that has NOT already
// called .in() for this column.
const ID_CHUNK_SIZE = 150;

export async function fetchAllRowsByIds(buildQuery, idColumn, ids) {
  let allRows = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + ID_CHUNK_SIZE);
    const { data, error } = await fetchAllRows(() => buildQuery().in(idColumn, chunk));
    if (error) return { data: allRows, error };
    allRows = allRows.concat(data || []);
  }
  return { data: allRows, error: null };
}
