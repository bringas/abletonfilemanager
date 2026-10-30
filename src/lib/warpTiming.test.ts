import { describe, expect, it } from 'vitest'
import { beatsASegundos } from './warpTiming'

describe('beatsASegundos', () => {
  // Marcas reales sacadas de un clip de "la religiosidad.als" (100 BPM):
  // dos marcas muy juntas al principio del archivo, que Ableton usa para
  // extrapolar el resto del tempo (0.6 segundos por beat = 100 BPM).
  const marcasReales = [
    { segundos: 0, beats: 0.649433118964368949 },
    { segundos: 0.0187499999999999993, beats: 0.680683118964368949 },
  ]

  it('con menos de dos marcas, no se puede calcular', () => {
    expect(beatsASegundos(10, [])).toBeNull()
    expect(beatsASegundos(10, [{ segundos: 0, beats: 0 }])).toBeNull()
  })

  it('en el beat de la primera marca, da su segundo exacto', () => {
    expect(beatsASegundos(0.649433118964368949, marcasReales)).toBeCloseTo(0, 9)
  })

  it('extrapola más allá de las marcas usando su pendiente (caso real)', () => {
    // HiddenLoopEnd=56 de ese mismo clip: a 100 BPM, debería caer sobre los 33.2s.
    const segundos = beatsASegundos(56, marcasReales)
    expect(segundos).not.toBeNull()
    expect(segundos as number).toBeCloseTo(33.2103, 3)
  })

  it('interpola entre dos marcas intermedias', () => {
    const marcas = [
      { segundos: 0, beats: 0 },
      { segundos: 2, beats: 4 },
      { segundos: 10, beats: 20 },
    ]
    // Punto medio entre la 2ª y 3ª marca.
    expect(beatsASegundos(12, marcas)).toBeCloseTo(6, 9)
  })

  it('extrapola hacia atrás si el beat pedido es anterior a la primera marca', () => {
    const marcas = [
      { segundos: 10, beats: 20 },
      { segundos: 12, beats: 24 },
    ]
    expect(beatsASegundos(0, marcas)).toBeCloseTo(0, 9)
  })

  it('no rompe si dos marcas comparten el mismo beat', () => {
    const marcas = [
      { segundos: 1, beats: 5 },
      { segundos: 1.5, beats: 5 },
    ]
    expect(beatsASegundos(5, marcas)).toBe(1)
  })
})
