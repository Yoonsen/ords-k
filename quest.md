# Quest — Ordsøk

## Current Goal
Keep the app reproducible from `manifest.md` + `architecture.md` + `quest.md`.

## Next Steps
- Add short “how to use” copy on the front page (3–5 bullets).
- Add export of aggregated chart data as CSV (per-year series).
- Consider column virtualization if >50k rows becomes slow.

## Recent Decisions
- Keep the UI self-contained (no chart library).
- Use GitHub Pages `/docs` with `base: './'`.

## Open Questions
- Do we need XLSX export in addition to CSV?
- Should per-document table default to paging for large corpora?
