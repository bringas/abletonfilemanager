import { describe, expect, it } from 'vitest'
import { resolverSegmentos } from './resolvePath'

describe('resolverSegmentos', () => {
  it('resuelve una ruta relativa dentro de la misma carpeta del proyecto', () => {
    const resultado = resolverSegmentos(
      ['carlos y oscar', 'camoeli2 Project'],
      'Samples/Recorded/audio.wav',
    )
    expect(resultado).toEqual(['carlos y oscar', 'camoeli2 Project', 'Samples', 'Recorded', 'audio.wav'])
  })

  it('sube de carpeta con ".." hasta otro proyecto hermano', () => {
    // Caso real encontrado en camoeli2.als: el audio está en otro proyecto.
    const resultado = resolverSegmentos(
      ['carlos y oscar', 'camoeli2 Project'],
      '../../Untitled Project/Samples/Recorded/audio.wav',
    )
    expect(resultado).toEqual(['Untitled Project', 'Samples', 'Recorded', 'audio.wav'])
  })

  it('ignora segmentos "."', () => {
    const resultado = resolverSegmentos(['proyecto'], './Samples/audio.wav')
    expect(resultado).toEqual(['proyecto', 'Samples', 'audio.wav'])
  })
})
