# Editing rules (base)

This page is the CLAUDE.md of the whole knowledge base, following Karpathy's LLM Wiki pattern: **the human curates sources, asks questions and judges; the LLM does all the compiling and bookkeeping**. Call `get_instructions` before you write anything — it first lists sources that still need ingesting, then returns every page under schema/.

## Three layers

1. **raw/** holds immutable sources. New material lands here first with front-matter `source_type`, `fetched_at` and, when available, `source_url` and bibliography.
2. **wiki/** holds compiled pages that you maintain: source summaries, entity pages, concept pages, comparisons, syntheses. One topic per page; name pages by concept.
3. **schema/** holds the rules. Humans own this layer; suggest changes, do not rewrite it yourself.

## Two special pages

- **wiki/index.md** is the catalog: one line per page with a link and a one-line summary, grouped by category. Update it on every ingest; read it first when answering a question.
- **wiki/log.md** is the timeline: append-only, one entry per ingest / query / lint, always formatted `## [YYYY-MM-DD] ingest | title`.

## Three operations

**Ingest (do the whole sequence every time a source arrives)**
1. `read_note` the full source.
2. `search_notes` for related pages so you do not duplicate.
3. Write a summary page `wiki/sources/<name>.md` linking back to the source with `[[raw/sources/<file>]]`.
4. Update or create the related entity and concept pages (one source may touch 10–15 pages), citing the summary or source page.
5. Update `wiki/index.md` and append `## [date] ingest | title` to `wiki/log.md`.
6. When a source contradicts an existing page, mark "⚠ conflict" on both and list both sides; never pick silently.

**Query**: read index.md first, then the pages; cite pages in the answer. File valuable answers back into the wiki as new pages and log a `query` entry.

**Lint**: look for contradictions, stale claims, orphan pages, concepts without a page, missing cross-references. Report suggestions and log a `lint` entry.

## Writing rules

- Update existing pages with `update_note` and the `version` from `read_note`; on 409, re-edit from the current content.
