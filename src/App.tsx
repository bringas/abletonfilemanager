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
import { formatoDuracion, formatoFecha, formatoSegundos, formatoTamano } from './lib/formato'
import {
  agruparSobrantesPorCarpeta,
  encontrarArchivosSinUsar,
  encontrarArchivosSobrantes,
  encontrarCarpetasSinAudios,
} from './lib/limpieza'
import { CARPETA_FAVORITOS, planificarOptimizacion, type GrupoOptimizacion } from './lib/optimizacion'
import { reducirClipsPorPista } from './lib/reducirRuido'
import { contarRepeticiones, filtrarRepetidosSiProcede, vecesRepetido } from './lib/repeticion'
import { resolverArchivo, resolverClip, resolverSegmentos } from './lib/resolvePath'
import { debeReutilizarProyecto } from './lib/rescan'
import { debeIgnorarse, recorrerCarpeta, type AudioFileEntry } from './lib/scanFolder'
import { beatsASegundos } from './lib/warpTiming'
import { generarBarras } from './lib/waveformVisual'

// A partir de cuántos proyectos distintos un archivo cuenta como "repetido".
const UMBRAL_REPETICION = 3

type ProjectEntry = ProjectRecord
type TipoDePista = 'midi' | 'grabado' | 'audio'

interface Progreso {
  leidos: number
  total: number
}

/** Un clip de la mezcla completa, ya decodificado y listo para programarse. */
interface ClipMezclaPreparado {
  buffer: AudioBuffer
  /** Dónde empieza, en segundos desde el principio de la "canción" (mezcla). */
  posicion: number
  /** Dónde empieza, en segundos dentro del propio archivo (el tramo real del clip). */
  offset: number
  duracion: number
}

const ETIQUETA_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'Con audio',
  'solo MIDI': 'Solo MIDI',
  'audio no encontrado': 'Audio no encontrado',
  'no legible': 'No legible',
}

const COLOR_ESTADO: Record<EstadoPreescucha, string> = {
  'con audio': 'text-[#3f7a4c]',
  'solo MIDI': 'text-[#8a867b]',
  'audio no encontrado': 'text-[#9c6f1e]',
  'no legible': 'text-[#b03f3f]',
}

const COLORES_PISTA = ['#b8453c', '#a9842a', '#4f8a43', '#6c4fb0', '#a8447c', '#35827b', '#3570ad', '#827e73']

// Acento para el botón "Optimizar": lo único con color sólido de la interfaz.
const COLOR_OPTIMIZAR = '#b8453c'

function tipoDePista(clips: AudioClipInfo[]): TipoDePista {
  if (clips.length === 0) return 'midi'
  if (clips.some((clip) => categorizarClip(clip) === 'master' || categorizarClip(clip) === 'grabado')) {
    return 'grabado'
  }
  return 'audio'
}

