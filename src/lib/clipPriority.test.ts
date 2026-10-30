import { describe, expect, it } from 'vitest'
import type { AudioClipInfo } from './alsReader'
import { categorizarClip, elegirMejorClip } from './clipPriority'

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
