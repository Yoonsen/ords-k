import { useMemo, useState } from 'react'
import './App.css'

type Wordbag = {
  id: string
  name: string
  words: string[]
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

function App() {
  const [buildQuery, setBuildQuery] = useState('')
  const [corpusUrns, setCorpusUrns] = useState<string[]>([])
  const [corpusFileName, setCorpusFileName] = useState<string | null>(null)
  const [corpusMessage, setCorpusMessage] = useState<string>('')

  const [wordbagName, setWordbagName] = useState('')
  const [wordbagWords, setWordbagWords] = useState('')
  const [wordbags, setWordbags] = useState<Wordbag[]>([])
  const [wordbagMessage, setWordbagMessage] = useState<string>('')

  const canAddWordbag = wordbagName.trim().length > 0 && wordbagWords.trim().length > 0

  const wordbagJson = useMemo(() => {
    const obj: Record<string, string[]> = {}
    wordbags.forEach((bag) => {
      obj[bag.name] = bag.words
    })
    return obj
  }, [wordbags])

  const handleBuildCorpus = () => {
    if (!buildQuery.trim()) {
      setCorpusMessage('Legg inn et enkelt metadatafilter først.')
      return
    }
    setCorpusMessage(
      'Bygging av korpus kommer – dette vil sende data til /build_corpus.',
    )
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
    if (!canAddWordbag) return
    const words = parseWordList(wordbagWords)
    const trimmedName = wordbagName.trim()
    if (!words.length) {
      setWordbagMessage('Legg inn minst ett ord.')
      return
    }
    const newEntry: Wordbag = {
      id: crypto.randomUUID(),
      name: trimmedName,
      words,
    }
    setWordbags((prev) => [...prev, newEntry])
    setWordbagName('')
    setWordbagWords('')
    setWordbagMessage('')
  }

  const removeWordbag = (id: string) => {
    setWordbags((prev) => prev.filter((bag) => bag.id !== id))
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
            }))
        } else if (parsed && typeof parsed === 'object') {
          next = Object.entries(parsed).map(([name, words]) => ({
            id: crypto.randomUUID(),
            name,
            words: Array.isArray(words) ? words.map(String) : [],
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
          Bruk et enkelt metadatafilter (f.eks. tittel, forfatter eller fritekst)
          og bygg et korpus med inntil 50&nbsp;000 dokumenter. Alternativt kan du
          laste opp en URN-liste fra CSV/TXT.
        </p>

        <div className="grid">
          <label className="field">
            <span>Metadata / søk</span>
            <input
              type="text"
              placeholder="Eksempel: digibok AND Ibsen"
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

        <div className="grid two-cols">
          <label className="field">
            <span>Vektornavn</span>
            <input
              type="text"
              placeholder="Eksempel: natur"
              value={wordbagName}
              onChange={(event) => setWordbagName(event.target.value)}
            />
          </label>
          <label className="field">
            <span>Ord</span>
            <textarea
              rows={3}
              placeholder="planter, skog, fjell, fjord"
              value={wordbagWords}
              onChange={(event) => setWordbagWords(event.target.value)}
            />
          </label>
        </div>

        <div className="actions-row">
          <button type="button" disabled={!canAddWordbag} onClick={addWordbag}>
            Legg til wordbag
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
            wordbags.map((bag) => (
              <div className="list-item" key={bag.id}>
                <div>
                  <strong>{bag.name}</strong>
                  <span>{bag.words.length} ord</span>
                </div>
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
          wordbags. Vi kobler dette til API-et når endepunktene er bekreftet.
        </p>
        <div className="placeholder">Resultattabell kommer</div>
      </section>
    </div>
  )
}

export default App
