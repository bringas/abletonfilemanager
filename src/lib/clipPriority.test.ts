import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import type { AudioFileEntry } from './scanFolder'
import { categorizarClip, elegirMejorClip, encontrarExportacionesSueltas } from './clipPriority'

function clip(parcial: Partial<AudioClipInfo>): AudioClipInfo {
  return {
    track: 'Pista',
    relativePath: 'Samples/Recorded/audio.wav',
    originalFileSize: null,
    durationBeats: 16,
    ...parcial,
  }
}

describe('categorizarClip', () => {
  it('reconoce una pista de master/mezcla por el nombre', () => {
    expect(categorizarClip(clip({ track: 'Master' }))).toBe('master')
    expect(categorizarClip(clip({ track: 'Mix final' }))).toBe('master')
    expect(categorizarClip(clip({ track: 'Bounce 2' }))).toBe('master')
  })

  it('reconoce grabaciones propias por la ruta', () => {
    expect(categorizarClip(clip({ relativePath: 'Samples/Recorded/idea.wav' }))).toBe('grabado')
  })

  it('reconoce audio procesado por la ruta', () => {
    expect(categorizarClip(clip({ relativePath: 'Samples/Processed/idea.wav' }))).toBe('procesado')
  })

  it('el resto cuenta como librería', () => {
    expect(categorizarClip(clip({ relativePath: 'Samples/Imported/kick.wav' }))).toBe('libreria')
  })

  it('reconoce un master también por el nombre del archivo, aunque la pista no diga nada', () => {
    expect(
      categorizarClip(clip({ track: '1-Audio', relativePath: 'Mezcla Final.wav' })),
    ).toBe('master')
    expect(
      categorizarClip(clip({ track: 'Audio 3', relativePath: 'Exports/Bounce 2024.wav' })),
    ).toBe('master')
  })
})

describe('encontrarExportacionesSueltas', () => {
  function archivo(parcial: Partial<AudioFileEntry>): AudioFileEntry {
    return { handle: {} as FileSystemFileHandle, path: 'proyecto/x.wav', name: 'x.wav', size: 0, ...parcial }
  }

  it('encuentra un archivo de master/bounce en la carpeta del proyecto, aunque no esté en el .als', () => {
    const indice = [archivo({ path: 'proyecto/Mezcla Final.wav', name: 'Mezcla Final.wav', size: 123 })]
    const resultado = encontrarExportacionesSueltas(indice, ['proyecto'])

    expect(resultado).toEqual([
      {
        track: '(archivo exportado, no está en la sesión)',
        relativePath: 'Mezcla Final.wav',
        originalFileSize: 123,
        durationBeats: null,
      },
    ])
  })

  it('ignora archivos de otros proyectos', () => {
    const indice = [archivo({ path: 'otro proyecto/Bounce.wav', name: 'Bounce.wav' })]
    expect(encontrarExportacionesSueltas(indice, ['proyecto'])).toEqual([])
  })

  it('ignora archivos que no parecen un master/bounce', () => {
    const indice = [archivo({ path: 'proyecto/Samples/Recorded/idea.wav', name: 'idea.wav' })]
    expect(encontrarExportacionesSueltas(indice, ['proyecto'])).toEqual([])
  })
})

describe('elegirMejorClip', () => {
  it('devuelve null si no hay clips con ruta', () => {
    expect(elegirMejorClip([clip({ relativePath: null })])).toBeNull()
  })

  it('prioriza el master aunque sea más corto que una grabación', () => {
    const master = clip({ track: 'Master', relativePath: 'Bounce/mezcla.wav', durationBeats: 4 })
    const grabado = clip({ track: 'Voz', relativePath: 'Samples/Recorded/voz.wav', durationBeats: 64 })

    expect(elegirMejorClip([grabado, master])).toBe(master)
  })

  it('dentro de la misma categoría, gana el clip más largo', () => {
    const corto = clip({ relativePath: 'Samples/Recorded/a.wav', durationBeats: 8 })
    const largo = clip({ relativePath: 'Samples/Recorded/b.wav', durationBeats: 32 })

    expect(elegirMejorClip([corto, largo])).toBe(largo)
  })

  it('si no hay master ni grabado, usa lo procesado antes que la librería', () => {
    const libreria = clip({ relativePath: 'Samples/Imported/kick.wav', durationBeats: 100 })
    const procesado = clip({ relativePath: 'Samples/Processed/mix.wav', durationBeats: 4 })

    expect(elegirMejorClip([libreria, procesado])).toBe(procesado)
  })
})
