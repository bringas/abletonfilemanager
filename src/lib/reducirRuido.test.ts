import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import { reducirClipsPorPista } from './reducirRuido'
import type { AudioFileEntry } from './scanFolder'

function clip(nombre: string, durationBeats: number | null, principal?: boolean): AudioClipInfo {
  return {
    track: 'Voz',
    relativePath: `Samples/Recorded/${nombre}`,
    originalFileSize: null,
    durationBeats,
    ...(principal === false ? { principal: false } : {}),
  }
}

function archivo(nombre: string, lastModified: number): AudioFileEntry {
  return {
    handle: {} as FileSystemFileHandle,
    path: `proyecto/Samples/Recorded/${nombre}`,
    name: nombre,
    size: 0,
    lastModified,
  }
}

describe('reducirClipsPorPista', () => {
  it('no toca una pista con pocos clips: todos se muestran por defecto', () => {
    const clips = [clip('a.wav', 4), clip('b.wav', 8), clip('c.wav', 2)]
    const resultado = reducirClipsPorPista(clips, [], ['proyecto'])

    expect(resultado).toHaveLength(3)
    expect(resultado.every((c) => c.mostrarPorDefecto === true)).toBe(true)
  })

  it('con muchos clips en el carril principal, solo se muestran el más reciente y el más largo', () => {
    const clips = Array.from({ length: 10 }, (_, i) => clip(`take${i}.wav`, i))
    // "take9" es el más largo (durationBeats=9) y además el más reciente.
    const indice = clips.map((_, i) => archivo(`take${i}.wav`, i))

    const resultado = reducirClipsPorPista(clips, indice, ['proyecto'])
    const mostrados = resultado.filter((c) => c.mostrarPorDefecto)

    expect(mostrados).toHaveLength(1)
    expect(mostrados[0].relativePath).toBe('Samples/Recorded/take9.wav')
    // El resto del carril principal se descarta (no se acumulan cientos de clips).
    expect(resultado.every((c) => c.mostrarPorDefecto)).toBe(true)
  })

  it('si el más reciente y el más largo son distintos, se muestran los dos', () => {
    const clips = [
      clip('corto-reciente.wav', 1),
      clip('largo-viejo.wav', 50),
      ...Array.from({ length: 8 }, (_, i) => clip(`relleno${i}.wav`, 2)),
    ]
    const indice = [
      archivo('corto-reciente.wav', 1000),
      archivo('largo-viejo.wav', 10),
      ...Array.from({ length: 8 }, (_, i) => archivo(`relleno${i}.wav`, 100)),
    ]

    const resultado = reducirClipsPorPista(clips, indice, ['proyecto'])
    const mostrados = resultado.filter((c) => c.mostrarPorDefecto).map((c) => c.relativePath)

    expect(mostrados).toContain('Samples/Recorded/corto-reciente.wav')
    expect(mostrados).toContain('Samples/Recorded/largo-viejo.wav')
    expect(mostrados).toHaveLength(2)
  })

  it('cada pista se reduce por separado', () => {
    const muchosDeVoz = Array.from({ length: 10 }, (_, i) => clip(`voz${i}.wav`, i))
    const pocosDeBajo: AudioClipInfo[] = [{ ...clip('bajo.wav', 4), track: 'Bajo' }]

    const resultado = reducirClipsPorPista([...muchosDeVoz, ...pocosDeBajo], [], ['proyecto'])

    expect(resultado.filter((c) => c.track === 'Bajo')).toHaveLength(1)
    expect(resultado.filter((c) => c.track === 'Voz').length).toBeLessThanOrEqual(2)
  })

  it('si una pista solo tiene tomas archivadas (sin carril principal), se usan como mejor estimación', () => {
    const clips = [clip('toma1.wav', 4, false), clip('toma2.wav', 8, false)]
    const resultado = reducirClipsPorPista(clips, [], ['proyecto'])

    expect(resultado).toHaveLength(2)
    expect(resultado.every((c) => c.mostrarPorDefecto === true)).toBe(true)
  })

  it('si hay clips en el carril principal, las tomas archivadas quedan ocultas por defecto', () => {
    const clips = [
      clip('principal.wav', 8),
      clip('toma-vieja-1.wav', 4, false),
      clip('toma-vieja-2.wav', 6, false),
    ]
    const resultado = reducirClipsPorPista(clips, [], ['proyecto'])

    const mostrados = resultado.filter((c) => c.mostrarPorDefecto)
    const ocultos = resultado.filter((c) => !c.mostrarPorDefecto)

    expect(mostrados).toHaveLength(1)
    expect(mostrados[0].relativePath).toBe('Samples/Recorded/principal.wav')
    expect(ocultos).toHaveLength(2)
  })

  it('si hay muchas tomas archivadas, también se reducen a lo más reciente y lo más largo', () => {
    const principal = clip('principal.wav', 1)
    const tomasArchivadas = Array.from({ length: 10 }, (_, i) => clip(`vieja${i}.wav`, i, false))
    const indice = tomasArchivadas.map((_, i) => archivo(`vieja${i}.wav`, i))

    const resultado = reducirClipsPorPista([principal, ...tomasArchivadas], indice, ['proyecto'])
    const ocultos = resultado.filter((c) => !c.mostrarPorDefecto)

    expect(ocultos).toHaveLength(1)
    expect(ocultos[0].relativePath).toBe('Samples/Recorded/vieja9.wav')
  })
})
