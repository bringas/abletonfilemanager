import { useEffect, useMemo, useRef, useState } from 'react'
import type { AudioClipInfo } from './lib/alsReader'
import { parseAlsProject } from './lib/alsReader'
import { coincideBusqueda } from './lib/busqueda'
import {
  categorizarClip,
  elegirMejorClip,
  encontrarExportacionesSueltas,
  PISTA_EXPORTADO,
} from './lib/clipPriority'
import { db, ROOT_ID, type ProjectRecord, type UserMetaRecord } from './lib/db'
import { calcularEstado, type EstadoPreescucha } from './lib/estadoPreescucha'
import { claveDeCarpeta, construirArbolDeCarpetas, proyectosEnCarpeta, type FolderNode } from './lib/folderTree'
import { formatoDuracion, formatoFecha, formatoTamano } from './lib/formato'
import { reducirClipsPorPista } from './lib/reducirRuido'
import { contarRepeticiones, filtrarRepetidosSiProcede, vecesRepetido } from './lib/repeticion'
import { resolverClip } from './lib/resolvePath'
import { debeReutilizarProyecto } from './lib/rescan'
import { recorrerCarpeta, type AudioFileEntry } from './lib/scanFolder'
import { encontrarInicioSinSilencio } from './lib/silenceSkip'
import { generarBarras } from './lib/waveformVisual'

const DURACION_PREESCUCHA_SEGUNDOS = 15
// A partir de cuántos proyectos distintos un archivo cuenta como "repetido".
const UMBRAL_REPETICION = 3

type ProjectEntry = ProjectRecord
type TipoDePista = 'midi' | 'grabado' | 'audio'

interface Progreso {
  leidos: number
  total: number
}

const ETIQUETA_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'Con audio',
  'solo MIDI': 'Solo MIDI',
  'audio no encontrado': 'Audio no encontrado',
  'no legible': 'No legible',
}

const COLOR_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'text-[#7fcf8f]',
  'solo MIDI': 'text-[#7a7a7a]',
  'audio no encontrado': 'text-[#d8a94a]',
  'no legible': 'text-[#d86a6a]',
}

const COLORES_PISTA = ['#e2574c', '#dcb23c', '#6cae5a', '#8f6fd8', '#d85fa0', '#49a79f', '#4a90d8', '#9a9a9a']

function tipoDePista(clips: AudioClipInfo[]): TipoDePista {
  if (clips.length === 0) return 'midi'
  if (clips.some((clip) => categorizarClip(clip) === 'master' || categorizarClip(clip) === 'grabado')) {
    return 'grabado'
  }
  return 'audio'
}

function IconoPista({ tipo, color }: { tipo: TipoDePista; color: string }) {
  if (tipo === 'midi') {
    return (
      <svg viewBox="0 0 16 16" className="h-3 w-3 shrink-0" style={{ color }}>
        <rect x="1" y="2" width="3" height="12" fill="currentColor" />
        <rect x="6" y="2" width="3" height="12" fill="currentColor" opacity="0.5" />
        <rect x="11" y="2" width="3" height="12" fill="currentColor" />
      </svg>
    )
  }
  if (tipo === 'grabado') {
    return (
      <svg
        viewBox="0 0 16 16"
        className="h-3 w-3 shrink-0"
        fill="none"
        stroke={color}
        strokeWidth="1.3"
        strokeLinecap="round"
      >
        <rect x="5.5" y="1" width="5" height="8" rx="2.5" />
        <path d="M3 7.5a5 5 0 0 0 10 0M8 12.5v2M5.5 14.5h5" />
      </svg>
    )
  }
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke={color}
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M0.5 8h1l1-4.5 1.5 9 1.5-11 1.5 13 1.5-9 1 6h1l1-6.5 1.5 7.5 1-3.5h2" />
    </svg>
  )
}

function BarrasDecorativas({ semilla, color }: { semilla: string; color: string }) {
  const barras = useMemo(() => generarBarras(semilla, 28), [semilla])
  return (
    <div className="flex h-5 flex-1 items-center gap-[1.5px]">
      {barras.map((altura, i) => (
        <span
          key={i}
          className="w-[2px] shrink-0 opacity-70"
          style={{ height: `${altura * 100}%`, backgroundColor: color }}
        />
      ))}
    </div>
  )
}

