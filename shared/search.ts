import type { Snippet, Category } from './contracts'
export function searchSnippets(
  snippets: Snippet[],
  categories: Category[],
  query: string,
): Snippet[] {
  const q = query.trim().toLocaleLowerCase()
  const names = new Map(categories.map((c) => [c.id, c.name]))
  return snippets
    .map((snippet) => {
      const text =
        `${snippet.name} ${snippet.trigger} ${names.get(snippet.categoryId ?? '') ?? ''}`.toLocaleLowerCase()
      let score = snippet.favorite ? 2 : 0
      if (q) {
        if (text.includes(q)) score += 100 - text.indexOf(q) / 10
        else {
          let cursor = 0
          for (const ch of q) {
            const i = text.indexOf(ch, cursor)
            if (i < 0) return { snippet, score: -1 }
            cursor = i + 1
          }
          score += 10 - cursor / 100
        }
      }
      return { snippet, score }
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.snippet.name.localeCompare(b.snippet.name))
    .map((x) => x.snippet)
}
