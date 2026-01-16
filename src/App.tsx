import { useMemo, useState } from 'react'
import './App.css'

type Wordbag = {
  id: string
  name: string
  words: string[]
  wordsText: string
}

type CorpusMeta = {
  dhlabid?: string
  urn?: string
  title?: string
  authors?: string
  year?: string
}

type TableRow = {
  id: string
  values: Record<string, number>
  total: number
}

type ColumnDef = {
  key: string
  label: string
  kind: 'count' | 'percent'
  year?: string
}

const MAX_CORPUS = 50000

const parseWordList = (value: string) =>
  value
    .split(/[,;\n]+/g)
    .map((item) => item.trim())
    .filter(Boolean)

const parseCorpusText = (text: string) => {
  const lines = text.split(/\r?\n/)
  const urns: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const tokens = trimmed.split(/[;,|\t]/g).map((token) => token.trim())
    const urnToken = tokens.find((token) => token.toUpperCase().startsWith('URN:'))
    urns.push(urnToken ?? trimmed)
  }

  const unique = Array.from(new Set(urns)).slice(0, MAX_CORPUS)
  return unique
}

const parseBuildQuery = (input: string) => {
  const trimmed = input.trim()
  if (!trimmed) return null

  const allowedKeys = new Set([
    'doctype',
    'author',
    'freetext',
    'fulltext',
    'from_year',
    'to_year',
    'from_timestamp',
    'to_timestamp',
    'title',
    'ddk',
    'subject',
    'publisher',
    'literaryform',
    'genres',
    'city',
    'lang',
    'limit',
    'order_by',
  ])

  const tokens = trimmed.split(/[,;\n]+/g).map((token) => token.trim())
  const params: Record<string, string | number> = {}

  tokens.forEach((token) => {
    const match = token.match(/^([a-zA-Z_]+)\s*[:=]\s*(.+)$/)
    if (!match) return
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (!allowedKeys.has(key)) return

    if (
      key === 'from_year' ||
      key === 'to_year' ||
      key === 'from_timestamp' ||
      key === 'to_timestamp' ||
      key === 'limit'
    ) {
      const num = Number(value)
      if (!Number.isNaN(num)) {
        params[key] = num
        return
      }
    }
    params[key] = value
  })

  if (Object.keys(params).length) {
    return params
  }

  return { freetext: trimmed }
}

const normalizeAuthors = (value: unknown) => {
  if (Array.isArray(value)) {
    return value.map(String).join(', ')
  }
  if (typeof value === 'string') return value
  return undefined
}

