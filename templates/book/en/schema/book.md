# Reading rules

For building a companion wiki while reading a book (Karpathy's example: a Tolkien-Gateway-style fan wiki, built for one reader). Runs alongside the base rules; this page wins on conflict.

- One raw source per chapter: `raw/sources/ch01-title.md` with front-matter `book`, `chapter`, `pages`. Quote with page numbers; your own reactions in a separate paragraph prefixed "→". Ingest each chapter as you finish it.
- `wiki/characters/`: one page per character — identity, relationships, motives, appearances, how they change (in chapter order).
- `wiki/themes/`: one page per theme or motif — definition, where it appears (linked to chapters), how it evolves.
- `wiki/plot.md`: timeline by chapter, each entry linked to its source. `wiki/places.md`: settings and world-building.
- No spoilers: write only from chapters read; never consult outside material or predict. When a later chapter overturns an earlier reading, mark "⚠ revised (ch. N)" and keep the old reading.
- After finishing: run Lint, then write `wiki/synthesis.md`.
