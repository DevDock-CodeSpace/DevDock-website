// Helpers for the text blocks and tables (BlockNode).

/** The editing id of a block's body: the node id is its heading. */
export const bodyEditId = (id: string) => `${id}:body`

/** A table row typed as `name type PK|FK`: the keys may come anywhere after the name. */
export function parseColumn(line: string) {
  const [name = '', ...rest] = line.trim().split(/\s+/)
  const keys = rest.filter((t) => /^(pk|fk)$/i.test(t)).map((t) => t.toUpperCase() as 'PK' | 'FK')
  const type = rest.filter((t) => !/^(pk|fk)$/i.test(t)).join(' ')
  return { name, type, keys }
}