/** Agrupa el plan de optimización por carpeta de destino, para pintar el árbol propuesto. */
function construirArbolPropuesto(grupos: GrupoOptimizacion[]) {
  const porDestino = new Map<string, GrupoOptimizacion[]>()
  for (const grupo of grupos) {
    if (grupo.fija) continue
    const lista = porDestino.get(grupo.destino[0]) ?? []
    lista.push(grupo)
    porDestino.set(grupo.destino[0], lista)
  }

  const buckets = Array.from(porDestino.entries())
    .map(([nombre, grupos]) => ({
      nombre,
      grupos: [...grupos].sort((a, b) => a.nombreActual.localeCompare(b.nombreActual)),
    }))
    .sort((a, b) => {
      if (a.nombre === CARPETA_FAVORITOS) return -1
      if (b.nombre === CARPETA_FAVORITOS) return 1
      return a.nombre.localeCompare(b.nombre)
    })

  const fijas = grupos.filter((g) => g.fija).sort((a, b) => a.nombreActual.localeCompare(b.nombreActual))

  return { buckets, fijas }
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
          seleccionada ? 'bg-[#e7e3d8] text-[#0a0a08]' : 'text-[#827e73] hover:bg-[#eeebe1] hover:text-[#15130f]'
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
            className="w-3 shrink-0 text-[#716d63]"
          >
            {expandido ? '▾' : '▸'}
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className="truncate">{nodo.nombre}</span>
        <span className="ml-auto shrink-0 text-[11px] text-[#9c988d]">{nodo.numeroDeProyectos}</span>
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
  // Límites del trozo que suena ahora mismo (null = el archivo entero), para
  // poder avanzar/retroceder sin salirse del clip.
  const [tramoActivo, setTramoActivo] = useState<{ inicio: number; fin: number } | null>(null)

  // Mezcla completa: suma todas las pistas con Web Audio API (no usa el
  // <audio> de arriba, que solo reproduce un archivo a la vez).
  const audioContextRef = useRef<AudioContext | null>(null)
  const fuentesActivasRef = useRef<AudioBufferSourceNode[]>([])
  const mezclaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mezclaIntervaloRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mezclaGainRef = useRef<GainNode | null>(null)
  // Los clips ya decodificados (para poder saltar sin tener que releerlos y
  // decodificarlos otra vez) y desde qué segundo de la "canción" suena el
  // tramo programado ahora mismo.
  const mezclaPreparadaRef = useRef<{ clips: ClipMezclaPreparado[]; duracionTotal: number } | null>(null)
  const mezclaInicioContextoRef = useRef(0)
  const mezclaPosicionBaseRef = useRef(0)
  const [mezclaReproduciendo, setMezclaReproduciendo] = useState<string | null>(null)
  const [mezclaCargando, setMezclaCargando] = useState<string | null>(null)
  const [progresoMezcla, setProgresoMezcla] = useState(0)
  const [duracionMezcla, setDuracionMezcla] = useState(0)

  // Optimización: copiar la biblioteca a otra carpeta, reorganizada y sin
  // los archivos sobrantes. Nunca toca el original.
  const copiaCancelarRef = useRef(false)
  const [mostrarOptimizacion, setMostrarOptimizacion] = useState(false)
  const [copiaEnProgreso, setCopiaEnProgreso] = useState<{ copiados: number; omitidos: number } | null>(null)
  const [errorCopia, setErrorCopia] = useState<string | null>(null)
  const [incluirSinUsar, setIncluirSinUsar] = useState(false)

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

  // Archivos que ningún proyecto de la biblioteca referencia (ver limpieza.ts).
  const archivosSobrantes = useMemo(() => encontrarArchivosSobrantes(projects, audioIndex), [projects, audioIndex])
  const tamanoSobrantes = useMemo(() => archivosSobrantes.reduce((suma, a) => suma + a.size, 0), [archivosSobrantes])
  const gruposSobrantes = useMemo(() => agruparSobrantesPorCarpeta(archivosSobrantes), [archivosSobrantes])

  // De los sobrantes de toda la biblioteca, cuáles están dentro de la carpeta
  // del proyecto que se está viendo ahora: para avisar en su ficha de que hay
  // audios sueltos aquí mismo que la ficha nunca enseña (no los referencia
  // ningún clip), en vez de que solo aparezcan si el usuario llega a abrir
  // OPTIMIZAR por su cuenta.
  const sobrantesDeLaCarpetaActiva = useMemo(() => {
    if (!proyectoActivo) return []
    const carpetaProyecto = proyectoActivo.path.split('/').slice(0, -1).join('/')
    if (!carpetaProyecto) return []
    const prefijo = `${carpetaProyecto}/`
    return archivosSobrantes.filter((archivo) => archivo.path.startsWith(prefijo))
  }, [proyectoActivo, archivosSobrantes])

  // Archivos que sí usa algún proyecto, pero solo desde tomas archivadas
  // (ninguna pista los reproduce de verdad). Categoría aparte: no son
  // basura con la misma certeza que los sobrantes, así que es opcional
  // quitarlos de la copia optimizada.
  const archivosSinUsar = useMemo(() => encontrarArchivosSinUsar(projects, audioIndex), [projects, audioIndex])
  const tamanoSinUsar = useMemo(() => archivosSinUsar.reduce((suma, a) => suma + a.size, 0), [archivosSinUsar])
  const gruposSinUsar = useMemo(() => agruparSobrantesPorCarpeta(archivosSinUsar), [archivosSinUsar])

  // Qué se quita realmente de la copia optimizada: los sobrantes siempre,
  // y los "sin usar" solo si el usuario marca la casilla.
  const archivosAExcluir = useMemo(
    () => (incluirSinUsar ? [...archivosSobrantes, ...archivosSinUsar] : archivosSobrantes),
    [archivosSobrantes, archivosSinUsar, incluirSinUsar],
  )
  const rutasAExcluir = useMemo(() => new Set(archivosAExcluir.map((a) => a.path)), [archivosAExcluir])
  // Carpetas que, tras quitar lo anterior, se quedarían sin ningún audio:
  // no tiene sentido crearlas en la copia optimizada.
  const carpetasSinAudios = useMemo(
    () => encontrarCarpetasSinAudios(audioIndex, rutasAExcluir),
    [audioIndex, rutasAExcluir],
  )

  // Dónde se propone mover cada carpeta de primer nivel (ver optimizacion.ts).
  const planOptimizacion = useMemo(() => planificarOptimizacion(projects, metaPorPath), [projects, metaPorPath])
  const arbolPropuesto = useMemo(() => construirArbolPropuesto(planOptimizacion), [planOptimizacion])

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
    setTramoActivo(null)
  }

  /** Para las fuentes que suenan ahora, pero mantiene los clips ya decodificados (para poder saltar sin releerlos). */
  function detenerFuentesMezcla() {
    for (const fuente of fuentesActivasRef.current) {
      try {
        fuente.stop()
      } catch {
        // Si ya había terminado sola, da igual.
      }
    }
    fuentesActivasRef.current = []
    if (mezclaTimeoutRef.current) {
      clearTimeout(mezclaTimeoutRef.current)
      mezclaTimeoutRef.current = null
    }
  }

  function pararMezcla() {
    detenerFuentesMezcla()
    if (mezclaIntervaloRef.current) {
      clearInterval(mezclaIntervaloRef.current)
      mezclaIntervaloRef.current = null
    }
    mezclaPreparadaRef.current = null
    mezclaGainRef.current = null
    setMezclaReproduciendo(null)
    setProgresoMezcla(0)
    setDuracionMezcla(0)
  }

  /**
   * (Re)programa la reproducción de la mezcla a partir del segundo `desde`
   * de la "canción": para lo que sonara y vuelve a arrancar cada pista en su
   * sitio, con el trozo que le quede por sonar desde ese punto. Las fuentes
   * de Web Audio no se pueden "mover": hay que pararlas y crear otras.
   */
  function reprogramarMezclaDesde(desde: number) {
    const ctx = audioContextRef.current
    const master = mezclaGainRef.current
    const preparada = mezclaPreparadaRef.current
    if (!ctx || !master || !preparada) return

    detenerFuentesMezcla()

    const margen = 0.15
    const inicioContexto = ctx.currentTime + margen
    const fuentes: AudioBufferSourceNode[] = []

    for (const clip of preparada.clips) {
      const finClip = clip.posicion + clip.duracion
      if (finClip <= desde) continue // ya habría terminado antes de este punto

      const yaEmpezado = clip.posicion < desde
      const offset = yaEmpezado ? clip.offset + (desde - clip.posicion) : clip.offset
      const duracion = yaEmpezado ? finClip - desde : clip.duracion
      const cuando = yaEmpezado ? inicioContexto : inicioContexto + (clip.posicion - desde)

      const source = ctx.createBufferSource()
      source.buffer = clip.buffer
      source.connect(master)
      source.start(cuando, offset, duracion)
      fuentes.push(source)
    }

    fuentesActivasRef.current = fuentes
    mezclaInicioContextoRef.current = inicioContexto
    mezclaPosicionBaseRef.current = desde
    setProgresoMezcla(preparada.duracionTotal > 0 ? Math.min(1, Math.max(0, desde / preparada.duracionTotal)) : 0)

    const restante = Math.max(0, preparada.duracionTotal - desde)
    mezclaTimeoutRef.current = setTimeout(() => pararMezcla(), restante * 1000 + margen * 1000 + 300)
  }

  /** Salta la mezcla a la fracción (0 a 1) de la barra de progreso. */
  function buscarEnProgresoMezcla(fraccion: number) {
    const preparada = mezclaPreparadaRef.current
    if (!preparada) return
    const destino = Math.min(preparada.duracionTotal, Math.max(0, fraccion * preparada.duracionTotal))
    reprogramarMezclaDesde(destino)
  }

  /** Avanza o retrocede la mezcla `segundos` (negativo para retroceder). */
  function saltarMezcla(segundos: number) {
    const preparada = mezclaPreparadaRef.current
    const ctx = audioContextRef.current
    if (!preparada || !ctx) return
    const actual = mezclaPosicionBaseRef.current + (ctx.currentTime - mezclaInicioContextoRef.current)
    reprogramarMezclaDesde(Math.min(preparada.duracionTotal, Math.max(0, actual + segundos)))
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

  /**
   * Copia toda la carpeta elegida dentro de `destino`, archivo por archivo,
   * saltándose lo que ya ignoramos al escanear (Backup, "._...") y los
   * archivos de `excluir` (los sobrantes). No toca nada del original: solo
   * lee de ahí y escribe en la carpeta nueva.
   */
  async function copiarCarpeta(
    origen: FileSystemDirectoryHandle,
    destino: FileSystemDirectoryHandle,
    ruta: string[],
    excluir: Set<string>,
  ) {
    for await (const [nombre, handle] of origen.entries()) {
      if (copiaCancelarRef.current) return
      if (debeIgnorarse(nombre, handle.kind)) continue
      const rutaHijo = [...ruta, nombre]

      if (handle.kind === 'directory') {
        const subDestino = await destino.getDirectoryHandle(nombre, { create: true })
        await copiarCarpeta(handle, subDestino, rutaHijo, excluir)
      } else {
        if (excluir.has(rutaHijo.join('/'))) {
          setCopiaEnProgreso((prev) => (prev ? { ...prev, omitidos: prev.omitidos + 1 } : prev))
          continue
        }
        const archivo = await handle.getFile()
        const destinoHandle = await destino.getFileHandle(nombre, { create: true })
        const escribible = await destinoHandle.createWritable()
        await escribible.write(archivo)
        await escribible.close()
        setCopiaEnProgreso((prev) => (prev ? { ...prev, copiados: prev.copiados + 1 } : prev))
      }
    }
  }

  /**
   * Recorre la copia ya hecha (la carpeta destino, nunca el original) y
   * borra las carpetas que se hayan quedado completamente vacías — p. ej.
   * un "Samples/Recorded" cuyos archivos eran todos sobrantes. Devuelve si
   * la carpeta, tras esta limpieza, tiene algo dentro.
   */
  async function eliminarCarpetasVacias(carpeta: FileSystemDirectoryHandle): Promise<boolean> {
    const subcarpetasVacias: string[] = []
    let tieneAlgo = false

    for await (const [nombre, handle] of carpeta.entries()) {
      if (handle.kind === 'directory') {
        const tieneContenido = await eliminarCarpetasVacias(handle)
        if (tieneContenido) tieneAlgo = true
        else subcarpetasVacias.push(nombre)
      } else {
        tieneAlgo = true
      }
    }

    for (const nombre of subcarpetasVacias) {
      await carpeta.removeEntry(nombre, { recursive: true })
    }

    return tieneAlgo
  }

  /** Va creando (y reutilizando) la carpeta destino/segmentos[0]/segmentos[1]/... */
  async function abrirRuta(destino: FileSystemDirectoryHandle, segmentos: string[]): Promise<FileSystemDirectoryHandle> {
    let carpeta = destino
    for (const segmento of segmentos) {
      carpeta = await carpeta.getDirectoryHandle(segmento, { create: true })
    }
    return carpeta
  }

  async function crearCopiaOptimizada() {
    if (!raizHandle || !(await asegurarPermiso())) return
    setErrorCopia(null)

    let destino: FileSystemDirectoryHandle
    try {
      destino = await window.showDirectoryPicker()
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      throw err
    }

    // Si la carpeta destino está dentro de la propia carpeta de origen,
    // copiar se metería dentro de sí mismo sin parar.
    const dentroDelOrigen = await raizHandle.resolve(destino)
    if (dentroDelOrigen) {
      setErrorCopia('La carpeta destino no puede estar dentro de la carpeta de origen.')
      return
    }

    const planPorNombre = new Map(planOptimizacion.map((grupo) => [grupo.nombreActual, grupo]))
    copiaCancelarRef.current = false
    setCopiaEnProgreso({ copiados: 0, omitidos: 0 })
    try {
      for await (const [nombre, handle] of raizHandle.entries()) {
        if (copiaCancelarRef.current) return
        if (debeIgnorarse(nombre, handle.kind)) continue

        if (handle.kind !== 'directory') {
          // Un archivo suelto directamente en la carpeta raíz: se copia tal cual.
          if (rutasAExcluir.has(nombre)) {
            setCopiaEnProgreso((prev) => (prev ? { ...prev, omitidos: prev.omitidos + 1 } : prev))
            continue
          }
          const archivo = await handle.getFile()
          const destinoHandle = await destino.getFileHandle(nombre, { create: true })
          const escribible = await destinoHandle.createWritable()
          await escribible.write(archivo)
          await escribible.close()
          setCopiaEnProgreso((prev) => (prev ? { ...prev, copiados: prev.copiados + 1 } : prev))
          continue
        }

        // Carpetas de primer nivel: van a donde diga el plan (o se quedan
        // igual, con su mismo nombre, si no hay ningún proyecto dentro).
        const destinoSegmentos = planPorNombre.get(nombre)?.destino ?? [nombre]
        const carpetaDestino = await abrirRuta(destino, destinoSegmentos)
        await copiarCarpeta(handle, carpetaDestino, [nombre], rutasAExcluir)
      }

      if (!copiaCancelarRef.current) {
        await eliminarCarpetasVacias(destino)
      }
    } finally {
      setCopiaEnProgreso(null)
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

  /**
   * Varios clips distintos pueden compartir un mismo archivo de audio largo,
   * cada uno usando solo un trozo. Sin esto sonaría siempre desde el
   * principio del archivo, aunque el clip real esté más adelante.
   */
  function calcularTramo(clip: AudioClipInfo): { inicio: number; fin: number } | null {
    if (clip.inicioBeats == null || clip.finBeats == null || !clip.marcasDeTempo) return null
    const inicio = beatsASegundos(clip.inicioBeats, clip.marcasDeTempo)
    const fin = beatsASegundos(clip.finBeats, clip.marcasDeTempo)
    if (inicio == null || fin == null || fin <= inicio) return null
    return { inicio, fin }
  }

  async function reproducirHandle(path: string, handle: FileSystemFileHandle, clip?: AudioClipInfo) {
    const audioEl = audioElRef.current
    if (!audioEl) return

    pararMezcla()
    if (urlActual) URL.revokeObjectURL(urlActual)

    const file = await handle.getFile()
    const url = URL.createObjectURL(file)
    const tramo = clip ? calcularTramo(clip) : null

    audioEl.src = url
    audioEl.currentTime = tramo?.inicio ?? 0
    audioEl.onloadedmetadata = () => {
      setTramoActivo({ inicio: tramo?.inicio ?? 0, fin: tramo?.fin ?? audioEl.duration })
    }
    audioEl.ontimeupdate = () => {
      const inicio = tramo?.inicio ?? 0
      const fin = tramo?.fin ?? audioEl.duration
      const total = fin - inicio
      setProgresoReproduccion(total > 0 ? Math.min(1, (audioEl.currentTime - inicio) / total) : 0)
      if (tramo && audioEl.currentTime >= tramo.fin) pararReproduccion()
    }
    audioEl.onended = () => pararReproduccion()

    setUrlActual(url)
    setReproduciendoPath(path)
    setProgresoReproduccion(0)
    setTramoActivo({ inicio: tramo?.inicio ?? 0, fin: tramo?.fin ?? Number.POSITIVE_INFINITY })
    await audioEl.play()
  }

  /** Lleva la reproducción al segundo que corresponda a esa fracción (0 a 1) de la barra de progreso. */
  function buscarEnProgreso(fraccion: number) {
    const audioEl = audioElRef.current
    if (!audioEl || !tramoActivo) return
    const fin = Number.isFinite(tramoActivo.fin) ? tramoActivo.fin : audioEl.duration
    if (!Number.isFinite(fin)) return
    const destino = tramoActivo.inicio + Math.min(1, Math.max(0, fraccion)) * (fin - tramoActivo.inicio)
    audioEl.currentTime = destino
    const total = fin - tramoActivo.inicio
    setProgresoReproduccion(total > 0 ? (destino - tramoActivo.inicio) / total : 0)
  }

  /** Avanza o retrocede la reproducción `segundos` (negativo para retroceder), sin salirse del tramo. */
  function saltar(segundos: number) {
    const audioEl = audioElRef.current
    if (!audioEl || !tramoActivo) return
    const fin = Number.isFinite(tramoActivo.fin) ? tramoActivo.fin : audioEl.duration
    if (!Number.isFinite(fin)) return
    const destino = Math.min(fin, Math.max(tramoActivo.inicio, audioEl.currentTime + segundos))
    audioEl.currentTime = destino
    const total = fin - tramoActivo.inicio
    setProgresoReproduccion(total > 0 ? (destino - tramoActivo.inicio) / total : 0)
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

    await reproducirHandle(project.path, audioHandle, mejorClip)
  }

  async function onPlayClipClick(project: ProjectEntry, handle: FileSystemFileHandle, clip: AudioClipInfo) {
    if (!(await asegurarPermiso())) return
    await reproducirHandle(project.path, handle, clip)
  }

  /**
   * "Mezcla completa": decodifica los clips del carril principal de cada
   * pista y los reproduce todos a la vez, cada uno en su sitio del
   * arreglo — una maqueta cruda sumando las pistas, sin los plugins,
   * volúmenes ni paneo del proyecto real, y sin las pistas MIDI (no hay
   * forma de sintetizarlas aquí).
   *
   * Importante: aquí NO se usa `project.info.audioClips` (lo que ya
   * tenemos guardado), porque ese array ya pasó por `reducirClipsPorPista`
   * para no saturar la ficha con cientos de tomas — se queda solo con 1 o 2
   * clips por pista. Para la mezcla eso es justo lo contrario de lo que
   * hace falta: sonaría casi siempre una sola pista (o ninguna) en vez de
   * la canción entera. Así que se vuelve a leer el .als y se usan TODOS los
   * clips del carril principal, en su sitio real del arreglo.
   */
  async function reproducirMezcla(project: ProjectEntry) {
    if (!raizHandle) return

    const ctx = audioContextRef.current ?? new AudioContext()
    audioContextRef.current = ctx

    pararReproduccion()
    pararMezcla()
    if (!(await asegurarPermiso())) return
    if (ctx.state === 'suspended') await ctx.resume()

    setMezclaCargando(project.path)
    try {
      const carpetaProyecto = project.path.split('/').slice(0, -1)

      const alsHandle = await resolverArchivo(raizHandle, project.path.split('/'))
      if (!alsHandle) return
      const archivoAls = await alsHandle.getFile()
      const infoCompleta = await parseAlsProject(new Uint8Array(await archivoAls.arrayBuffer()))
      const bpm = infoCompleta.bpm
      if (!bpm) return

      // Solo el carril principal: las tomas archivadas no suenan en
      // Ableton, y aquí tampoco deberían. Sin reducir por pista: queremos
      // la canción entera, no solo un par de clips por pista.
      const clips = infoCompleta.audioClips.filter((clip) => clip.principal !== false)
      const numeroDePistas = new Set(clips.map((clip) => clip.track)).size

      const master = ctx.createGain()
      // Para que sumar varias pistas no sature: cuantas más pistas puedan
      // sonar a la vez, más bajo el volumen de cada una. (No es el número
      // de clips: una pista puede tener muchos clips a lo largo de la
      // canción, pero solo suena uno de ella cada vez.)
      master.gain.value = 1 / Math.sqrt(Math.max(1, numeroDePistas))
      master.connect(ctx.destination)
      mezclaGainRef.current = master

      const preparados: ClipMezclaPreparado[] = []
      // Varios clips pueden compartir el mismo archivo (p. ej. copiado y
      // pegado en varios sitios del arreglo): no lo decodificamos dos veces.
      const buffersPorRuta = new Map<string, AudioBuffer | null>()

      for (const clip of clips) {
        if (!clip.relativePath) continue
        const rutaDelArchivo = resolverSegmentos(carpetaProyecto, clip.relativePath).join('/')

        let buffer: AudioBuffer | null
        if (buffersPorRuta.has(rutaDelArchivo)) {
          buffer = buffersPorRuta.get(rutaDelArchivo) ?? null
        } else {
          const handle = await resolverClip(raizHandle, carpetaProyecto, clip, audioIndex)
          if (!handle) {
            buffer = null
          } else {
            const file = await handle.getFile()
            try {
              buffer = await ctx.decodeAudioData(await file.arrayBuffer())
            } catch {
              buffer = null // formato no decodificable por el navegador (p. ej. algunos AIFF); se omite
            }
          }
          buffersPorRuta.set(rutaDelArchivo, buffer)
        }
        if (!buffer) continue

        const tramo = calcularTramo(clip)
        const offset = tramo?.inicio ?? 0
        const duracionDisponible = Math.max(0, tramo ? tramo.fin - offset : buffer.duration - offset)
        // La grabación original no siempre está al mismo tempo que la
        // canción; Ableton la "estira" para que quepa justo en su hueco del
        // arreglo. Aquí no estiramos el audio, así que si dejáramos sonar
        // todo el tramo, se solaparía con el siguiente clip de la pista.
        // Cortamos en el hueco real para que no se pise con el de al lado.
        const huecoEnElArreglo = clip.durationBeats != null ? (clip.durationBeats * 60) / bpm : null
        const duracion = Math.min(duracionDisponible, huecoEnElArreglo ?? duracionDisponible)
        if (duracion <= 0) continue

        const posicion = clip.startBeats != null ? (clip.startBeats * 60) / bpm : 0
        preparados.push({ buffer, posicion, offset, duracion })
      }

      if (preparados.length === 0) return

      const duracionTotal = preparados.reduce((max, c) => Math.max(max, c.posicion + c.duracion), 0)
      mezclaPreparadaRef.current = { clips: preparados, duracionTotal }
      setDuracionMezcla(duracionTotal)
      setMezclaReproduciendo(project.path)

      reprogramarMezclaDesde(0)

      mezclaIntervaloRef.current = setInterval(() => {
        const ctxActual = audioContextRef.current
        const preparada = mezclaPreparadaRef.current
        if (!ctxActual || !preparada) return
        const transcurrido = mezclaPosicionBaseRef.current + (ctxActual.currentTime - mezclaInicioContextoRef.current)
        setProgresoMezcla(
          preparada.duracionTotal > 0 ? Math.min(1, Math.max(0, transcurrido / preparada.duracionTotal)) : 0,
        )
      }, 200)
    } finally {
      setMezclaCargando(null)
    }
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
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-[#f5f4f0] p-8 font-mono text-[#15130f]">
        <h1 className="text-xl font-bold tracking-wide">PROJECTRESCUE</h1>
        <p className="max-w-sm text-center text-sm text-[#58544b]">
          Tus archivos no salen de este ordenador. Elige la carpeta donde tienes tus proyectos de Ableton para
          empezar.
        </p>
        <button
          type="button"
          onClick={elegirCarpeta}
          disabled={loading}
          className="border border-[#15130f] px-5 py-2 text-sm text-[#15130f] hover:bg-[#15130f] hover:text-[#f5f4f0] disabled:opacity-50"
        >
          {loading ? 'Escaneando…' : 'Elegir carpeta de proyectos'}
        </button>
        {progreso && progreso.total > 0 && (
          <p className="text-xs text-[#716d63]">
            {progreso.leidos} de {progreso.total} proyectos
          </p>
        )}
        {notSupported && (
          <p className="max-w-sm text-center text-sm text-[#b03f3f]">
            Tu navegador no soporta elegir carpetas así. Prueba con Chrome o Edge de escritorio.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-[#f5f4f0] font-mono text-[#15130f]">
      {(necesitaPermiso || (progreso && progreso.total > 0) || notSupported) && (
        <div className="shrink-0 border-b border-[#ddd9cf] bg-[#efeeea] px-4 py-2 text-xs">
          {necesitaPermiso && (
            <div className="flex items-center gap-3 text-[#9c6f1e]">
              <span>Hace falta volver a dar permiso para leer la carpeta.</span>
              <button type="button" onClick={reconectarCarpeta} className="underline hover:text-[#15130f]">
                Reconectar carpeta
              </button>
            </div>
          )}
          {progreso && progreso.total > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[#58544b]">
                Escaneando: {progreso.leidos} de {progreso.total}
              </span>
              <div className="h-1 w-40 overflow-hidden bg-[#ddd9cf]">
                <div
                  className="h-full bg-[#15130f]"
                  style={{ width: `${(progreso.leidos / progreso.total) * 100}%` }}
                />
              </div>
            </div>
          )}
          {notSupported && (
            <p className="text-[#b03f3f]">Tu navegador no soporta elegir carpetas así. Prueba con Chrome o Edge.</p>
          )}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden text-[13px]">
        {/* Columna izquierda: carpetas, búsqueda y estadísticas */}
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-[#ddd9cf] bg-[#efeeea]">
          <div className="shrink-0 border-b border-[#ddd9cf] p-4">
            <h1 className="text-sm font-bold tracking-[0.15em]">PROJECTRESCUE</h1>
            <p className="mt-0.5 text-[10px] tracking-wide text-[#716d63]">TUS ARCHIVOS NO SALEN DE AQUÍ</p>
          </div>

          <div className="shrink-0 space-y-1.5 border-b border-[#ddd9cf] p-3">
            <button
              type="button"
              onClick={elegirCarpeta}
              disabled={loading}
              className="w-full border border-[#c9c5ba] px-2 py-1.5 text-left text-[12px] text-[#38352c] hover:border-[#a39e92] disabled:opacity-50"
            >
              {loading ? 'Escaneando…' : 'Cambiar carpeta…'}
            </button>
            <button
              type="button"
              onClick={buscarCambios}
              disabled={loading}
              className="w-full border border-[#c9c5ba] px-2 py-1.5 text-left text-[12px] text-[#38352c] hover:border-[#a39e92] disabled:opacity-50"
            >
              Buscar cambios
            </button>
          </div>

          <div className="shrink-0 border-b border-[#ddd9cf] p-3">
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar proyectos…"
              className="w-full border border-[#c9c5ba] bg-transparent px-2 py-1.5 text-[12px] text-[#15130f] placeholder:text-[#9c988d] focus:border-[#716d63] focus:outline-none"
            />
          </div>

          <div className="shrink-0 px-3 pt-3 text-[10px] tracking-[0.1em] text-[#9c988d]">CARPETAS</div>
          <div className="flex-1 overflow-y-auto px-1 py-1.5">
            <div
              className={`flex cursor-pointer items-center gap-1.5 py-1 pr-2 pl-2 text-[13px] ${
                claveDeCarpeta(carpetaSeleccionada) === '' && busqueda.trim() === ''
                  ? 'bg-[#e7e3d8] text-[#0a0a08]'
                  : 'text-[#827e73] hover:bg-[#eeebe1] hover:text-[#15130f]'
              }`}
              onClick={() => {
                setCarpetaSeleccionada([])
                setBusqueda('')
              }}
            >
              <span className="truncate">{raizHandle?.name ?? 'Carpeta'}</span>
              <span className="ml-auto text-[11px] text-[#9c988d]">{arbolDeCarpetas.numeroDeProyectos}</span>
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

          <div className="shrink-0 border-t border-[#ddd9cf] p-3">
            <label className="flex items-center gap-2 text-[11px] text-[#58544b]">
              <input
                type="checkbox"
                checked={ignorarRepetidos}
                onChange={(e) => setIgnorarRepetidos(e.target.checked)}
              />
              Ignorar repetidas en {UMBRAL_REPETICION}+ proyectos al reproducir
            </label>
          </div>

          <div className="shrink-0 border-t border-[#ddd9cf] p-3 text-[11px]">
            <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">ESTADÍSTICAS</div>
            <div className="flex justify-between text-[#58544b]">
              <span>Proyectos</span>
              <span className="text-[#38352c]">{projects.length}</span>
            </div>
            <div className="flex justify-between text-[#58544b]">
              <span>Tamaño total</span>
              <span className="text-[#38352c]">{formatoTamano(tamanoTotalBiblioteca)}</span>
            </div>
            <div className="flex justify-between text-[#58544b]">
              <span>Último escaneo</span>
              <span className="text-[#38352c]">{formatoFecha(ultimoEscaneo)}</span>
            </div>
          </div>

          <div className="shrink-0 border-t border-[#ddd9cf] p-3">
            <button
              type="button"
              onClick={() => setMostrarOptimizacion(true)}
              className="w-full px-3 py-2 text-center text-[12px] font-bold tracking-[0.1em] text-white"
              style={{ backgroundColor: COLOR_OPTIMIZAR }}
            >
              OPTIMIZAR
            </button>
          </div>
        </aside>

        {/* Columna del medio: lista de proyectos */}
        <main className="flex w-[22rem] shrink-0 flex-col overflow-hidden border-r border-[#ddd9cf]">
          <div className="shrink-0 border-b border-[#ddd9cf] px-4 py-3">
            <p className="text-[10px] text-[#9c988d]">
              {busqueda.trim()
                ? `Resultados de "${busqueda}"`
                : [raizHandle?.name, ...carpetaSeleccionada].filter(Boolean).join(' / ')}
            </p>
            <p className="mt-0.5 text-sm text-[#15130f]">{proyectosVisibles.length} proyectos</p>
          </div>

          <ul className="flex-1 divide-y divide-[#e2ded3] overflow-y-auto">
            {proyectosVisibles.map((project) => {
              const activo = proyectoSeleccionado === project.path
              const nombre = metaPorPath[project.path]?.alias || project.path.split('/').pop()?.replace(/\.als$/i, '')
              return (
                <li
                  key={project.path}
                  onClick={() => seleccionarProyecto(project)}
                  className={`cursor-pointer px-4 py-2.5 ${activo ? 'bg-[#ece8dd]' : 'hover:bg-[#efece3]'}`}
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
                    <p className="truncate text-sm text-[#15130f]">{nombre}</p>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-[#716d63]">
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
              <li className="px-4 py-6 text-center text-sm text-[#9c988d]">Nada por aquí.</li>
            )}
          </ul>
        </main>

        {/* Columna derecha: detalle del proyecto seleccionado */}
        <section className="flex flex-1 flex-col overflow-hidden">
          {!proyectoActivo ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[#9c988d]">
              Selecciona un proyecto para ver su detalle.
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[#ddd9cf] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] text-[#9c988d]">
                      {[raizHandle?.name, ...proyectoActivo.path.split('/').slice(0, -1)].filter(Boolean).join(' / ')}
                    </p>
                    <h2 className="truncate text-lg font-bold text-[#0a0a08]">
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

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#58544b]">
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

                {proyectoActivo.error && <p className="mt-2 text-sm text-[#b03f3f]">{proyectoActivo.error}</p>}

                <div className="mt-3 flex items-center gap-2">
                  {proyectoActivo.estado === 'con audio' &&
                    (reproduciendoPath === proyectoActivo.path ? (
                      <button
                        type="button"
                        onClick={pararReproduccion}
                        className="border border-[#b03f3f] px-3 py-1 text-[12px] text-[#b03f3f] hover:bg-[#b03f3f]/10"
                      >
                        ■ Parar
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onPlayClick(proyectoActivo)}
                        className="border border-[#15130f] px-3 py-1 text-[12px] text-[#15130f] hover:bg-[#15130f] hover:text-[#f5f4f0]"
                      >
                        ▶ Reproducir
                      </button>
                    ))}
                  {proyectoActivo.estado === 'con audio' &&
                    (mezclaReproduciendo === proyectoActivo.path ? (
                      <button
                        type="button"
                        onClick={pararMezcla}
                        className="border border-[#b03f3f] px-3 py-1 text-[12px] text-[#b03f3f] hover:bg-[#b03f3f]/10"
                      >
                        ■ Parar mezcla
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => reproducirMezcla(proyectoActivo)}
                        disabled={mezclaCargando === proyectoActivo.path}
                        className="border border-[#c9c5ba] px-3 py-1 text-[12px] text-[#38352c] hover:border-[#a39e92] disabled:opacity-50"
                      >
                        {mezclaCargando === proyectoActivo.path ? 'Preparando mezcla…' : '▶ Mezcla completa'}
                      </button>
                    ))}
                  <button
                    type="button"
                    onClick={() => copiarRuta(proyectoActivo)}
                    className="border border-[#c9c5ba] px-3 py-1 text-[12px] text-[#38352c] hover:border-[#a39e92]"
                  >
                    {rutaCopiada === proyectoActivo.path ? 'Ruta copiada' : 'Copiar ruta'}
                  </button>
                </div>
                {mezclaReproduciendo === proyectoActivo.path && (
                  <p className="mt-1 text-[11px] text-[#9c988d]">
                    Sumando todas las pistas en bruto: sin plugins, volúmenes ni paneo del proyecto, y sin las pistas
                    MIDI.
                  </p>
                )}

                {mezclaReproduciendo === proyectoActivo.path && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saltarMezcla(-5)}
                      aria-label="Retroceder 5 segundos"
                      className="shrink-0 text-[14px] text-[#58544b] hover:text-[#15130f]"
                    >
                      ⏪
                    </button>
                    <div
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        buscarEnProgresoMezcla((e.clientX - rect.left) / rect.width)
                      }}
                      className="w-full max-w-xs cursor-pointer py-2"
                    >
                      <div className="h-1 w-full overflow-hidden bg-[#ddd9cf]">
                        <div className="h-full bg-[#15130f]" style={{ width: `${progresoMezcla * 100}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => saltarMezcla(5)}
                      aria-label="Avanzar 5 segundos"
                      className="shrink-0 text-[14px] text-[#58544b] hover:text-[#15130f]"
                    >
                      ⏩
                    </button>
                    <span className="shrink-0 text-[11px] text-[#9c988d]">
                      {formatoSegundos(progresoMezcla * duracionMezcla)} / {formatoSegundos(duracionMezcla)}
                    </span>
                  </div>
                )}

                {reproduciendoPath === proyectoActivo.path && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => saltar(-5)}
                      aria-label="Retroceder 5 segundos"
                      className="shrink-0 text-[14px] text-[#58544b] hover:text-[#15130f]"
                    >
                      ⏪
                    </button>
                    <div
                      onClick={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect()
                        buscarEnProgreso((e.clientX - rect.left) / rect.width)
                      }}
                      className="w-full max-w-xs cursor-pointer py-2"
                    >
                      <div className="h-1 w-full overflow-hidden bg-[#ddd9cf]">
                        <div className="h-full bg-[#15130f]" style={{ width: `${progresoReproduccion * 100}%` }} />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => saltar(5)}
                      aria-label="Avanzar 5 segundos"
                      className="shrink-0 text-[14px] text-[#58544b] hover:text-[#15130f]"
                    >
                      ⏩
                    </button>
                  </div>
                )}

                <div className="mt-3 flex gap-4 text-[11px] tracking-[0.1em] text-[#716d63]">
                  <button
                    type="button"
                    onClick={() => setPestanaActiva('pistas')}
                    className={pestanaActiva === 'pistas' ? 'border-b border-[#15130f] pb-1 text-[#15130f]' : 'pb-1'}
                  >
                    PISTAS
                  </button>
                  <button
                    type="button"
                    onClick={() => setPestanaActiva('info')}
                    className={pestanaActiva === 'info' ? 'border-b border-[#15130f] pb-1 text-[#15130f]' : 'pb-1'}
                  >
                    INFO
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {pestanaActiva === 'info' ? (
                  <div className="max-w-sm space-y-3 text-[12px]">
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#9c988d]">ALIAS</label>
                      <input
                        type="text"
                        defaultValue={metaPorPath[proyectoActivo.path]?.alias ?? ''}
                        onBlur={(e) => guardarMeta(proyectoActivo.path, { alias: e.target.value })}
                        placeholder="Ponle un alias…"
                        className="w-full border border-[#c9c5ba] bg-transparent px-2 py-1.5 text-[#15130f] focus:border-[#716d63] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#9c988d]">ETIQUETAS</label>
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
                        className="w-full border border-[#c9c5ba] bg-transparent px-2 py-1.5 text-[#15130f] focus:border-[#716d63] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] tracking-[0.1em] text-[#9c988d]">RUTA COMPLETA</label>
                      <p className="break-all text-[#58544b]">
                        {raizHandle?.name}/{proyectoActivo.path}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    {sobrantesDeLaCarpetaActiva.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setMostrarOptimizacion(true)}
                        className="mb-3 block text-left text-[11px] text-[#9c6f1e] underline decoration-dotted"
                      >
                        {sobrantesDeLaCarpetaActiva.length === 1
                          ? 'Esta carpeta tiene 1 archivo de audio que ningún proyecto usa'
                          : `Esta carpeta tiene ${sobrantesDeLaCarpetaActiva.length} archivos de audio que ningún proyecto usa`}
                        {' → verlo en OPTIMIZAR'}
                      </button>
                    )}

                    <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[#58544b]">
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
                        <div key={`${trackName}-${i}`} className="border-b border-[#e2ded3]">
                          <button
                            type="button"
                            onClick={() => tieneClips && togglePista(proyectoActivo.path, trackName)}
                            className="flex w-full items-center gap-2 py-2 text-left"
                          >
                            <span className="w-2.5 shrink-0 text-[10px] text-[#9c988d]">
                              {tieneClips ? (expandida ? '▾' : '▸') : ''}
                            </span>
                            <span className="shrink-0" style={{ color }}>
                              <IconoPista tipo={tipo} color={color} />
                            </span>
                            <span className="truncate text-[13px] text-[#15130f]">{trackName}</span>
                            <span className="ml-auto shrink-0 text-[11px] text-[#9c988d]">
                              {tieneClips ? `${todosDeLaPista?.length} clip${todosDeLaPista?.length === 1 ? '' : 's'}` : 'MIDI'}
                            </span>
                          </button>

                          {expandida && tieneClips && (
                            <div className="pb-2 pl-5">
                              {clipsDeLaPista && clipsDeLaPista.length === 0 ? (
                                <p className="py-1 text-[11px] text-[#9c988d]">
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
                                          onClick={() => onPlayClipClick(proyectoActivo, handle, clip)}
                                          className="flex h-5 w-5 shrink-0 items-center justify-center border border-[#c4c0b5] text-[10px] text-[#38352c] hover:border-[#15130f] hover:text-[#15130f]"
                                        >
                                          ▶
                                        </button>
                                      ) : (
                                        <span className="h-5 w-5 shrink-0" />
                                      )}
                                      <BarrasDecorativas semilla={clip.relativePath ?? String(idx)} color={color} />
                                      <span className="w-40 shrink-0 truncate text-[12px] text-[#38352c]">
                                        {nombreArchivo}
                                      </span>
                                      <span className="w-12 shrink-0 text-right text-[11px] text-[#716d63]">
                                        {formatoDuracion(clip.durationBeats, proyectoActivo.info?.bpm ?? null)}
                                      </span>
                                      <span className="w-16 shrink-0 text-right text-[11px] text-[#716d63]">
                                        {formatoTamano(clip.originalFileSize)}
                                      </span>
                                      <span className="w-24 shrink-0 text-right text-[11px] text-[#9c988d]">
                                        {!resueltos ? 'comprobando…' : handle ? 'encontrado' : 'no encontrado'}
                                      </span>
                                      {veces >= 2 && (
                                        <span className="shrink-0 text-[10px] text-[#9c988d]">en {veces} proyectos</span>
                                      )}
                                    </div>
                                  )
                                })
                              )}
                              {!mostrarNoEncontrados && noEncontrados > 0 && clipsDeLaPista && clipsDeLaPista.length > 0 && (
                                <p className="pt-0.5 text-[10px] text-[#9c988d]">
                                  + {noEncontrados} no encontrada{noEncontrados === 1 ? '' : 's'} (oculta
                                  {noEncontrados === 1 ? '' : 's'})
                                </p>
                              )}
                              {!mostrarOtrosArchivos && archivadasOcultas > 0 && clipsDeLaPista && clipsDeLaPista.length > 0 && (
                                <p className="pt-0.5 text-[10px] text-[#9c988d]">
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

      {mostrarOptimizacion && (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-6">
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-[#c9c5ba] bg-[#f5f4f0] text-[13px]">
            <div className="flex items-center justify-between border-b border-[#ddd9cf] px-4 py-3">
              <h2 className="text-sm font-bold tracking-[0.1em]">OPTIMIZACIÓN DE LA BIBLIOTECA</h2>
              <button
                type="button"
                onClick={() => setMostrarOptimizacion(false)}
                aria-label="Cerrar"
                className="text-[#58544b] hover:text-[#15130f]"
              >
                ✕
              </button>
            </div>

            {audioIndex.length === 0 ? (
              <p className="p-4 text-[#58544b]">
                Para proponer una optimización hace falta escanear la carpeta en esta sesión: usa "Cambiar carpeta…" o
                "Buscar cambios".
              </p>
            ) : (
              <>
                <div className="shrink-0 border-b border-[#ddd9cf] px-4 py-3" style={{ backgroundColor: '#f1ece2' }}>
                  <p className="text-[12px] text-[#38352c]">
                    <strong>No se borra ni se modifica nada de tu ordenador.</strong> Esto solo crea, en la carpeta
                    que elijas, un clon de tu biblioteca optimizado y ordenado. Compruébalo con calma y, cuando estés
                    seguro de que todo está bien, borra tú la carpeta original — por seguridad, eso lo decides y lo
                    haces tú.
                  </p>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  {/* Izquierda: qué se quita y qué pasa con cada carpeta */}
                  <div className="w-72 shrink-0 overflow-y-auto border-r border-[#ddd9cf] p-4">
                    <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">ARCHIVOS SOBRANTES</div>
                    {archivosSobrantes.length === 0 ? (
                      <p className="mb-4 text-[#58544b]">Ninguno: no hay nada que sobre.</p>
                    ) : (
                      <>
                        <p className="mb-2 text-[#38352c]">
                          {archivosSobrantes.length} archivo{archivosSobrantes.length === 1 ? '' : 's'} · {formatoTamano(tamanoSobrantes)}
                        </p>
                        <ul className="mb-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                          {gruposSobrantes.map((grupo) => (
                            <li key={grupo.carpeta}>
                              <details>
                                <summary className="cursor-pointer list-none">
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="truncate text-[#38352c]">{grupo.carpeta}</span>
                                    <span className="shrink-0 text-[#9c988d]">
                                      {grupo.archivos.length} · {formatoTamano(grupo.tamano)}
                                    </span>
                                  </div>
                                  <div className="mt-1 h-1.5 w-full bg-[#e2ded3]">
                                    <div
                                      className="h-full"
                                      style={{
                                        width: `${Math.max(2, (grupo.tamano / Math.max(1, tamanoSobrantes)) * 100)}%`,
                                        backgroundColor: COLOR_OPTIMIZAR,
                                      }}
                                    />
                                  </div>
                                </summary>
                                <ul className="mt-1.5 ml-2 space-y-1 border-l border-[#e2ded3] pl-2">
                                  {grupo.archivos.map((archivo) => (
                                    <li key={archivo.path} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="truncate text-[#58544b]">{archivo.path}</span>
                                      <span className="shrink-0 text-[#9c988d]">{formatoTamano(archivo.size)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">ENCONTRADO, PERO SIN USAR</div>
                    {archivosSinUsar.length === 0 ? (
                      <p className="mb-4 text-[#58544b]">Ninguno.</p>
                    ) : (
                      <>
                        <p className="mb-1 text-[#38352c]">
                          {archivosSinUsar.length} archivo{archivosSinUsar.length === 1 ? '' : 's'} · {formatoTamano(tamanoSinUsar)}
                        </p>
                        <p className="mb-2 text-[11px] text-[#9c988d]">
                          Son tomas que algún proyecto tiene archivadas, pero ninguna pista reproduce de verdad. No
                          son basura con la misma certeza que los sobrantes, así que se quedan en la copia salvo que
                          lo pidas.
                        </p>
                        <label className="mb-2 flex items-center gap-2 text-[11px] text-[#38352c]">
                          <input
                            type="checkbox"
                            checked={incluirSinUsar}
                            onChange={(e) => setIncluirSinUsar(e.target.checked)}
                          />
                          Quitarlos también de la copia optimizada
                        </label>
                        <ul className="mb-4 max-h-48 space-y-2 overflow-y-auto pr-1">
                          {gruposSinUsar.map((grupo) => (
                            <li key={grupo.carpeta}>
                              <details>
                                <summary className="cursor-pointer list-none">
                                  <div className="flex items-center justify-between gap-2 text-[11px]">
                                    <span className="truncate text-[#38352c]">{grupo.carpeta}</span>
                                    <span className="shrink-0 text-[#9c988d]">
                                      {grupo.archivos.length} · {formatoTamano(grupo.tamano)}
                                    </span>
                                  </div>
                                </summary>
                                <ul className="mt-1.5 ml-2 space-y-1 border-l border-[#e2ded3] pl-2">
                                  {grupo.archivos.map((archivo) => (
                                    <li key={archivo.path} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="truncate text-[#58544b]">{archivo.path}</span>
                                      <span className="shrink-0 text-[#9c988d]">{formatoTamano(archivo.size)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </details>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    {carpetasSinAudios.length > 0 && (
                      <>
                        <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">
                          CARPETAS QUE SE QUEDARÍAN VACÍAS
                        </div>
                        <p className="mb-2 text-[11px] text-[#9c988d]">
                          No se crean en la copia optimizada: no tiene sentido una carpeta sin ningún audio dentro.
                        </p>
                        <ul className="mb-4 max-h-32 space-y-0.5 overflow-y-auto">
                          {carpetasSinAudios.map((carpeta) => (
                            <li key={carpeta} className="truncate text-[11px] text-[#58544b]">
                              {carpeta}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}

                    <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">CARPETAS QUE SE REORGANIZAN</div>
                    <p className="mb-4 text-[#38352c]">
                      {planOptimizacion.filter((g) => !g.fija).length} de {planOptimizacion.length}
                    </p>

                    {arbolPropuesto.fijas.length > 0 && (
                      <>
                        <div className="mb-1.5 text-[10px] tracking-[0.1em] text-[#9c988d]">SE QUEDAN IGUAL</div>
                        <ul className="space-y-1">
                          {arbolPropuesto.fijas.map((grupo) => (
                            <li key={grupo.nombreActual} className="text-[11px] text-[#58544b]">
                              <span className="text-[#38352c]">{grupo.nombreActual}</span> — comparte archivos con
                              otra carpeta
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>

                  {/* Derecha: árbol de carpetas propuesto */}
                  <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-2 text-[10px] tracking-[0.1em] text-[#9c988d]">ÁRBOL PROPUESTO</div>
                    {arbolPropuesto.buckets.length === 0 ? (
                      <p className="text-[#58544b]">
                        Ninguna carpeta se puede reorganizar sin romper referencias entre proyectos; se copiarían tal
                        cual están ahora.
                      </p>
                    ) : (
                      <ul>
                        {arbolPropuesto.buckets.map((bucket) => (
                          <li key={bucket.nombre} className="mb-3">
                            <p className="font-bold text-[#15130f]">{bucket.nombre}</p>
                            <ul className="ml-4 mt-1 space-y-0.5">
                              {bucket.grupos.map((grupo) => (
                                <li key={grupo.nombreActual} className="flex items-center gap-1.5 text-[#38352c]">
                                  <span className="text-[#9c988d]">└</span>
                                  {grupo.nombreActual}
                                  <span className="text-[11px] text-[#9c988d]">
                                    ({grupo.numeroDeProyectos} proyecto{grupo.numeroDeProyectos === 1 ? '' : 's'})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="shrink-0 border-t border-[#ddd9cf] p-4">
              {errorCopia && <p className="mb-2 text-[12px] text-[#b03f3f]">{errorCopia}</p>}
              {copiaEnProgreso ? (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[12px] text-[#58544b]">
                    Copiando… {copiaEnProgreso.copiados} copiados, {copiaEnProgreso.omitidos} omitidos
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      copiaCancelarRef.current = true
                    }}
                    className="border border-[#b03f3f] px-3 py-1 text-[12px] text-[#b03f3f] hover:bg-[#b03f3f]/10"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={crearCopiaOptimizada}
                  disabled={audioIndex.length === 0}
                  className="px-4 py-2 text-[12px] font-bold tracking-[0.05em] text-white disabled:opacity-50"
                  style={{ backgroundColor: COLOR_OPTIMIZAR }}
                >
                  Descargar carpeta optimizada…
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
