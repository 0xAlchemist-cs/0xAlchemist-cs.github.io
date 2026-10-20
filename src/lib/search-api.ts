// Compiled into /search-api/pagefind.js at build time. Keep dependency-free:
// the actual Pagefind bundle is loaded lazily below.
type SearchOptions = Record<string, unknown>;
type ResultData = {
  meta: Record<string, string>;
  sub_results?: Record<string, unknown>[];
  [key: string]: unknown;
};
type Result = {
  id: string;
  score: number;
  data: () => Promise<ResultData>;
  [key: string]: unknown;
};
type SearchResponse = {
  results: Result[];
  unfilteredResultCount: number;
  [key: string]: unknown;
};
interface Engine {
  options: (config: SearchOptions) => Promise<unknown>;
  filters: () => Promise<unknown>;
  search: (
    term: string | null,
    config?: SearchOptions,
  ) => Promise<SearchResponse>;
  preload: (term: string, config?: SearchOptions) => Promise<unknown>;
  mergeIndex: (path: string, config?: SearchOptions) => Promise<unknown>;
  destroy: () => Promise<unknown>;
}
let engine: Promise<Engine> | undefined;
function getEngine() {
  const path = '/pagefind/pagefind.js';
  return (engine ??= import(/* @vite-ignore */ path) as Promise<Engine>);
}

const hasHan = /\p{Script=Han}/u;
const spaceHan = (text: string) =>
  text
    .replace(/\u200b/g, '')
    .replace(/\p{Script=Han}/gu, ' $& ')
    .replace(/\s+/g, ' ')
    .trim();

export function searchTerms(term: string) {
  if (!hasHan.test(term)) return [term];
  const terms: string[] = [];
  for (const match of term.matchAll(/"([^"]+)"|(\S+)/g)) {
    if (match[1] !== undefined) {
      terms.push(`"${spaceHan(match[1])}"`);
      continue;
    }
    for (const chunk of match[2]!.match(
      /\p{Script=Han}+|[^\p{Script=Han}]+/gu,
    ) ?? []) {
      if (hasHan.test(chunk)) terms.push(`"${spaceHan(chunk)}"`);
      else if (/[\p{L}\p{N}]/u.test(chunk)) terms.push(chunk);
    }
  }
  return [...new Set(terms)];
}

function displayResult(result: Result): Result {
  return {
    ...result,
    data: async () => {
      const data = await result.data();
      const clean = (value: unknown) =>
        typeof value === 'string' ? value.replace(/\u200b/g, '') : value;
      return {
        ...data,
        meta: Object.fromEntries(
          Object.entries(data.meta).map(([key, value]) => [
            key,
            value.replace(/\u200b/g, ''),
          ]),
        ),
        sub_results: data.sub_results?.map((part) =>
          Object.fromEntries(
            Object.entries(part).map(([key, value]) => [key, clean(value)]),
          ),
        ),
      };
    },
  };
}

export async function search(term: string | null, config?: SearchOptions) {
  const api = await getEngine();
  const terms = term === null ? [null] : searchTerms(term);
  const responses = await Promise.all(
    (terms.length ? terms : ['']).map((part) => api.search(part, config)),
  );
  const first = responses[0]!;
  if (responses.length === 1)
    return { ...first, results: first.results.map(displayResult) };

  // Keep continuous Chinese phrases intact. Separate keywords may occur
  // anywhere; intersect IDs rather than creating one broad character query.
  const indexes = responses
    .slice(1)
    .map(
      (response) =>
        new Map(response.results.map((result) => [result.id, result])),
    );
  const excerptIndex = terms.findIndex(
    (part) => part !== null && hasHan.test(part),
  );
  const results: Result[] = [];
  for (const result of first.results) {
    const others = indexes.map((index) => index.get(result.id));
    if (others.some((entry) => !entry)) continue;
    const matches = [result, ...(others as Result[])];
    const source = matches[excerptIndex] ?? result;
    results.push(
      displayResult({
        ...source,
        score: matches.reduce((total, entry) => total + entry.score, 0),
      }),
    );
  }
  if (!config?.sort) results.sort((a, b) => b.score - a.score);
  return { ...first, results, unfilteredResultCount: results.length };
}
export async function options(config: SearchOptions) {
  return (await getEngine()).options(config);
}
export async function filters() {
  return (await getEngine()).filters();
}
export async function preload(term: string, config?: SearchOptions) {
  const api = await getEngine();
  return Promise.all(
    searchTerms(term).map((part) => api.preload(part, config)),
  );
}
export async function mergeIndex(path: string, config?: SearchOptions) {
  return (await getEngine()).mergeIndex(path, config);
}
export async function destroy() {
  if (engine) await (await engine).destroy();
  engine = undefined;
}
