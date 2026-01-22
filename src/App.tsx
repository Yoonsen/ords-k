import { useEffect, useMemo, useState } from 'react'
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

const parseDelimitedLine = (line: string, delimiter: string) => {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }
    if (char === delimiter && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  values.push(current.trim())
  return values
}

const detectDelimiter = (line: string) => {
  const candidates = [',', ';', '\t']
  let best = ','
  let bestCount = 0
  candidates.forEach((delimiter) => {
    const count = line.split(delimiter).length
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  })
  return best
}

const parseCorpusRows = (rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return null

  const urns: string[] = []
  const metaById: Record<string, CorpusMeta> = {}
  const metaByUrn: Record<string, CorpusMeta> = {}

  rows.forEach((row) => {
    const urn = row.urn ?? row.URN ?? row.Urn ?? ''
    const dhlabid =
      row.dhlabid ??
      row.dhlab_id ??
      row.dhlabId ??
      row[''] ??
      row.index ??
      row['Unnamed: 0'] ??
      ''
    const title = row.title ?? ''
    const authors = row.authors ?? ''
    const year = row.year ?? ''

    const cleanedUrn = typeof urn === 'string' ? urn.trim() : String(urn).trim()
    const cleanedId = typeof dhlabid === 'string' ? dhlabid.trim() : String(dhlabid).trim()

    if (cleanedUrn) {
      urns.push(cleanedUrn)
      metaByUrn[cleanedUrn] = {
        urn: cleanedUrn,
        title: title ? String(title).trim() : undefined,
        authors: authors ? String(authors).trim() : undefined,
        year: year ? String(year).trim() : undefined,
        dhlabid: cleanedId || undefined,
      }
    }

    if (cleanedId) {
      metaById[cleanedId] = {
        dhlabid: cleanedId,
        urn: cleanedUrn || undefined,
        title: title ? String(title).trim() : undefined,
        authors: authors ? String(authors).trim() : undefined,
        year: year ? String(year).trim() : undefined,
      }
    }
  })

  return {
    urns: Array.from(new Set(urns)).slice(0, MAX_CORPUS),
    metaById,
    metaByUrn,
  }
}

const parseCorpusCsv = (text: string) => {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (!lines.length) return null

  const delimiter = detectDelimiter(lines[0])
  const header = parseDelimitedLine(lines[0], delimiter).map((value) => value.toLowerCase())
  const rows: Array<Record<string, string>> = []

  for (let i = 1; i < lines.length; i += 1) {
    const values = parseDelimitedLine(lines[i], delimiter)
    const row: Record<string, string> = {}
    header.forEach((key, index) => {
      row[key] = values[index] ?? ''
    })
    rows.push(row)
  }

  return parseCorpusRows(rows)
}

const parseCorpusExcel = async (buffer: ArrayBuffer) => {
  const XLSX = await import('xlsx')
  const workbook = XLSX.read(buffer, { type: 'array' })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return null
  const worksheet = workbook.Sheets[sheetName]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' })
  return parseCorpusRows(rows)
}

