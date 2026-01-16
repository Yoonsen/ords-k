# Architecture — Ordsøk PWA

## Overview
Client-only PWA built with Vite + React (TypeScript) and hosted on GitHub Pages.
All data is fetched directly from the NB dhlab API. No backend service.

## Runtime Components
- **UI (React):** single-page app with three steps (build corpus, wordbags, evaluate).
- **PWA shell:** `manifest.webmanifest` and `sw.js` for offline shell caching.
- **Build output:** `npm run build` writes to `/docs` for Pages hosting.

## Data Flow
1. **Build corpus**
   - Input: free-text or `field: value` pairs.
   - Request: `POST https://api.nb.no/dhlab/build_corpus`.
   - Response: corpus dataset including `urn`, `dhlabid`, `title`, `authors`, `year`.
   - Client extracts:
     - `urns[]` (for evaluate)
     - `corpusMetaById` (keyed by `dhlabid` for table join)
2. **Wordbags**
   - Editable rows: name + words list.
   - Export/Import as JSON.
   - Normalized into `Record<string, string[]>`.
3. **Evaluate**
   - Request: `POST https://api.nb.no/dhlab/evaluate` with `{ urns, wordbags }`.
   - Response: object keyed by `dhlabid` with topic counts.
   - Client computes `total` per row and joins corpus metadata by `dhlabid`.
   - Table supports sorting and threshold filtering.

## Key Client Structures
- `corpusUrns: string[]`
- `corpusMetaById: Record<dhlabid, { title, authors, year, urn }>`
- `wordbags: { name, words[] }[]`
- `evaluateData: Record<dhlabid, Record<topic, count>>`

## Parsing Notes
- `build_corpus` response may arrive in columnar form:
  - `urn: { "0": "URN:...", ... }`, `dhlabid: { "0": 123, ... }`, etc.
- Client extracts URNs and metadata from either columnar or row formats.

## Performance Considerations
- Sorting is done client-side on full dataset (`O(n log n)`).
- Filtering by minimum total happens after sorting.
- For large datasets, consider pagination or virtualization.

## Deployment
- GitHub Pages serves `/docs` (build output).
- `vite.config.ts` uses `base: './'` for relative asset paths.
