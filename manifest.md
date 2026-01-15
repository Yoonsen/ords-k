# Manifest — NB dhlab PWA

## Purpose
Build a PWA that uses the National Library (NB) dhlab APIs to:
- create a corpus (up to 50,000 books) from metadata
- evaluate grouped word lists ("wordbags") against that corpus

The app runs on GitHub Pages and is built into the `/docs` folder.

## Core Flows
1. **Build corpus** from metadata via `POST https://api.nb.no/dhlab/build_corpus`.
2. **Define wordbags** (dictionary of topic → list of words).
3. **Evaluate corpus** via `POST https://api.nb.no/dhlab/evaluate` with URNs and wordbags.

## API Interfaces
### Evaluate
**Endpoint:** `POST https://api.nb.no/dhlab/evaluate`  
**Body (JSON):**
```json
{
  "urns": [
    "URN:NBN:no-nb_digibok_2008051404065",
    "URN:NBN:no-nb_digibok_2010092120011"
  ],
  "wordbags": {
    "natur": ["planter", "skog", "fjell", "fjord"]
  }
}
```
**Result:** counts aggregated per topic per document.

### Build Corpus
**Endpoint:** `POST https://api.nb.no/dhlab/build_corpus`  
**Body (JSON):** metadata filters (at least one field required)
```json
{
  "doctype": "digibok",
  "author": "Ibsen",
  "from_year": 1880,
  "to_year": 1900,
  "lang": "nob",
  "limit": 100,
  "order_by": "rank"
}
```
**Result:** corpus list including document IDs / URNs.

## Data Model (Client)
- **Corpus:** list of URNs (max 50,000)
- **Wordbags:** `Record<string, string[]>`
- **Evaluation result:** table keyed by document id (URN or dhlab id) with topic counts

## PWA / Deployment
- **Hosting:** GitHub Pages
- **Build output folder:** `/docs`
- **Offline considerations:** optional cache of UI + last results (no API caching implied)

## Assumptions
- API is accessible from client-side fetch (CORS OK).
- User provides valid URNs or metadata filters.
- Evaluation response fits browser memory for 50k documents.

## Open Questions
- Exact shape of `evaluate` response (URN vs dhlab id keys).
- Authentication or rate limits?
- Preferred UI language: Norwegian (Bokmål) by default?

