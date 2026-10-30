import { describe, expect, it } from 'vitest'
import { formatoDuracion, formatoFecha, formatoTamano } from './formato'

describe('formatoTamano', () => {
  it('muestra megabytes por debajo de 1 GB', () => {
    expect(formatoTamano(14_200_000)).toBe('13.5 MB')
  })

  it('cambia a gigabytes a partir de 1024 MB', () => {
    expect(formatoTamano(2 * 1024 * 1024 * 1024)).toBe('2.0 GB')
  })

  it('sin tamaño, devuelve un guion', () => {
    expect(formatoTamano(null)).toBe('—')
    expect(formatoTamano(undefined)).toBe('—')
  })
})

describe('formatoDuracion', () => {
  it('convierte beats a minutos:segundos usando el BPM', () => {
    // 120 BPM, 64 beats -> 32s
    expect(formatoDuracion(64, 120)).toBe('0:32')
  })

  it('sin duración o sin BPM, devuelve un guion', () => {
    expect(formatoDuracion(null, 120)).toBe('—')
    expect(formatoDuracion(64, null)).toBe('—')
    expect(formatoDuracion(64, 0)).toBe('—')
  })
})

describe('formatoFecha', () => {
  it('formatea una fecha en español, corta', () => {
    const resultado = formatoFecha(new Date('2024-03-12T10:00:00Z'))
    expect(resultado).toMatch(/mar/i)
    expect(resultado).toMatch(/2024/)
  })

  it('sin fecha, devuelve un guion', () => {
    expect(formatoFecha(null)).toBe('—')
    expect(formatoFecha(undefined)).toBe('—')
  })
})
