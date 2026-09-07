# Researcher rules

For writing papers and literature reviews. Runs alongside the base rules; this page wins on conflict.

- One raw source per paper. Front-matter must include `doi` (or `url`), `authors`, `year`, `title`, `venue`; add `citation_key` when possible.
- Quote with page numbers; put your own reading in a separate paragraph prefixed with "→".
- `wiki/concepts/`: one term per page, definition first, then how sources differ.
- `wiki/arguments/`: one falsifiable claim per page with the fixed structure claim / evidence / counter-evidence / current judgement, every item linked to a source page.
- Cite in wiki pages as `[@citation_key]` (several: `[@a; @b]`; with a locator: `[@a, p. 12]`). The system renders (Author, Year) linked to the source page and appends a reference list; the exported Markdown and .bib work with pandoc as-is. Fall back to a plain `[[raw/sources/<file>]]` link only when the source has no citation_key. Never invent bibliography that is not in raw/.
