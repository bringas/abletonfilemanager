import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import type { ProjectRecord } from './db'
import {
  agruparSobrantesPorCarpeta,
  archivosUsados,
  encontrarArchivosSinUsar,
  encontrarArchivosSobrantes,
  encontrarCarpetasSinAudios,
} from './limpieza'
import type { AudioFileEntry } from './scanFolder'

function clip(relativePath: string | null, principal?: boolean): AudioClipInfo {
  return {
    track: 'Pista',
    relativePath,
    originalFileSize: null,
    durationBeats: null,
    ...(principal === false ? { principal: false } : {}),
  }
}

function proyecto(path: string, clips: AudioClipInfo[]): ProjectRecord {
  return { path, info: { liveVersion: '', bpm: 120, tracks: ['Pista'], audioClips: clips } }
}

function archivo(path: string, size = 100): AudioFileEntry {
  const name = path.split('/').pop() ?? path
  return { handle: {} as FileSystemFileHandle, path, name, size, lastModified: 0 }
}

describe('archivosUsados', () => {
  it('resuelve la ruta de cada clip relativa a la carpeta de su proyecto', () => {
    const projects = [proyecto('Ideas/A Project/A.als', [clip('Samples/Recorded/a.wav')])]
    expect(archivosUsados(projects)).toEqual(new Set(['Ideas/A Project/Samples/Recorded/a.wav']))
  })

  it('sigue rutas con ".." hacia otro proyecto', () => {
    const projects = [
      proyecto('Ideas/A Project/A.als', [clip('../B Project/Samples/Recorded/b.wav')]),
    ]
    expect(archivosUsados(projects)).toEqual(new Set(['Ideas/B Project/Samples/Recorded/b.wav']))
  })

  it('ignora clips sin ruta y proyectos sin info', () => {
    const projects = [
      proyecto('A Project/A.als', [clip(null)]),
      { path: 'B Project/B.als' } as ProjectRecord,
    ]
    expect(archivosUsados(projects)).toEqual(new Set())
  })
})

describe('encontrarArchivosSobrantes', () => {
  it('un archivo que nadie referencia es sobrante', () => {
    const projects = [proyecto('A Project/A.als', [clip('Samples/Recorded/usado.wav')])]
    const indice = [archivo('A Project/Samples/Recorded/usado.wav'), archivo('A Project/Samples/Recorded/huerfano.wav')]

    const sobrantes = encontrarArchivosSobrantes(projects, indice)

    expect(sobrantes.map((a) => a.path)).toEqual(['A Project/Samples/Recorded/huerfano.wav'])
  })

  it('un archivo compartido entre proyectos (vía "..") no es sobrante aunque su propio proyecto no lo use', () => {
    const projects = [
      proyecto('carlos y oscar Project/jam.als', []),
      proyecto('la religiosidad Project/la religiosidad.als', [
        clip('../carlos y oscar Project/Samples/Recorded/bass.wav'),
      ]),
    ]
    const indice = [archivo('carlos y oscar Project/Samples/Recorded/bass.wav')]

    expect(encontrarArchivosSobrantes(projects, indice)).toEqual([])
  })

  it('no confunde archivos con el mismo nombre en carpetas distintas', () => {
    const projects = [proyecto('A Project/A.als', [clip('Samples/Recorded/take.wav')])]
    const indice = [
      archivo('A Project/Samples/Recorded/take.wav'),
      archivo('B Project/Samples/Recorded/take.wav'),
    ]

    const sobrantes = encontrarArchivosSobrantes(projects, indice)

    expect(sobrantes.map((a) => a.path)).toEqual(['B Project/Samples/Recorded/take.wav'])
  })
})

describe('agruparSobrantesPorCarpeta', () => {
  it('agrupa por carpeta de primer nivel y suma el tamaño', () => {
    const archivos = [
      archivo('Ideas/A Project/Samples/Recorded/a.wav', 100),
      archivo('Ideas/B Project/Samples/Recorded/b.wav', 50),
      archivo('Finished/C Project/Samples/Recorded/c.wav', 10),
    ]

    const grupos = agruparSobrantesPorCarpeta(archivos)

    expect(grupos.map((g) => g.carpeta)).toEqual(['Ideas', 'Finished'])
    expect(grupos[0].tamano).toBe(150)
    expect(grupos[1].tamano).toBe(10)
  })

  it('ordena las carpetas de más pesada a menos, y los archivos dentro igual', () => {
    const archivos = [
      archivo('A/pequeno.wav', 10),
      archivo('A/grande.wav', 200),
      archivo('B/medio.wav', 50),
    ]

    const grupos = agruparSobrantesPorCarpeta(archivos)

    expect(grupos.map((g) => g.carpeta)).toEqual(['A', 'B'])
    expect(grupos[0].archivos.map((a) => a.name)).toEqual(['grande.wav', 'pequeno.wav'])
  })
})

describe('encontrarArchivosSinUsar', () => {
  it('un archivo solo referenciado desde una toma archivada está sin usar (no es sobrante)', () => {
    const projects = [proyecto('A Project/A.als', [clip('Samples/Recorded/vieja.wav', false)])]
    const indice = [archivo('A Project/Samples/Recorded/vieja.wav')]

    const sinUsar = encontrarArchivosSinUsar(projects, indice)
    const sobrantes = encontrarArchivosSobrantes(projects, indice)

    expect(sinUsar.map((a) => a.path)).toEqual(['A Project/Samples/Recorded/vieja.wav'])
    expect(sobrantes).toEqual([])
  })

  it('si el mismo archivo también está en el carril principal de otro clip, no cuenta como sin usar', () => {
    const projects = [
      proyecto('A Project/A.als', [clip('Samples/Recorded/x.wav', false), clip('Samples/Recorded/x.wav')]),
    ]
    const indice = [archivo('A Project/Samples/Recorded/x.wav')]

    expect(encontrarArchivosSinUsar(projects, indice)).toEqual([])
  })

  it('un archivo huérfano no cuenta como sin usar (son categorías distintas)', () => {
    const projects = [proyecto('A Project/A.als', [])]
    const indice = [archivo('A Project/Samples/Recorded/huerfano.wav')]

    expect(encontrarArchivosSinUsar(projects, indice)).toEqual([])
  })
})

describe('encontrarCarpetasSinAudios', () => {
  it('una carpeta cuyos audios están todos excluidos se propone vacía', () => {
    const indice = [
      archivo('A Project/Samples/Recorded/a.wav'),
      archivo('A Project/Samples/Recorded/b.wav'),
      archivo('B Project/Samples/Recorded/c.wav'),
    ]
    const excluidos = new Set(['A Project/Samples/Recorded/a.wav', 'A Project/Samples/Recorded/b.wav'])

    const vacias = encontrarCarpetasSinAudios(indice, excluidos)

    expect(vacias).toContain('A Project/Samples/Recorded')
    expect(vacias).toContain('A Project/Samples')
    expect(vacias).toContain('A Project')
    expect(vacias).not.toContain('B Project')
  })

  it('si queda aunque sea un audio, la carpeta no se propone vacía', () => {
    const indice = [archivo('A Project/Samples/Recorded/a.wav'), archivo('A Project/Samples/Recorded/b.wav')]
    const excluidos = new Set(['A Project/Samples/Recorded/a.wav'])

    expect(encontrarCarpetasSinAudios(indice, excluidos)).toEqual([])
  })
})
