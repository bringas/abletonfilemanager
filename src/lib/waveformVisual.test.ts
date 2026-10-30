import { describe, expect, it } from 'vitest'
import { generarBarras } from './waveformVisual'

describe('generarBarras', () => {
  it('devuelve la cantidad de barras pedida', () => {
    expect(generarBarras('audio.wav', 20)).toHaveLength(20)
  })

  it('es determinista: la misma semilla da las mismas barras', () => {
    expect(generarBarras('audio.wav', 10)).toEqual(generarBarras('audio.wav', 10))
  })

  it('semillas distintas dan barras distintas', () => {
    expect(generarBarras('a.wav', 10)).not.toEqual(generarBarras('b.wav', 10))
  })

  it('todas las alturas están entre 0.2 y 1', () => {
    for (const altura of generarBarras('x.wav', 50)) {
      expect(altura).toBeGreaterThanOrEqual(0.2)
      expect(altura).toBeLessThanOrEqual(1)
    }
  })
})