function NodoCarpeta({
  nodo,
  nivel,
  expandidas,
  onToggleExpandir,
  claveSeleccionada,
  onSeleccionar,
}: {
  nodo: FolderNode
  nivel: number
  expandidas: Set<string>
  onToggleExpandir: (clave: string) => void
  claveSeleccionada: string
  onSeleccionar: (ruta: string[]) => void
}) {
  const clave = claveDeCarpeta(nodo.ruta)
  const expandido = expandidas.has(clave)
  const seleccionada = claveSeleccionada === clave

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1.5 py-1 pr-2 text-[13px] ${
          seleccionada ? 'bg-[#1c1c1c] text-[#f2f2f2]' : 'text-[#9a9a9a] hover:bg-[#151515] hover:text-[#dcdcdc]'
        }`}
        style={{ paddingLeft: `${8 + nivel * 14}px` }}
        onClick={() => onSeleccionar(nodo.ruta)}
      >
        {nodo.hijos.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpandir(clave)
            }}
            className="w-3 shrink-0 text-[#6a6a6a]"
          >
            {expandido ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="truncate">{nodo.nombre}</span>
        <span className="ml-auto shrink-0 text-[11px] text-[#5e5e5e]">{nodo.numeroDeProyectos}</span>
      </div>
      {expandido &&
        nodo.hijos.map((hijo) => (
          <NodoCarpeta
            key={claveDeCarpeta(hijo.ruta)}
            nodo={hijo}
            nivel={nivel + 1}
            expandidas={expandidas}
            onToggleExpandir={onToggleExpandir}
            claveSeleccionada={claveSeleccionada}
            onSeleccionar={onSeleccionar}
          />
        ))}
    </div>
  )
}

function App() {
  const [raizHandle, setRaizHandle] = useState<FileSystemDirectoryHandle | null>(null)
  const [necesitaPermiso, setNecesitaPermiso] = useState(false)
  const [projects, setProjects] = useState<ProjectEntry[]>([])
  const [audioIndex, setAudioIndex] = useState<AudioFileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [progreso, setProgreso] = useState<Progreso | null>(null)
  const [notSupported, setNotSupported] = useState(false)
  const [ultimoEscaneo, setUltimoEscaneo] = useState<Date | null>(null)

  // Un único <audio>, reutilizado siempre: así solo suena una cosa a la vez.
  // Se crea en un efecto (no durante el render) y vive mientras dura la página.
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    audioElRef.current = new Audio()
  }, [])
  const [urlActual, setUrlActual] = useState<string | null>(null)
  const [reproduciendoPath, setReproduciendoPath] = useState<string | null>(null)
  const [progresoReproduccion, setProgresoReproduccion] = useState(0)

  const [busqueda, setBusqueda] = useState('')
  const [carpetaSeleccionada, setCarpetaSeleccionada] = useState<string[]>([])
  const [carpetasExpandidas, setCarpetasExpandidas] = useState<Set<string>>(new Set())

  const [proyectoSeleccionado, setProyectoSeleccionado] = useState<string | null>(null)
  const [pestanaActiva, setPestanaActiva] = useState<'pistas' | 'info'>('pistas')
  // Las pistas están expandidas por defecto; aquí solo guardamos las que el
  // usuario colapsó a mano, por proyecto (para no mezclar pistas con el
  // mismo nombre de proyectos distintos).
  const [pistasColapsadas, setPistasColapsadas] = useState<Record<string, Set<string>>>({})
  const [rutaCopiada, setRutaCopiada] = useState<string | null>(null)

  const [fichaClips, setFichaClips] = useState<Record<string, Array<FileSystemFileHandle | null>>>({})
  const [mostrarNoEncontrados, setMostrarNoEncontrados] = useState(false)
  const [mostrarOtrosArchivos, setMostrarOtrosArchivos] = useState(false)
  const [metaPorPath, setMetaPorPath] = useState<Record<string, UserMetaRecord>>({})
  const [repeticiones, setRepeticiones] = useState<Map<string, number>>(new Map())
  const [ignorarRepetidos, setIgnorarRepetidos] = useState(false)

  const arbolDeCarpetas = useMemo(() => construirArbolDeCarpetas(projects), [projects])

  const proyectosVisibles = useMemo(() => {
    const base = busqueda.trim()
      ? projects.filter((p) => coincideBusqueda(p, busqueda, metaPorPath[p.path]))
      : proyectosEnCarpeta(projects, carpetaSeleccionada)
    return base.slice().sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
  }, [projects, busqueda, metaPorPath, carpetaSeleccionada])

  const proyectoActivo = proyectoSeleccionado ? (projects.find((p) => p.path === proyectoSeleccionado) ?? null) : null

  const tamanoTotalBiblioteca = useMemo(() => audioIndex.reduce((suma, a) => suma + a.size, 0), [audioIndex])

  function togglePista(projectPath: string, trackName: string) {
    setPistasColapsadas((prev) => {
      const actual = new Set(prev[projectPath] ?? [])
      if (actual.has(trackName)) actual.delete(trackName)
      else actual.add(trackName)
      return { ...prev, [projectPath]: actual }
    })
  }

  function toggleCarpetaExpandida(clave: string) {
    setCarpetasExpandidas((prev) => {
      const next = new Set(prev)
      if (next.has(clave)) next.delete(clave)
      else next.add(clave)
      return next
    })
  }

  async function guardarMeta(path: string, cambios: Partial<UserMetaRecord>) {
    const nuevo: UserMetaRecord = { ...metaPorPath[path], ...cambios, projectId: path }
    await db.userMeta.put(nuevo)
    setMetaPorPath((prev) => ({ ...prev, [path]: nuevo }))
  }

  function pararReproduccion() {
    audioElRef.current?.pause()
    if (urlActual) URL.revokeObjectURL(urlActual)
    setUrlActual(null)
    setReproduciendoPath(null)
    setProgresoReproduccion(0)
  }

  async function copiarRuta(project: ProjectEntry) {
    const rutaCompleta = raizHandle ? `${raizHandle.name}/${project.path}` : project.path
    try {
      await navigator.clipboard.writeText(rutaCompleta)
      setRutaCopiada(project.path)
      setTimeout(() => setRutaCopiada(null), 1500)
    } catch {
      // Si el navegador bloquea el portapapeles, no pasa nada grave: no hay nada más que hacer aquí.
    }
  }

  // Al abrir la página, recupero la última carpeta y el catálogo guardados.
  useEffect(() => {
    let cancelado = false

    ;(async () => {
      const root = await db.roots.get(ROOT_ID)
      if (!root || cancelado) return

      setRaizHandle(root.handle)
      setUltimoEscaneo(root.ultimoEscaneo ?? null)
      const proyectosGuardados = await db.projects.toArray()
      setProjects(proyectosGuardados)
      setRepeticiones(contarRepeticiones(proyectosGuardados))

      const metas = await db.userMeta.toArray()
      if (!cancelado) {
        setMetaPorPath(Object.fromEntries(metas.map((meta) => [meta.projectId, meta])))
      }

      const permiso = await root.handle.queryPermission({ mode: 'read' })
      if (!cancelado) setNecesitaPermiso(permiso !== 'granted')
    })()

    return () => {
      cancelado = true
    }
  }, [])

  /**
   * reutilizarExistentes=true es "Buscar cambios": si un .als no cambió desde
   * el último escaneo (misma fecha de modificación), no lo vuelve a leer ni a
   * resolver sus audios, solo reutiliza lo que ya teníamos guardado.
   */
  async function escanearCarpeta(raiz: FileSystemDirectoryHandle, reutilizarExistentes = false) {
    const existentesPorPath = new Map(projects.map((p) => [p.path, p]))

    setLoading(true)
    if (!reutilizarExistentes) setProjects([])
    setProgreso(null)

    try {
      setRaizHandle(raiz)
      const { alsFiles, audioFiles } = await recorrerCarpeta(raiz)
      setAudioIndex(audioFiles)
      setProgreso({ leidos: 0, total: alsFiles.length })

      const entries: ProjectEntry[] = []
      for (const { handle, path } of alsFiles) {
        const carpetaProyecto = path.split('/').slice(0, -1)
        let entry: ProjectEntry
        let lastModified: number | undefined

        try {
          const file = await handle.getFile()
          lastModified = file.lastModified

          const existente = existentesPorPath.get(path)
          if (debeReutilizarProyecto(existente, lastModified, reutilizarExistentes)) {
            entry = existente as ProjectEntry
          } else {
            const bytes = new Uint8Array(await file.arrayBuffer())
            const infoLeida = await parseAlsProject(bytes)
            const exportacionesSueltas = encontrarExportacionesSueltas(audioFiles, carpetaProyecto)
            const infoConExportaciones =
              exportacionesSueltas.length === 0
                ? infoLeida
                : {
                    ...infoLeida,
                    tracks: [...infoLeida.tracks, PISTA_EXPORTADO],
                    audioClips: [...infoLeida.audioClips, ...exportacionesSueltas],
                  }
            // Si una pista tiene muchas tomas sueltas, nos quedamos solo con
            // la más reciente y la más larga (si hay cientos, es ruido).
            const info = {
              ...infoConExportaciones,
              audioClips: reducirClipsPorPista(infoConExportaciones.audioClips, audioFiles, carpetaProyecto),
            }

            // Solo cuentan los clips que se muestran por defecto: si todo lo
            // que hay son tomas archivadas, no hay preview que ofrecer.
            let algunoEncontrado = false
            for (const clip of info.audioClips) {
              if (clip.mostrarPorDefecto === false) continue
              const encontrado = await resolverClip(raiz, carpetaProyecto, clip, audioFiles)
              if (encontrado) {
                algunoEncontrado = true
                break
              }
            }

            const estado = calcularEstado({
              tieneError: false,
              numeroDeClips: info.audioClips.length,
              algunoEncontrado,
            })
            entry = { path, info, estado, lastModified }
          }
        } catch {
          entry = { path, error: 'No se pudo leer este archivo', estado: 'no legible', lastModified }
        }

        entries.push(entry)
        if (reutilizarExistentes) {
          setProjects(entries.slice())
        } else {
          setProjects((prev) => [...prev, entry])
        }
        setProgreso((prev) => (prev ? { ...prev, leidos: prev.leidos + 1 } : prev))
      }

      setRepeticiones(contarRepeticiones(entries))

      const ahora = new Date()
      await db.roots.put({ id: ROOT_ID, nombre: raiz.name, handle: raiz, ultimoEscaneo: ahora })
      await db.projects.clear()
      await db.projects.bulkPut(entries)
      setUltimoEscaneo(ahora)
      setNecesitaPermiso(false)
    } finally {
      setLoading(false)
      setProgreso(null)
    }
  }

  async function elegirCarpeta() {
    if (!('showDirectoryPicker' in window)) {
      setNotSupported(true)
      return
    }

    try {
      const raiz = await window.showDirectoryPicker()
      await escanearCarpeta(raiz)
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        throw err
      }
    }
  }

  async function reconectarCarpeta() {
    if (!raizHandle) return
    const permiso = await raizHandle.requestPermission({ mode: 'read' })
    setNecesitaPermiso(permiso !== 'granted')
  }

  /** Pide permiso de la carpeta si hace falta. Devuelve si ya lo tenemos. */
  async function asegurarPermiso(): Promise<boolean> {
    if (!raizHandle) return false
    if (!necesitaPermiso) return true
    const permiso = await raizHandle.requestPermission({ mode: 'read' })
    setNecesitaPermiso(permiso !== 'granted')
    return permiso === 'granted'
  }

  async function buscarCambios() {
    if (!raizHandle || !(await asegurarPermiso())) return
    await escanearCarpeta(raizHandle, true)
  }

  async function reproducirHandle(path: string, handle: FileSystemFileHandle) {
    const audioEl = audioElRef.current
    if (!audioEl) return

    if (urlActual) URL.revokeObjectURL(urlActual)

    const file = await handle.getFile()
    const inicio = await encontrarInicioSinSilencio(file)
    const url = URL.createObjectURL(file)

    audioEl.src = url
    audioEl.currentTime = inicio
    audioEl.ontimeupdate = () => {
      const transcurrido = audioEl.currentTime - inicio
      setProgresoReproduccion(Math.min(1, transcurrido / DURACION_PREESCUCHA_SEGUNDOS))
      if (transcurrido >= DURACION_PREESCUCHA_SEGUNDOS) pararReproduccion()
    }
    audioEl.onended = () => pararReproduccion()

    setUrlActual(url)
    setReproduciendoPath(path)
    setProgresoReproduccion(0)
    await audioEl.play()
  }

  async function onPlayClick(project: ProjectEntry) {
    if (!project.info || !raizHandle || !(await asegurarPermiso())) return

    // Solo se reproducen por defecto los clips que se muestran por
    // defecto (lo que Ableton reproduciría); las tomas archivadas/sobrantes
    // quedan fuera salvo que el usuario las revele con el interruptor.
    const clipsVisibles = project.info.audioClips.filter((clip) => clip.mostrarPorDefecto !== false)
    const candidatos = filtrarRepetidosSiProcede(clipsVisibles, repeticiones, UMBRAL_REPETICION, ignorarRepetidos)
    const mejorClip = elegirMejorClip(candidatos)
    if (!mejorClip) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const audioHandle = await resolverClip(raizHandle, carpetaProyecto, mejorClip, audioIndex)
    if (!audioHandle) return

    await reproducirHandle(project.path, audioHandle)
  }

  async function onPlayClipClick(project: ProjectEntry, handle: FileSystemFileHandle) {
    if (!(await asegurarPermiso())) return
    await reproducirHandle(project.path, handle)
  }

  async function seleccionarProyecto(project: ProjectEntry) {
    if (proyectoSeleccionado === project.path) {
      setProyectoSeleccionado(null)
      return
    }
    setProyectoSeleccionado(project.path)
    setPestanaActiva('pistas')

    if (!project.info || !raizHandle || fichaClips[project.path] || !(await asegurarPermiso())) return

    const carpetaProyecto = project.path.split('/').slice(0, -1)
    const resultados: Array<FileSystemFileHandle | null> = []
    for (const clip of project.info.audioClips) {
      resultados.push(await resolverClip(raizHandle, carpetaProyecto, clip, audioIndex))
    }
    setFichaClips((prev) => ({ ...prev, [project.path]: resultados }))
  }

  if (!raizHandle && projects.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#0d0d0d] p-8 font-mono text-[#e8e8e8]">
        <h1 className="text-xl tracking-wide">PROJECTRESCUE</h1>
        <p className="max-w-sm text-center text-sm text-[#8a8a8a]">
          Tus archivos no salen de este ordenador. Elige la carpeta donde tienes tus proyectos de Ableton para
          empezar.
        </p>
        <button
          type="button"
          onClick={elegirCarpeta}
          disabled={loading}
          className="border border-[#e8e8e8] px-5 py-2 text-sm text-[#e8e8e8] hover:bg-[#e8e8e8] hover:text-[#0d0d0d] disabled:opacity-50"
        >
          {loading ? 'Escaneando…' : 'Elegir carpeta de proyectos'}
        </button>
        {progreso && progreso.total > 0 && (
          <p className="text-xs text-[#6a6a6a]">
            {progreso.leidos} de {progreso.total} proyectos
          </p>
        )}
        {notSupported && (
          <p className="max-w-sm text-center text-sm text-[#d86a6a]">
            Tu navegador no soporta elegir carpetas así. Prueba con Chrome o Edge de escritorio.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-[#0d0d0d] font-mono text-[#e8e8e8]">
      {(necesitaPermiso || (progreso && progreso.total > 0) || notSupported) && (
        <div className="shrink-0 border-b border-[#232323] bg-[#111] px-4 py-2 text-xs">
          {necesitaPermiso && (
            <div className="flex items-center gap-3 text-[#d8a94a]">
              <span>Hace falta volver a dar permiso para leer la carpeta.</span>
              <button type="button" onClick={reconectarCarpeta} className="underline hover:text-[#e8e8e8]">
                Reconectar carpeta
              </button>
            </div>
          )}
          {progreso && progreso.total > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[#8a8a8a]">
                Escaneando: {progreso.leidos} de {progreso.total}
              </span>
              <div className="h-1 w-40 overflow-hidden bg-[#232323]">
                <div
                  className="h-full bg-[#e8e8e8]"
                  style={{ width: `${(progreso.leidos / progreso.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {notSupported && (
            <p className="text-[#d86a6a]">Tu navegador no soporta elegir carpetas así. Prueba con Chrome o Edge.</p>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden text-[13px]">
        {/* Columna izquierda: carpetas, búsqueda y estadísticas */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-[#232323] bg-[#0f0f0f]">
          <div className="shrink-0 border-b border-[#232323] p-4">
            <h1 className="text-sm font-semibold tracking-[0.15em]">PROJECTRESCUE</h1>
            <p className="mt-0.5 text-[10px] tracking-wide text-[#6a6a6a]">TUS ARCHIVOS NO SALEN DE AQUÍ</p>
          </div>

          <div className="shrink-0 space-y-1.5 border-b border-[#232323] p-3">
            <button
              type="button"
              onClick={elegirCarpeta}
              disabled={loading}
              className="w-full border border-[#2e2e2e] px-2 py-1.5 text-left text-[12px] text-[#c8c8c8] hover:border-[#4a4a4a] disabled:opacity-50"
            >
              {loading ? 'Escaneando…' : 'Cambiar carpeta…'}
            </button>
            <button
              type="button"
              onClick={buscarCambios}
              disabled={loading}
              className="w-full border border-[#2e2e2e] px-2 py-1.5 text-left text-[12px] text-[#c8c8c8] hover:border-[#4a4a4a] disabled:opacity-50"
            >
              Buscar cambios
            </button>
          </div>

          <div className="shrink-0 border-b border-[#232323] p-3">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proyectos…"
              className="w-full border border-[#2e2e2e] bg-transparent px-2 py-1.5 text-[12px] text-[#e8e8e8] placeholder:text-[#5e5e5e] focus:border-[#6a6a6a] focus:outline-none"
            />
          </div>

          <div className="shrink-0 px-3 pt-3 text-[10px] tracking-[0.1em] text-[#5e5e5e]">CARPETAS</div>
          <div className="flex-1 overflow-y-auto px-1 py-1.5">
            <div
              className={`flex cursor-pointer items-center gap-1.5 py-1 pr-2 pl-2 text-[13px] ${
                claveDeCarpeta(carpetaSeleccionada) === '' && busqueda.trim() === ''
                  ? 'bg-[#1c1c1c] text-[#f2f2f2]'
                  : 'text-[#9a9a9a] hover:bg-[#151515] hover:text-[#dcdcdc]'
              }`}
              onClick={() => {
                setCarpetaSeleccionada([])
                setBusqueda('')
              }}
            >
              <span className="truncate">{raizHandle?.name ?? 'Carpeta'}</span>
              <span className="ml-auto text-[11px] text-[#5e5e5e]">{arbolDeCarpetas.numeroDeProyectos}</span>
            </div>
            {arbolDeCarpetas.hijos.map((hijo) => (
              <NodoCarpeta
                key={claveDeCarpeta(hijo.ruta)}
                nodo={hijo}
                nivel={1}
                expandidas={carpetasExpandidas}
                onToggleExpandir={toggleCarpetaExpandida}
                claveSeleccionada={busqueda.trim() ? '\u0000' : claveDeCarpeta(carpetaSeleccionada)}
                onSeleccionar={(ruta) => {
                  setCarpetaSeleccionada(ruta)
                  setBusqueda('')
                }}
              />
            ))}
          </div>

          <div className="shrink-0 border-t border-[#232323] p-3">
            <label className="flex items-center gap-2 text-[11px] text-[#8a8a8a]">
              <input
                type="checkbox"
                checked={ignorarRepetidos}
                onChange={(e) => setIgnorarRepetidos(e.target.checked)}
              />
              Ignorar repetidas en {UMBRAL_REPETICION}+ proyectos al reproducir
            </label>
          </div>

          <div className="shrink-0 border-t border-[#232323] p-3 text-[11px]">
            <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#5e5e5e]">ESTADÍSTICAS</div>
            <div className="flex justify-between text-[#8a8a8a]">
              <span>Proyectos</span>
              <span className="text-[#c8c8c8]">{projects.length}</span>
            </div>
            <div className="flex justify-between text-[#8a8a8a]">
              <span>Tamaño total</span>
              <span className="text-[#c8c8c8]">{formatoTamano(tamanoTotalBiblioteca)}</span>
            </div>
            <div className="flex justify-between text-[#8a8a8a]">
              <span>Último escaneo</span>
              <span className="text-[#c8c8c8]">{formatoFecha(ultimoEscaneo)}</span>
            </div>
          </div>
        </aside>

        {/* Columna del medio: lista de proyectos */}
        <main className="flex w-[22rem] shrink-0 flex-col overflow-hidden border-r border-[#232323]">
          <div className="shrink-0 border-b border-[#232323] px-4 py-3">
            <p className="text-[10px] text-[#5e5e5e]">
              {busqueda.trim()
                ? `Resultados de "${busqueda}"`
                : [raizHandle?.name, ...carpetaSeleccionada].filter(Boolean).join(' / ')}
            </p>
            <p className="mt-0.5 text-sm text-[#e8e8e8]">{proyectosVisibles.length} proyectos</p>
          </div>

          <ul className="flex-1 divide-y divide-[#1c1c1c] overflow-y-auto">
            {proyectosVisibles.map((project) => {
              const activo = proyectoSeleccionado === project.path
              const nombre = metaPorPath[project.path]?.alias || project.path.split('/').pop()?.replace(/\.als$/i, '')
              return (
                <li
                  key={project.path}
                  onClick={() => seleccionarProyecto(project)}
                  className={`cursor-pointer px-4 py-2.5 ${activo ? 'bg-[#161616]' : 'hover:bg-[#121212]'}`}
                >
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        guardarMeta(project.path, { favorito: !metaPorPath[project.path]?.favorito })
                      }}
                      aria-label="Marcar como favorito"
                      className="shrink-0 text-[#8a7a3a]"
                    >
                      {metaPorPath[project.path]?.favorito ? '★' : '☆'}
                    </button>
                    <p className="truncate text-sm text-[#e8e8e8]">{nombre}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6a6a6a]">
                    <span>{project.info?.bpm != null ? `${project.info.bpm} BPM` : '—'}</span>
                    <span>·</span>
                    <span>{formatoFecha(project.lastModified)}</span>
                    <span>·</span>
                    <span>{project.info?.tracks.length ?? 0} pistas</span>
                  </div>
                  {project.estado && (
                    <p className={`mt-1 text-[11px] ${COLOR_ESTADO[project.estado]}`}>{ETIQUETA_ESTADO[project.estado]}</p>
                  )}
                </li>
              )
            })}
            {proyectosVisibles.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-[#5e5e5e]">Nada por aquí.</li>
            )}
          </ul>
        </main>

        {/* Columna derecha: detalle del proyecto seleccionado */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {!proyectoActivo ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#5e5e5e]">
              Selecciona un proyecto para ver su detalle.
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[#232323] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#5e5e5e]">
                      {[raizHandle?.name, ...proyectoActivo.path.split('/').slice(0, -1)].filter(Boolean).join(' / ')}
                    </p>
                    <h2 className="truncate text-lg text-[#f2f2f2]">
                      {metaPorPath[proyectoActivo.path]?.alias ||
                        proyectoActivo.path
                          .split('/')
                          .pop()
                          ?.replace(/\.als$/i, '')}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => guardarMeta(proyectoActivo.path, { favorito: !metaPorPath[proyectoActivo.path]?.favorito })}
                    aria-label="Marcar como favorito"
                    className="shrink-0 text-lg text-[#8a7a3a]"
                  >
                    {metaPorPath[proyectoActivo.path]?.favorito ? '★' : '☆'}
                  </button>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#8a8a8a]">
                  <span>{proyectoActivo.info?.liveVersion || 'Versión desconocida'}</span>
                  <span>·</span>
                  <span>{proyectoActivo.info?.bpm != null ? `${proyectoActivo.info.bpm} BPM` : '— BPM'}</span>
                  <span>·</span>
                  <span>{proyectoActivo.info?.tracks.length ?? 0} pistas</span>
                  <span>·</span>
                  <span>{formatoFecha(proyectoActivo.lastModified)}</span>
                  {proyectoActivo.estado && (
                    <>
                      <span>·</span>
                      <span className={COLOR_ESTADO[proyectoActivo.estado]}>{ETIQUETA_ESTADO[proyectoActivo.estado]}</span>
                    </>
                  )}
                </div>

                {proyectoActivo.error && <p className="mt-2 text-sm text-[#d86a6a]">{proyectoActivo.error}</p>}

                <div className="mt-3 flex items-center gap-2">
                  {proyectoActivo.estado === 'con audio' &&
                    (reproduciendoPath === proyectoActivo.path ? (
                      <button
                        type="button"
                        onClick={pararReproduccion}
                        className="border border-[#d86a6a] px-3 py-1 text-[12px] text-[#d86a6a] hover:bg-[#d86a6a]/10"
                      >
                        ■ Parar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPlayClick(proyectoActivo)}
                        className="border border-[#e8e8e8] px-3 py-1 text-[12px] text-[#e8e8e8] hover:bg-[#e8e8e8] hover:text-[#0d0d0d]"
                      >
                        ▶ Reproducir
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => copiarRuta(proyectoActivo)}
                    className="border border-[#2e2e2e] px-3 py-1 text-[12px] text-[#c8c8c8] hover:border-[#4a4a4a]"
                  >
                    {rutaCopiada === proyectoActivo.path ? 'Ruta copiada' : 'Copiar ruta'}
                  </button>
                </div>

                {reproduciendoPath === proyectoActivo.path && (
                  <div className="mt-2 h-1 w-full max-w-xs overflow-hidden bg-[#232323]">
                    <div className="h-full bg-[#e8e8e8]" style={{ width: `${progresoReproduccion * 100}%` }} />
                  </div>
                )}

                <div className="mt-3 flex gap-4 text-[11px] tracking-[0.1em] text-[#6a6a6a]">
                  <button
                    type="button"
                    onClick={() => setPestanaActiva('pistas')}
                    className={pestanaActiva === 'pistas' ? 'border-b border-[#e8e8e8] pb-1 text-[#e8e8e8]' : 'pb-1'}
                  >
                    PISTAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setPestanaActiva('info')}
                    className={pestanaActiva === 'info' ? 'border-b border-[#e8e8e8] pb-1 text-[#e8e8e8]' : 'pb-1'}
                  >
                    INFO
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {pestanaActiva === 'info' ? (
                  <div className="max-w-sm space-y-3 text-[12px]">
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#5e5e5e]">ALIAS</label>
                      <input
                        type="text"
                        defaultValue={metaPorPath[proyectoActivo.path]?.alias ?? ''}
                        onBlur={(e) => guardarMeta(proyectoActivo.path, { alias: e.target.value })}
                        placeholder="Ponle un alias…"
                        className="w-full border border-[#2e2e2e] bg-transparent px-2 py-1.5 text-[#e8e8e8] focus:border-[#6a6a6a] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#5e5e5e]">ETIQUETAS</label>
                      <input
                        type="text"
                        defaultValue={(metaPorPath[proyectoActivo.path]?.etiquetas ?? []).join(', ')}
                        onBlur={(e) =>
                          guardarMeta(proyectoActivo.path, {
                            etiquetas: e.target.value
                              .split(',')
                              .map((etiqueta) => etiqueta.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Etiquetas separadas por comas…"
                        className="w-full border border-[#2e2e2e] bg-transparent px-2 py-1.5 text-[#e8e8e8] focus:border-[#6a6a6a] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#5e5e5e]">RUTA COMPLETA</label>
                      <p className="break-all text-[#8a8a8a]">
                        {raizHandle?.name}/{proyectoActivo.path}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#8a8a8a]">
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={mostrarNoEncontrados}
                          onChange={(e) => setMostrarNoEncontrados(e.target.checked)}
                        />
                        Mostrar audios no encontrados
                      </label>
                      <label className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={mostrarOtrosArchivos}
                          onChange={(e) => setMostrarOtrosArchivos(e.target.checked)}
                        />
                        Mostrar tomas archivadas
                      </label>
                    </div>

                    {proyectoActivo.info?.tracks.map((trackName, i) => {
                      const resueltos = fichaClips[proyectoActivo.path]
                      const todosDeLaPista = proyectoActivo.info?.audioClips
                        .map((clip, idx) => ({ clip, idx }))
                        .filter(({ clip }) => clip.track === trackName)
                      const baseDeLaPista = mostrarOtrosArchivos
                        ? todosDeLaPista
                        : (todosDeLaPista ?? []).filter(({ clip }) => clip.mostrarPorDefecto !== false)
                      const archivadasOcultas = (todosDeLaPista?.length ?? 0) - (baseDeLaPista?.length ?? 0)
                      const noEncontrados = resueltos
                        ? (baseDeLaPista ?? []).filter(({ idx }) => resueltos[idx] === null).length
                        : 0
                      const clipsDeLaPista = mostrarNoEncontrados
                        ? baseDeLaPista
                        : (baseDeLaPista ?? []).filter(({ idx }) => !resueltos || resueltos[idx] !== null)

                      const tipo = tipoDePista((todosDeLaPista ?? []).map(({ clip }) => clip))
                      const color = COLORES_PISTA[i % COLORES_PISTA.length]
                      const expandida = !pistasColapsadas[proyectoActivo.path]?.has(trackName)
                      const tieneClips = (todosDeLaPista?.length ?? 0) > 0

                      return (
                        <div key={`${trackName}-${i}`} className="border-b border-[#1c1c1c]">
                          <button
                            type="button"
                            onClick={() => tieneClips && togglePista(proyectoActivo.path, trackName)}
                            className="flex w-full items-center gap-2 py-2 text-left"
                          >
                            <span className="w-2.5 shrink-0 text-[10px] text-[#5e5e5e]">
                              {tieneClips ? (expandida ? '▾' : '▸') : ''}
                            </span>
                            <span className="shrink-0" style={{ color }}>
                              <IconoPista tipo={tipo} color={color} />
                            </span>
                            <span className="truncate text-[13px] text-[#e8e8e8]">{trackName}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-[#5e5e5e]">
                              {tieneClips ? `${todosDeLaPista?.length} clip${todosDeLaPista?.length === 1 ? '' : 's'}` : 'MIDI'}
                            </span>
                          </button>

                          {expandida && tieneClips && (
                            <div className="pb-2 pl-5">
                              {clipsDeLaPista && clipsDeLaPista.length === 0 ? (
                                <p className="py-1 text-[11px] text-[#5e5e5e]">
                                  {noEncontrados > 0
                                    ? `Ninguna grabación encontrada (${noEncontrados} oculta${noEncontrados === 1 ? '' : 's'})`
                                    : archivadasOcultas > 0
                                      ? `Sin toma principal (${archivadasOcultas} archivada${archivadasOcultas === 1 ? '' : 's'}, oculta${archivadasOcultas === 1 ? '' : 's'})`
                                      : 'comprobando…'}
                                </p>
                              ) : (
                                clipsDeLaPista?.map(({ clip, idx }) => {
                                  const handle = resueltos?.[idx]
                                  const veces = vecesRepetido(clip, repeticiones)
                                  const nombreArchivo = clip.relativePath?.split(/[/\\]/).pop() ?? '(ruta desconocida)'
                                  return (
                                    <div key={idx} className="flex items-center gap-2 py-1">
                                      {handle ? (
                                        <button
                                          type="button"
                                          onClick={() => onPlayClipClick(proyectoActivo, handle)}
                                          className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#3a3a3a] text-[10px] text-[#c8c8c8] hover:border-[#e8e8e8] hover:text-[#e8e8e8]"
                                        >
                                          ▶
                                        </button>
                                      ) : (
                                        <span className="h-5 w-5 shrink-0" />
                                      )}
                                      <BarrasDecorativas semilla={clip.relativePath ?? String(idx)} color={color} />
                                      <span className="w-40 shrink-0 truncate text-[12px] text-[#c8c8c8]">
                                        {nombreArchivo}
                                      </span>
                                      <span className="w-12 shrink-0 text-right text-[11px] text-[#6a6a6a]">
                                        {formatoDuracion(clip.durationBeats, proyectoActivo.info?.bpm ?? null)}
                                      </span>
                                      <span className="w-16 shrink-0 text-right text-[11px] text-[#6a6a6a]">
                                        {formatoTamano(clip.originalFileSize)}
                                      </span>
                                      <span className="w-24 shrink-0 text-right text-[11px] text-[#5e5e5e]">
                                        {!resueltos ? 'comprobando…' : handle ? 'encontrado' : 'no encontrado'}
                                      </span>
                                      {veces >= 2 && (
                                        <span className="shrink-0 text-[10px] text-[#5e5e5e]">en {veces} proyectos</span>
                                      )}
                                    </div>
                                  )
                                })
                              )}
                              {!mostrarNoEncontrados && noEncontrados > 0 && clipsDeLaPista && clipsDeLaPista.length > 0 && (
                                <p className="pt-0.5 text-[10px] text-[#5e5e5e]">
                                  + {noEncontrados} no encontrada{noEncontrados === 1 ? '' : 's'} (oculta
                                  {noEncontrados === 1 ? '' : 's'})
                                </p>
                              )}
                              {!mostrarOtrosArchivos && archivadasOcultas > 0 && clipsDeLaPista && clipsDeLaPista.length > 0 && (
                                <p className="pt-0.5 text-[10px] text-[#5e5e5e]">
                                  + {archivadasOcultas} toma{archivadasOcultas === 1 ? '' : 's'} archivada
                                  {archivadasOcultas === 1 ? '' : 's'} (oculta{archivadasOcultas === 1 ? '' : 's'})
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}

export default App