const escapeCsvValue = (value: string | number | null | undefined) => {
  const text = value === null || value === undefined ? '' : String(value)
  if (text.includes('"')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  if (/[,\n]/.test(text)) {
    return `"${text}"`
  }
  return text
}

const downloadCsv = (filename: string, rows: Array<Array<string | number>>) => {
  const content = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
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

  const doctypeAliases: Record<string, string> = {
    bok: 'digibok',
    bøker: 'digibok',
    avis: 'digavis',
    aviser: 'digavis',
  }

  const normalizeDoctype = (value: string) => {
    const lower = value.toLowerCase()
    if (doctypeAliases[lower]) return doctypeAliases[lower]
    return value
  }

  const tokens = trimmed
    .split(/[,;\n]+/g)
    .flatMap((chunk) => chunk.trim().split(/\s+(?=\w+\s*[:=])/g))
    .map((token) => token.trim())
    .filter(Boolean)

  const params: Record<string, string | number> = {}
  let foundExplicit = false

  tokens.forEach((token) => {
    const match = token.match(/^([a-zA-Z_]+)\s*[:=]\s*(.+)$/)
    if (!match) return
    const key = match[1].toLowerCase()
    const value = match[2].trim()
    if (!allowedKeys.has(key)) return
    foundExplicit = true

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

    if (key === 'doctype') {
      params[key] = normalizeDoctype(value)
      return
    }

    params[key] = value
  })

  if (Object.keys(params).length) {
    return params
  }

  const naturalMatch = trimmed.match(/\b(?:fra|from)\s+(\d{4})\b/i)
  if (naturalMatch) {
    params.from_year = Number(naturalMatch[1])
  }
  const toMatch = trimmed.match(/\b(?:til|to)\s+(\d{4})\b/i)
  if (toMatch) {
    params.to_year = Number(toMatch[1])
  }

  const yearOnly = trimmed.match(/^\d{4}$/)
  if (yearOnly && !foundExplicit) {
    params.from_year = Number(yearOnly[0])
  }

  const yearRange = trimmed.match(/\b(\d{4})\s*-\s*(\d{4})\b/)
  if (yearRange) {
    params.from_year = Number(yearRange[1])
    params.to_year = Number(yearRange[2])
  }

  const lower = trimmed.toLowerCase()
  if (!params.doctype && /\b(bok|bøker|avis|aviser)\b/.test(lower)) {
    if (/\b(avis|aviser)\b/.test(lower)) {
      params.doctype = 'digavis'
    } else {
      params.doctype = 'digibok'
    }
  }

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
  const [corpusMetaByUrn, setCorpusMetaByUrn] = useState<Record<string, CorpusMeta>>({})

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
  const [pageSize, setPageSize] = useState<number>(500)
  const [pageIndex, setPageIndex] = useState<number>(0)
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set())
  const [chartWidth, setChartWidth] = useState<number>(() =>
    typeof window === 'undefined' ? 900 : window.innerWidth,
  )

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

    const lowerName = file.name.toLowerCase()
    const isCsv = lowerName.endsWith('.csv')
    const isTxt = lowerName.endsWith('.txt')
    const isExcel = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')

    if (!isCsv && !isTxt && !isExcel) {
      setCorpusMessage('Støtter CSV, TXT og Excel (XLSX/XLS) for import.')
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (isExcel) {
        const buffer = reader.result as ArrayBuffer
        parseCorpusExcel(buffer)
          .then((excelParsed) => {
            if (excelParsed) {
              setCorpusUrns(excelParsed.urns)
              setCorpusMetaById(excelParsed.metaById)
              setCorpusMetaByUrn(excelParsed.metaByUrn)
              const hasDhlabIds = Object.keys(excelParsed.metaById).length > 0
              setCorpusMessage(
                excelParsed.urns.length
                  ? hasDhlabIds
                    ? `Importerte ${excelParsed.urns.length} URN-er (Excel).`
                    : `Importerte ${excelParsed.urns.length} URN-er (Excel). Ingen dhlabid funnet.`
                  : 'Ingen URN-er funnet i Excel.',
              )
            } else {
              setCorpusMessage('Kunne ikke lese Excel-filen.')
            }
          })
          .catch(() => {
            setCorpusMessage('Kunne ikke lese Excel-filen.')
          })
        return
      }

      const text = String(reader.result ?? '')
      const csvParsed = isCsv ? parseCorpusCsv(text) : null
      if (csvParsed) {
        setCorpusUrns(csvParsed.urns)
        setCorpusMetaById(csvParsed.metaById)
        setCorpusMetaByUrn(csvParsed.metaByUrn)
        const hasDhlabIds = Object.keys(csvParsed.metaById).length > 0
        setCorpusMessage(
          csvParsed.urns.length
            ? hasDhlabIds
              ? `Importerte ${csvParsed.urns.length} URN-er (CSV).`
              : `Importerte ${csvParsed.urns.length} URN-er (CSV). Ingen dhlabid funnet.`
            : 'Ingen URN-er funnet i CSV.',
        )
      } else {
        const parsed = parseCorpusText(text)
        setCorpusUrns(parsed)
        setCorpusMessage(
          parsed.length
            ? `Importerte ${parsed.length} URN-er.`
            : 'Ingen URN-er funnet i filen.',
        )
      }
    }
    reader.onerror = () => {
      setCorpusMessage('Kunne ikke lese filen.')
    }
    if (isExcel) {
      reader.readAsArrayBuffer(file)
    } else {
      reader.readAsText(file)
    }
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
      if (!hasYear) return null
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
        if (!label) return
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
        const aValue =
          metaLookup[a.id]?.[sortKey] ?? corpusMetaByUrn[a.id]?.[sortKey] ?? ''
        const bValue =
          metaLookup[b.id]?.[sortKey] ?? corpusMetaByUrn[b.id]?.[sortKey] ?? ''
        return direction * aValue.localeCompare(bValue, 'nb')
      }
      if (sortKey === 'year') {
        const aValue = Number(metaLookup[a.id]?.year ?? corpusMetaByUrn[a.id]?.year ?? 0)
        const bValue = Number(metaLookup[b.id]?.year ?? corpusMetaByUrn[b.id]?.year ?? 0)
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
    corpusMetaByUrn,
    sortKey,
    sortDir,
    totalThreshold,
    aggregateByYear,
    yearBinSize,
    aggregatePercent,
  ])

  useEffect(() => {
    setPageIndex(0)
  }, [evaluateData, totalThreshold, sortKey, sortDir, aggregateByYear, yearBinSize, aggregatePercent])

  useEffect(() => {
    setHiddenSeries(new Set())
  }, [evaluateData, aggregateByYear, yearBinSize, aggregatePercent])

  useEffect(() => {
    const handler = () => setChartWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir(key === 'title' || key === 'authors' || key === 'dhlabid' ? 'asc' : 'desc')
  }

  const sortLabel = sortDir === 'asc' ? '↑' : '↓'

  const chartSeries = useMemo(() => {
    if (!evaluationTable || evaluationTable.mode !== 'topics') return null

    const yearColumns = evaluationTable.columns.filter(
      (column) => column.kind === 'count' && column.year,
    )
    if (!yearColumns.length) return null

    const years = yearColumns.map((column) => column.year ?? column.label)
    const sortedRows = [...evaluationTable.rows].sort((a, b) => b.total - a.total)
    const visibleRows = sortedRows.filter((row) => !hiddenSeries.has(row.id))
    const topRows = visibleRows.slice(0, 5)

    const series = topRows.map((row) => {
      const values = yearColumns.map((column) => {
        const raw = row.values[column.year ?? ''] ?? 0
        if (aggregatePercent) {
          const denom = evaluationTable.yearTotals?.get(column.year ?? '') ?? 0
          return denom > 0 ? (raw / denom) * 100 : 0
        }
        return raw
      })
      return { id: row.id, values }
    })

    const maxValue = Math.max(
      1,
      ...series.flatMap((item) => item.values),
    )
    const maxTicks = chartWidth < 600 ? 4 : chartWidth < 900 ? 6 : 8
    const tickStep = Math.max(1, Math.ceil(years.length / maxTicks))
    const tickIndices = years
      .map((_, index) => index)
      .filter((index) => index % tickStep === 0 || index === years.length - 1)
    return { years, series, maxValue, tickIndices }
  }, [evaluationTable, aggregatePercent, hiddenSeries, chartWidth])

  const handleDownload = () => {
    if (!evaluationTable) return
    if (evaluationTable.mode === 'docs') {
      const header = [
        'dhlabid',
        ...evaluationTable.columns.map((column) => column.label),
        'sum',
        'title',
        'authors',
        'year',
      ]
      const rows = evaluationTable.rows.map((row) => [
        row.id,
        ...evaluationTable.columns.map((column) => row.values?.[column.key] ?? 0),
        row.total,
        corpusMetaById[row.id]?.title ?? corpusMetaByUrn[row.id]?.title ?? '',
        corpusMetaById[row.id]?.authors ?? corpusMetaByUrn[row.id]?.authors ?? '',
        corpusMetaById[row.id]?.year ?? corpusMetaByUrn[row.id]?.year ?? '',
      ])
      downloadCsv('evaluering-per-bok.csv', [header, ...rows])
      return
    }

    const header = ['vektor', ...evaluationTable.columns.map((column) => column.label), 'sum']
    const rows = evaluationTable.rows.map((row) => [
      row.id,
      ...evaluationTable.columns.map((column) => {
        if (column.kind === 'percent') {
          const denom = evaluationTable.yearTotals?.get(column.year ?? '') ?? 0
          const raw = row.values?.[column.year ?? ''] ?? 0
          return denom > 0 ? ((raw / denom) * 100).toFixed(1) : '0.0'
        }
        return row.values?.[column.year ?? column.key] ?? 0
      }),
      aggregatePercent ? row.total.toFixed(1) : row.total,
    ])
    downloadCsv('evaluering-per-ar.csv', [header, ...rows])
  }

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
            <textarea
              rows={3}
              placeholder="freetext eller felt: verdi (author: Ibsen, from_year: 1880)"
              value={buildQuery}
              onChange={(event) => setBuildQuery(event.target.value)}
            />
          </label>
          <div className="field actions">
            <span>&nbsp;</span>
            <button type="button" className="button-compact" onClick={handleBuildCorpus}>
              Bygg korpus
        </button>
          </div>
        </div>

        <div className="grid">
          <label className="field">
            <span>Importer URN-liste</span>
            <input
              type="file"
              accept=".csv,.txt,.xlsx,.xls"
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
        <h2>2. Lag ordgrupper (clustre)</h2>
        <p>
          Legg til tema og ordlister (separert med komma eller linjeskift). Du kan
          også importere eller laste ned definisjonene som JSON.
        </p>

        <div className="actions-row">
          <button type="button" className="button-primary" onClick={addWordbag}>
            Ny ordgruppe
          </button>
          <div className="actions-secondary">
            <label className="file-button icon-button">
              <span className="icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M12 4l4.5 4.5h-3v7h-3v-7h-3L12 4zM5 18h14v2H5v-2z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              Last opp definisjoner
              <input
                type="file"
                accept="application/json"
                onChange={(event) => importWordbags(event.target.files?.[0])}
              />
            </label>
            <button
              type="button"
              className="button-secondary icon-button"
              onClick={downloadWordbags}
              disabled={!wordbags.length}
            >
              <span className="icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="16" height="16">
                  <path
                    d="M12 20l-4.5-4.5h3v-7h3v7h3L12 20zM5 4h14v2H5V4z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              Last ned definisjoner
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
              <button type="button" className="button-secondary" onClick={handleDownload}>
                Last ned CSV
              </button>
              {evaluationTable.mode === 'docs' && (
                <div className="pager">
                  <label className="field inline">
                    <span>Vis</span>
                    <select
                      value={pageSize}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        setPageSize(next)
                        setPageIndex(0)
                      }}
                    >
                      <option value={100}>100</option>
                      <option value={500}>500</option>
                      <option value={1000}>1000</option>
                      <option value={5000}>5000</option>
                      <option value={10000}>10000</option>
                      <option value={0}>Alle</option>
                    </select>
                  </label>
                  {pageSize > 0 && (
                    <div className="pager-controls">
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() => setPageIndex((prev) => Math.max(prev - 1, 0))}
                        disabled={pageIndex === 0}
                      >
                        Forrige
                      </button>
                      <span>
                        Side {pageIndex + 1} av{' '}
                        {Math.max(1, Math.ceil(evaluationTable.rows.length / pageSize))}
                      </span>
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={() =>
                          setPageIndex((prev) =>
                            Math.min(
                              prev + 1,
                              Math.ceil(evaluationTable.rows.length / pageSize) - 1,
                            ),
                          )
                        }
                        disabled={
                          pageIndex >= Math.ceil(evaluationTable.rows.length / pageSize) - 1
                        }
                      >
                        Neste
                      </button>
                    </div>
                  )}
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
                {(pageSize > 0 && evaluationTable.mode === 'docs'
                  ? evaluationTable.rows.slice(
                      pageIndex * pageSize,
                      pageIndex * pageSize + pageSize,
                    )
                  : evaluationTable.rows
                ).map((row) => (
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
                        <td>
                          {corpusMetaById[row.id]?.title ??
                            corpusMetaByUrn[row.id]?.title ??
                            '-'}
                        </td>
                        <td>
                          {corpusMetaById[row.id]?.authors ??
                            corpusMetaByUrn[row.id]?.authors ??
                            '-'}
                        </td>
                        <td>
                          {corpusMetaById[row.id]?.year ??
                            corpusMetaByUrn[row.id]?.year ??
                            '-'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                </tbody>
              </table>
            </div>
            {evaluationTable.mode === 'topics' && chartSeries && (
              <div className="chart-card">
                <div className="chart-header">
                  <strong>
                    {aggregatePercent
                      ? 'Andel per år (topp 5 vektorer)'
                      : 'Sum per år (topp 5 vektorer)'}
                  </strong>
                </div>
                <svg viewBox="0 0 900 300" role="img">
                  <rect x="50" y="20" width="820" height="220" fill="#f8fafc" />
                  {chartSeries.years.map((year, index) => {
                    const x = 50 + (820 / Math.max(1, chartSeries.years.length - 1)) * index
                    const showTick = chartSeries.tickIndices.includes(index)
                    return (
                      <g key={year}>
                        <line x1={x} y1={20} x2={x} y2={240} stroke="#e2e8f0" />
                        {showTick && (
                          <text x={x} y={265} textAnchor="middle" fontSize="12" fill="#64748b">
                            {year}
                          </text>
                        )}
                      </g>
                    )
                  })}
                  {chartSeries.series
                    .filter((serie) => !hiddenSeries.has(serie.id))
                    .map((serie, idx) => {
                    const points = serie.values.map((value, index) => {
                      const x = 50 + (820 / Math.max(1, chartSeries.years.length - 1)) * index
                      const y = 240 - (value / chartSeries.maxValue) * 200
                      return `${x},${y}`
                    })
                    const colors = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#0ea5e9']
                    return (
                      <polyline
                        key={serie.id}
                        fill="none"
                        stroke={colors[idx % colors.length]}
                        strokeWidth="2"
                        points={points.join(' ')}
                      />
                    )
                  })}
                </svg>
                <div className="chart-legend">
                  {chartSeries.series.map((serie, idx) => {
                    const colors = ['#2563eb', '#16a34a', '#f97316', '#a855f7', '#0ea5e9']
                    const isHidden = hiddenSeries.has(serie.id)
                    return (
                      <button
                        key={serie.id}
                        type="button"
                        className={`legend-button ${isHidden ? 'is-hidden' : ''}`}
                        style={{ color: colors[idx % colors.length] }}
                        onClick={() => {
                          setHiddenSeries((prev) => {
                            const next = new Set(prev)
                            if (next.has(serie.id)) {
                              next.delete(serie.id)
                            } else {
                              next.add(serie.id)
                            }
                            return next
                          })
                        }}
                      >
                        {serie.id}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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

      <section className="card">
        <h2>Om appen</h2>
        <p>
          Ordsøk lar deg definere “wordbags” (tematiske ordlister) og telle dem mot
          et korpus i NB dhlab. Det er et vektorsøk uten komprimerte vektorer –
          hvert dokument blir evaluert direkte i et høydimensjonalt, spars
          matriserom, hvor hver ordliste er en akse. Resultatet er en tabell med
          summer per dokument eller aggregert per år.
        </p>
        <p>
          Dette kan brukes til å undersøke stilnormer, temaendringer over tid,
          eller hvordan bestemte begreper opptrer i ulike deler av et korpus.
        </p>
      </section>
    </div>
  )
}

export default App
