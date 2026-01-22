# Manifest — Ordsøk PWA

## Purpose
Ordsøk is a PWA for evaluating grouped word lists ("wordbags") against a corpus
of up to 50,000 documents from NB dhlab.

## Target Users
- Researchers and editors exploring themes, style norms, and term usage over time.
- Curious non-programmers who can define word lists and interpret results.

## Core Flows
1. **Build corpus** from metadata via `POST https://api.nb.no/dhlab/build_corpus`.
2. **Define wordbags** (topic → list of words).
3. **Evaluate corpus** via `POST https://api.nb.no/dhlab/evaluate`.
4. **Inspect results** per document or aggregated per year.

## Inputs / Outputs
- **Inputs**
  - Metadata query string or `field: value` pairs.
  - CSV/TXT upload with `urn` and optional `dhlabid`, `authors`, `title`, `year`.
  - Wordbags as editable rows or JSON upload.
- **Outputs**
  - Per-document table (topic counts, totals, metadata).
  - Aggregated per-year table (topic × year, optional %).
  - CSV export of either view.
  - Lightweight line chart for aggregated view.

## Scope / Non‑Goals
- No backend service.
- No user authentication or persistent storage.
- No model training or embedding-based vector search.

## Quality Targets
- Handles 50k URNs without crashing.
- Aggregation and sorting complete within seconds for typical corpora.
- Works fully on GitHub Pages (static hosting).

## Success Criteria
- Non-developers can build a corpus, define wordbags, and read results.
- Results can be exported and reused in other tools.
- App can be regenerated from `manifest.md` + `architecture.md` + `quest.md`.

## Open Questions
- Rate limits or authentication requirements on NB dhlab APIs?
- Preferred UI language (Bokmål vs English)?