const parseCorpusResponse = (data: unknown) => {
  const urns: string[] = []
  const metaByDhlabId: Record<string, CorpusMeta> = {}

  if (!data || typeof data !== 'object') {
    return { urns, metaByDhlabId }
  }

  if (Array.isArray(data)) {
    data.forEach((item) => {
      if (!item || typeof item !== 'object') return
      const record = item as Record<string, unknown>
      const dhlabid = record.dhlabid ?? record.dhlabId ?? record.id
      const urn = record.urn ?? record.URN
      const title = record.title
      const authors = record.authors
      const year = record.year

      const dhlabidStr = typeof dhlabid === 'number' ? String(dhlabid) : (dhlabid as string)
      if (typeof urn === 'string' && urn.toUpperCase().startsWith('URN:')) {
        urns.push(urn)
      }
      if (dhlabidStr) {
        metaByDhlabId[dhlabidStr] = {
          dhlabid: dhlabidStr,
          urn: typeof urn === 'string' ? urn : undefined,
          title: typeof title === 'string' ? title : undefined,
          authors: normalizeAuthors(authors),
          year: typeof year === 'number' ? String(year) : (year as string | undefined),
        }
      }
    })

    return { urns: Array.from(new Set(urns)).slice(0, MAX_CORPUS), metaByDhlabId }
  }

  const record = data as Record<string, unknown>
  const dhlabidColumn = record.dhlabid
  const urnColumn = record.urn ?? record.URN
  const titleColumn = record.title
  const authorsColumn = record.authors
  const yearColumn = record.year

  if (
    dhlabidColumn &&
    typeof dhlabidColumn === 'object' &&
    !Array.isArray(dhlabidColumn)
  ) {
    const indices = new Set<string>(Object.keys(dhlabidColumn as Record<string, unknown>))
    if (urnColumn && typeof urnColumn === 'object' && !Array.isArray(urnColumn)) {
      Object.keys(urnColumn as Record<string, unknown>).forEach((key) => indices.add(key))
    }
    Object.keys((titleColumn as Record<string, unknown>) || {}).forEach((key) =>
      indices.add(key),
    )
    Object.keys((authorsColumn as Record<string, unknown>) || {}).forEach((key) =>
      indices.add(key),
    )
    Object.keys((yearColumn as Record<string, unknown>) || {}).forEach((key) => indices.add(key))

    indices.forEach((index) => {
      const dhlabid = (dhlabidColumn as Record<string, unknown>)[index]
      const urn = (urnColumn as Record<string, unknown> | undefined)?.[index]
      const title = (titleColumn as Record<string, unknown> | undefined)?.[index]
      const authors = (authorsColumn as Record<string, unknown> | undefined)?.[index]
      const year = (yearColumn as Record<string, unknown> | undefined)?.[index]

      const dhlabidStr = typeof dhlabid === 'number' ? String(dhlabid) : (dhlabid as string)
      if (typeof urn === 'string' && urn.toUpperCase().startsWith('URN:')) {
        urns.push(urn)
      }
      if (dhlabidStr) {
        metaByDhlabId[dhlabidStr] = {
          dhlabid: dhlabidStr,
          urn: typeof urn === 'string' ? urn : undefined,
          title: typeof title === 'string' ? title : undefined,
          authors: normalizeAuthors(authors),
          year: typeof year === 'number' ? String(year) : (year as string | undefined),
        }
      }
    })
  }

  return { urns: Array.from(new Set(urns)).slice(0, MAX_CORPUS), metaByDhlabId }
}

