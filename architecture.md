# Architecture — Ordsøk PWA

## Regen Brief
Input: `manifest.md` + `architecture.md` + `quest.md`  
Output: a working PWA in `/docs` with the described features and API wiring.  
Constraints: no backend, NB dhlab APIs only, GitHub Pages hosting.

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
     - `corpusMetaByUrn` (fallback when CSV provides only URN)
2. **Wordbags**
   - Editable rows: name + words list.
   - Export/Import as JSON.
   - Normalized into `Record<string, string[]>`.
3. **Evaluate**
   - Request: `POST https://api.nb.no/dhlab/evaluate` with `{ urns, wordbags }`.
   - Response: object keyed by `dhlabid` with topic counts.
   - Client computes `total` per row and joins corpus metadata by `dhlabid`.
   - Table supports sorting, threshold filtering, paging (per-document).
   - Aggregation per year: pivot (rows=topics, cols=years), optional % per year.
   - Chart: inline SVG line chart (top 5 topics), legend toggles.

## API Endpoints
- `POST https://api.nb.no/dhlab/build_corpus`
  - JSON body supports filters such as:
    - `doctype`, `author`, `freetext`, `fulltext`, `from_year`, `to_year`,
      `from_timestamp`, `to_timestamp`, `title`, `ddk`, `subject`, `publisher`,
      `literaryform`, `genres`, `city`, `lang`, `limit`, `order_by`.
- `POST https://api.nb.no/dhlab/evaluate`
  - JSON body:
    - `urns: string[]`
    - `wordbags: Record<string, string[]>`

## Key Client Structures
- `corpusUrns: string[]`
- `corpusMetaById: Record<dhlabid, { title, authors, year, urn }>`
- `corpusMetaByUrn: Record<urn, { title, authors, year, dhlabid }>`
- `wordbags: { name, words[] }[]`
- `evaluateData: Record<dhlabid, Record<topic, count>>`
- `tableState: { sortKey, sortDir, totalThreshold, pageSize, pageIndex }`
- `aggregationState: { aggregateByYear, yearBinSize, aggregatePercent }`

## Parsing Notes
- `build_corpus` response may arrive in columnar form:
  - `urn: { "0": "URN:...", ... }`, `dhlabid: { "0": 123, ... }`, etc.
- Client extracts URNs and metadata from either columnar or row formats.
- CSV upload supports `urn`, `dhlabid` (or index/Unnamed: 0), `title`, `authors`, `year`.

## Performance Considerations
- Sorting is done client-side on full dataset (`O(n log n)`).
- Filtering by minimum total happens after sorting.
- Pagination is used for per-document view to reduce DOM load.

## Deployment
- GitHub Pages serves `/docs` (build output).
- `vite.config.ts` uses `base: './'` for relative asset paths.
