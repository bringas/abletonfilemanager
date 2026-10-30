import { describe, expect, it } from 'vitest'
import { calcularEstado } from './estadoPreescucha'

describe('calcularEstado', () => {
  it('es "no legible" si el proyecto dio error, aunque tenga clips', () => {
    expect(calcularEstado({ tieneError: true, numeroDeClips: 3, algunoEncontrado: true })).toBe(
      'no legible',
    )
  })

  it('es "solo MIDI" si no hay ningún clip de audio', () => {
    expect(calcularEstado({ tieneError: false, numeroDeClips: 0, algunoEncontrado: false })).toBe(
      'solo MIDI',
    )
  })

  it('es "con audio" si hay clips y al menos uno se encontró', () => {
    expect(calcularEstado({ tieneError: false, numeroDeClips: 2, algunoEncontrado: true })).toBe(
      'con audio',
    )
  })

  it('es "audio no encontrado" si hay clips pero ninguno se encontró', () => {
    expect(calcularEstado({ tieneError: false, numeroDeClips: 2, algunoEncontrado: false })).toBe(
      'audio no encontrado',
    )
  })
})