function App() {
  const [buildQuery, setBuildQuery] = useState('')
  const [corpusUrns, setCorpusUrns] = useState<string[]>([])
  const [corpusFileName, setCorpusFileName] = useState<string | null>(null)
  const [corpusMessage, setCorpusMessage] = useState<string>('')
  const [corpusApiStatus, setCorpusApiStatus] = useState<string>('')
  const [corpusApiRaw, setCorpusApiRaw] = useState<string>('')
  const [corpusMetaById, setCorpusMetaById] = useState<Record<string, CorpusMeta>>({})

  const [wordbags, setWordbags] = useState<Wordbag[]>([])
  const [wordbagMessage, setWordbagMessage] = useState<string>('')
  const [evaluateStatus, setEvaluateStatus] = useState<string>('')
  const [evaluateRaw, setEvaluateRaw] = useState<string>('')
  const [evaluateData, setEvaluateData] = useState<Record<string, Record<string, number>> | null>(
    null,
  )
  const [sortKey, setSortKey] = useState<string>('total')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [totalThreshold, setTotalThreshold] = useState<number>(0)
  const [evaluateDurationMs, setEvaluateDurationMs] = useState<number | null>(null)
  const [aggregateByYear, setAggregateByYear] = useState<boolean>(false)
  const [yearBinSize, setYearBinSize] = useState<number>(1)
  const [aggregatePercent, setAggregatePercent] = useState<boolean>(false)

  const wordbagJson = useMemo(() => {
    const obj: Record<string, string[]> = {}
    wordbags.forEach((bag) => {
      const name = bag.name.trim()
      if (!name) return
      obj[name] = bag.words
    })
    return obj
  }, [wordbags])

  const handleBuildCorpus = async () => {
    if (!buildQuery.trim()) {
      setCorpusMessage('Legg inn et enkelt metadatafilter først.')
      return
    }
    const parsed = parseBuildQuery(buildQuery)
    if (!parsed) {
      setCorpusMessage('Legg inn et enkelt metadatafilter først.')
      return
    }
    setCorpusMessage('')
    setCorpusApiStatus('Bygger korpus...')
    setCorpusApiRaw('')
    try {
      const response = await fetch('https://api.nb.no/dhlab/build_corpus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      setCorpusApiRaw(JSON.stringify(data, null, 2))
      const parsedCorpus = parseCorpusResponse(data)
      setCorpusMetaById(parsedCorpus.metaByDhlabId)
      const urns = parsedCorpus.urns
      if (urns.length) {
        setCorpusUrns(urns)
        setCorpusApiStatus(`Korpus bygget (${urns.length} URN-er).`)
      } else {
        setCorpusApiStatus('Korpus bygget, men fant ingen URN-er i svaret.')
      }
    } catch (error) {
      setCorpusApiStatus('Feil ved bygging av korpus.')
      setCorpusApiRaw(String(error))
    }
  }

  const handleCorpusFile = (file?: File | null) => {
    if (!file) return
    setCorpusMessage('')
    setCorpusFileName(file.name)

    if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
      setCorpusMessage('Støtter foreløpig kun CSV/TXT for import av URN-lister.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      const parsed = parseCorpusText(text)
      setCorpusUrns(parsed)
      setCorpusMessage(
        parsed.length
          ? `Importerte ${parsed.length} URN-er.`
          : 'Ingen URN-er funnet i filen.',
      )
    }
    reader.onerror = () => {
      setCorpusMessage('Kunne ikke lese filen.')
    }
    reader.readAsText(file)
  }

  const addWordbag = () => {
    const newEntry: Wordbag = {
      id: crypto.randomUUID(),
      name: '',
      words: [],
      wordsText: '',
    }
    setWordbags((prev) => [...prev, newEntry])
  }

  const removeWordbag = (id: string) => {
    setWordbags((prev) => prev.filter((bag) => bag.id !== id))
  }

  const updateWordbagName = (id: string, value: string) => {
    setWordbags((prev) =>
      prev.map((bag) => (bag.id === id ? { ...bag, name: value } : bag)),
    )
  }

  const updateWordbagWords = (id: string, value: string) => {
    const words = parseWordList(value)
    setWordbags((prev) =>
      prev.map((bag) =>
        bag.id === id ? { ...bag, words, wordsText: value } : bag,
      ),
    )
  }

  const downloadWordbags = () => {
    const blob = new Blob([JSON.stringify(wordbagJson, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'wordbags.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const importWordbags = (file?: File | null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? '{}'))
        let next: Wordbag[] = []
        if (Array.isArray(parsed)) {
          next = parsed
            .filter((item) => item?.name && Array.isArray(item.words))
            .map((item) => ({
              id: crypto.randomUUID(),
              name: String(item.name),
              words: item.words.map((word: string) => String(word)),
              wordsText: item.words.map((word: string) => String(word)).join(', '),
            }))
        } else if (parsed && typeof parsed === 'object') {
          next = Object.entries(parsed).map(([name, words]) => ({
            id: crypto.randomUUID(),
            name,
            words: Array.isArray(words) ? words.map(String) : [],
            wordsText: Array.isArray(words) ? words.map(String).join(', ') : '',
          }))
        }
        setWordbags(next.filter((bag) => bag.words.length > 0 && bag.name.trim()))
        setWordbagMessage('Wordbags importert.')
      } catch (error) {
        setWordbagMessage('Kunne ikke lese JSON-filen.')
      }
    }
    reader.onerror = () => {
      setWordbagMessage('Kunne ikke lese filen.')
    }
    reader.readAsText(file)
  }

  const handleEvaluate = async () => {
    if (!corpusUrns.length) {
      setEvaluateStatus('Legg inn eller bygg et korpus først.')
      return
    }
    if (!Object.keys(wordbagJson).length) {
      setEvaluateStatus('Legg inn minst én wordbag.')
      return
    }
    setEvaluateStatus('Evaluerer korpus...')
    setEvaluateRaw('')
    setEvaluateData(null)
    setEvaluateDurationMs(null)
    try {
      const start = performance.now()
      const response = await fetch('https://api.nb.no/dhlab/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urns: corpusUrns, wordbags: wordbagJson }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = (await response.json()) as Record<string, Record<string, number>>
      const duration = performance.now() - start
      setEvaluateRaw(JSON.stringify(data, null, 2))
      setEvaluateData(data)
      setEvaluateDurationMs(duration)
      setEvaluateStatus('Evaluering fullført.')
    } catch (error) {
      setEvaluateStatus('Feil ved evaluering.')
      setEvaluateRaw(String(error))
    }
  }

  const evaluationTable = useMemo(() => {
    if (!evaluateData) return null
    const rows = Object.entries(evaluateData)
    const topicSet = new Set<string>()
    rows.forEach(([, topics]) => {
      Object.keys(topics || {}).forEach((key) => topicSet.add(key))
    })
    const topics = Array.from(topicSet).sort()
    const rowsWithTotals = rows.map(([docId, topics]) => {
      const total = Object.values(topics || {}).reduce(
        (sum, value) => sum + (typeof value === 'number' ? value : 0),
        0,
      )
      return { docId, topics, total }
    })

    const metaLookup = corpusMetaById
    const binSize = Math.max(1, Math.floor(yearBinSize || 1))
    const yearBins = new Map<string, { sortValue: number }>()

    const getYearLabel = (docId: string) => {
      const yearValue = Number(metaLookup[docId]?.year)
      const hasYear = !Number.isNaN(yearValue) && Number.isFinite(yearValue)
      if (!hasYear) {
        yearBins.set('Ukjent', { sortValue: -1 })
        return 'Ukjent'
      }
      const start = Math.floor(yearValue / binSize) * binSize
      const label = binSize > 1 ? `${start}-${start + binSize - 1}` : `${start}`
      yearBins.set(label, { sortValue: start })
      return label
    }

    if (aggregateByYear) {
      const topicRows: TableRow[] = topics.map((topic) => ({
        id: topic,
        values: {},
        total: 0,
      }))
      const rowMap = new Map<string, TableRow>(topicRows.map((row) => [row.id, row]))
      const yearTotals = new Map<string, number>()

      rowsWithTotals.forEach((row) => {
        const label = getYearLabel(row.docId)
        Object.entries(row.topics || {}).forEach(([topic, value]) => {
          const currentRow = rowMap.get(topic)
          if (!currentRow) return
          const increment = typeof value === 'number' ? value : 0
          currentRow.values[label] = (currentRow.values[label] ?? 0) + increment
          currentRow.total += increment
          yearTotals.set(label, (yearTotals.get(label) ?? 0) + increment)
        })
      })

      const yearLabels = Array.from(yearBins.entries())
        .sort((a, b) => a[1].sortValue - b[1].sortValue)
        .map(([label]) => label)

      const columnDefs: ColumnDef[] = []
      yearLabels.forEach((label) => {
        columnDefs.push({ key: `${label}__count`, label, kind: 'count', year: label })
        if (aggregatePercent) {
          columnDefs.push({
            key: `${label}__percent`,
            label: `${label} %`,
            kind: 'percent',
            year: label,
          })
        }
      })

      const sorted = [...topicRows].sort((a, b) => {
        const direction = sortDir === 'asc' ? 1 : -1
        if (sortKey === 'row') {
          return direction * a.id.localeCompare(b.id, 'nb')
        }
        if (sortKey === 'total') {
          return direction * (a.total - b.total)
        }
        const column = columnDefs.find((def) => def.key === sortKey)
        if (column?.kind === 'count') {
          const aValue = a.values[column.year ?? ''] ?? 0
          const bValue = b.values[column.year ?? ''] ?? 0
          return direction * (aValue - bValue)
        }
        if (column?.kind === 'percent') {
          const denomA = yearTotals.get(column.year ?? '') ?? 0
          const denomB = yearTotals.get(column.year ?? '') ?? 0
          const aValue = denomA > 0 ? (a.values[column.year ?? ''] ?? 0) / denomA : 0
          const bValue = denomB > 0 ? (b.values[column.year ?? ''] ?? 0) / denomB : 0
          return direction * (aValue - bValue)
        }
        return 0
      })

      const filtered =
        totalThreshold > 0
          ? sorted.filter((row) => row.total >= totalThreshold)
          : sorted

      return {
        mode: 'topics',
        rows: filtered,
        columns: columnDefs,
        totalRows: topicRows.length,
        yearTotals,
      }
    }

    const docRows: TableRow[] = rowsWithTotals.map((row) => ({
      id: row.docId,
      values: row.topics || {},
      total: row.total,
    }))

    const sorted = [...docRows].sort((a, b) => {
      const direction = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'dhlabid' || sortKey === 'row') {
        return direction * a.id.localeCompare(b.id, 'nb')
      }
      if (sortKey === 'total') {
        return direction * (a.total - b.total)
      }
      if (sortKey === 'title' || sortKey === 'authors') {
        const aValue = metaLookup[a.id]?.[sortKey] ?? ''
        const bValue = metaLookup[b.id]?.[sortKey] ?? ''
        return direction * aValue.localeCompare(bValue, 'nb')
      }
      if (sortKey === 'year') {
        const aValue = Number(metaLookup[a.id]?.year ?? 0)
        const bValue = Number(metaLookup[b.id]?.year ?? 0)
        return direction * (aValue - bValue)
      }
      if (topics.includes(sortKey)) {
        const aValue = a.values?.[sortKey] ?? 0
        const bValue = b.values?.[sortKey] ?? 0
        return direction * (aValue - bValue)
      }
      return 0
    })

    const filtered =
      totalThreshold > 0 ? sorted.filter((row) => row.total >= totalThreshold) : sorted

    return {
      mode: 'docs',
      rows: filtered,
      columns: topics.map(
        (topic) => ({ key: topic, label: topic, kind: 'count' } as ColumnDef),
      ),
      totalRows: docRows.length,
    }
  }, [
    evaluateData,
    corpusMetaById,
    sortKey,
    sortDir,
    totalThreshold,
    aggregateByYear,
    yearBinSize,
    aggregatePercent,
  ])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'title' || key === 'authors' || key === 'dhlabid' ? 'asc' : 'desc')
  }

  const sortLabel = sortDir === 'asc' ? '↑' : '↓'

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Ordsøk</h1>
          <p className="tagline">
            PWA for å bygge korpus og telle grupperte ord i NB dhlab.
          </p>
        </div>
        <span className="status-pill">Beta</span>
      </header>

      <section className="card">
        <h2>1. Bygg eller importer korpus</h2>
        <p>
          Bruk et enkelt metadatafilter og bygg et korpus med inntil
          50&nbsp;000 dokumenter. Du kan skrive fritekst, eller bruke
          <code>felt: verdi</code> (f.eks. <code>author: Ibsen</code>,
          <code>from_year: 1880</code>, <code>to_year: 1900</code>,
          <code>doctype: digibok</code>). Alternativt kan du laste opp en
          URN-liste fra CSV/TXT.
        </p>

        <div className="grid">
          <label className="field">
            <span>Metadata / søk</span>
            <input
              type="text"
              placeholder="freetext eller felt: verdi (author: Ibsen, from_year: 1880)"
              value={buildQuery}
              onChange={(event) => setBuildQuery(event.target.value)}
            />
          </label>
          <div className="field actions">
            <span>&nbsp;</span>
            <button type="button" onClick={handleBuildCorpus}>
              Bygg korpus
            </button>
          </div>
        </div>

        <div className="grid">
          <label className="field">
            <span>Importer URN-liste</span>
            <input
              type="file"
              accept=".csv,.txt"
              onChange={(event) => handleCorpusFile(event.target.files?.[0])}
            />
          </label>
          <div className="field">
            <span>Status</span>
            <div className="status-box">
              {corpusMessage || 'Ingen import gjennomført ennå.'}
            </div>
          </div>
        </div>

        {corpusApiStatus && (
          <div className="status-box" role="status">
            {corpusApiStatus}
          </div>
        )}

        {corpusApiRaw && (
          <details className="details">
            <summary>Vis rårespons</summary>
            <pre>{corpusApiRaw}</pre>
          </details>
        )}

        <div className="summary-row">
          <div>
            <strong>Aktiv korpus</strong>
            <span>{corpusUrns.length} URN-er</span>
          </div>
          <div>
            <strong>Fil</strong>
            <span>{corpusFileName ?? 'Ikke lastet opp'}</span>
          </div>
        </div>
      </section>

      <section className="card">
        <h2>2. Lag wordbags</h2>
        <p>
          Legg til tema og ordlister (separert med komma eller linjeskift). Du kan
          også importere eller laste ned definisjonene som JSON.
        </p>

        <div className="actions-row">
          <button type="button" onClick={addWordbag}>
            Ny wordbag
          </button>
          <div className="actions-secondary">
            <label className="file-button">
              Last opp JSON
              <input
                type="file"
                accept="application/json"
                onChange={(event) => importWordbags(event.target.files?.[0])}
              />
            </label>
            <button type="button" onClick={downloadWordbags} disabled={!wordbags.length}>
              Last ned JSON
            </button>
          </div>
        </div>

        {wordbagMessage && <div className="status-box">{wordbagMessage}</div>}

        <div className="list">
          {wordbags.length ? (
            wordbags.map((bag, index) => (
              <div className="list-item wordbag-row" key={bag.id}>
                <div className="wordbag-meta">
                  <span className="wordbag-index">#{index + 1}</span>
                  <span>{bag.words.length} ord</span>
                </div>
                <label className="field">
                  <span>Vektornavn</span>
                  <input
                    type="text"
                    placeholder="Eksempel: natur"
                    value={bag.name}
                    onChange={(event) => updateWordbagName(bag.id, event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Ord</span>
                  <textarea
                    rows={3}
                    placeholder="planter, skog, fjell, fjord"
                    value={bag.wordsText}
                    onChange={(event) => updateWordbagWords(bag.id, event.target.value)}
                  />
                </label>
                <button type="button" onClick={() => removeWordbag(bag.id)}>
                  Fjern
                </button>
              </div>
            ))
          ) : (
            <div className="empty">Ingen wordbags lagt til ennå.</div>
          )}
        </div>
      </section>

      <section className="card">
        <h2>3. Evaluer korpus</h2>
        <p>
          Kjør evaluering mot <code>api.nb.no/dhlab/evaluate</code> med URNs og
          wordbags.
        </p>
        <div className="actions-row">
          <button type="button" onClick={handleEvaluate}>
            Kjør evaluering
          </button>
        </div>
        {evaluateStatus && (
          <div className="status-box" role="status">
            {evaluateStatus}
          </div>
        )}
        {evaluationTable ? (
          <>
            <div className="table-controls">
              <label className="field inline">
                <span>Min. sum</span>
                <input
                  type="number"
                  min={0}
                  value={totalThreshold}
                  onChange={(event) => setTotalThreshold(Number(event.target.value) || 0)}
                />
              </label>
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setAggregateByYear((prev) => !prev)
                  setSortKey('total')
                  setSortDir('desc')
                }}
              >
                {aggregateByYear ? 'Vis per bok' : 'Aggreger per år'}
              </button>
              {aggregateByYear && (
                <label className="field inline">
                  <span>Årsintervall</span>
                  <input
                    type="number"
                    min={1}
                    value={yearBinSize}
                    onChange={(event) => setYearBinSize(Number(event.target.value) || 1)}
                  />
                </label>
              )}
              {aggregateByYear && (
                <label className="field inline">
                  <span>Andel (%)</span>
                  <input
                    type="checkbox"
                    checked={aggregatePercent}
                    onChange={(event) => setAggregatePercent(event.target.checked)}
                  />
                </label>
              )}
              <div className="table-meta">
                Viser {evaluationTable.rows.length} av {evaluationTable.totalRows} rader
              </div>
              {evaluateDurationMs !== null && (
                <div className="table-meta">
                  Fant {evaluationTable.rows.length} rader på{' '}
                  {(evaluateDurationMs / 1000).toFixed(2)} sekunder
                </div>
              )}
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                  <th>
                    <button
                      type="button"
                      className="table-sort"
                      onClick={() =>
                        handleSort(evaluationTable.mode === 'topics' ? 'row' : 'dhlabid')
                      }
                    >
                      {evaluationTable.mode === 'topics' ? 'Kategori' : 'Dhlab ID'}{' '}
                      {sortKey === (evaluationTable.mode === 'topics' ? 'row' : 'dhlabid') && (
                        <span>{sortLabel}</span>
                      )}
                    </button>
                  </th>
                  {evaluationTable.columns.map((column) => (
                    <th key={column.key}>
                      <button
                        type="button"
                        className="table-sort"
                        onClick={() => handleSort(column.key)}
                      >
                        {column.label} {sortKey === column.key && <span>{sortLabel}</span>}
                      </button>
                    </th>
                  ))}
                    <th>
                      <button
                        type="button"
                        className="table-sort"
                        onClick={() => handleSort('total')}
                      >
                        Sum {sortKey === 'total' && <span>{sortLabel}</span>}
                      </button>
                    </th>
                  {evaluationTable.mode === 'docs' && (
                      <>
                        <th>
                          <button
                            type="button"
                            className="table-sort"
                            onClick={() => handleSort('title')}
                          >
                            Tittel {sortKey === 'title' && <span>{sortLabel}</span>}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="table-sort"
                            onClick={() => handleSort('authors')}
                          >
                            Forfatter {sortKey === 'authors' && <span>{sortLabel}</span>}
                          </button>
                        </th>
                        <th>
                          <button
                            type="button"
                            className="table-sort"
                            onClick={() => handleSort('year')}
                          >
                            År {sortKey === 'year' && <span>{sortLabel}</span>}
                          </button>
                        </th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                {evaluationTable.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    {evaluationTable.columns.map((column) => {
                      const value = row.values?.[column.year ?? column.key] ?? 0
                      if (column.kind === 'percent' && evaluationTable.mode === 'topics') {
                        const denom = evaluationTable.yearTotals?.get(column.year ?? '') ?? 0
                        const percent = denom > 0 ? (value / denom) * 100 : 0
                        return (
                          <td key={`${row.id}-${column.key}`}>
                            {percent.toFixed(1)}%
                          </td>
                        )
                      }
                      return <td key={`${row.id}-${column.key}`}>{value}</td>
                    })}
                    <td>
                      {aggregateByYear && aggregatePercent
                        ? `${row.total.toFixed(1)}%`
                        : row.total}
                    </td>
                    {evaluationTable.mode === 'docs' && (
                      <>
                        <td>{corpusMetaById[row.id]?.title ?? '-'}</td>
                        <td>{corpusMetaById[row.id]?.authors ?? '-'}</td>
                        <td>{corpusMetaById[row.id]?.year ?? '-'}</td>
                      </>
                    )}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="placeholder">Resultattabell kommer</div>
        )}
        {evaluateRaw && (
          <details className="details">
            <summary>Vis rårespons</summary>
            <pre>{evaluateRaw}</pre>
          </details>
        )}
      </section>
    </div>
  )
}

export default App
