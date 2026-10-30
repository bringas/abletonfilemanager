import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAlsProject } from './alsReader'
import { beatsASegundos } from './warpTiming'

/**
 * Estos son proyectos .als reales del usuario (3 de Live 9.7.1, 2 de Live 11.3.13).
 * Viven solo en local (tests/fixtures/*.als está en .gitignore, nunca se suben a
 * GitHub), así que estos tests se saltan solos si los archivos no están presentes.
 * No se verifica el valor exacto de BPM/pistas contra lo que muestra Ableton Live
 * (eso lo confirma el usuario a ojo); aquí se comprueba que el lector no se rompe
 * con archivos reales, que saca datos con sentido, y que al menos encuentra el
 * clip de audio real que confirmamos a mano en cada proyecto.
 */
const realFixtures = [
  {
    file: 'idea frsh cheers.als',
    expectedVersion: 'Ableton Live 9.7.1',
    // Formato viejo: ruta reconstruida a partir de RelativePathElement + Name.
    expectedClip: { relativePath: 'Samples/Recorded/0002 3-Audio-1.wav', originalFileSize: null },
  },
  { file: 'barrera de coral 3.als', expectedVersion: 'Ableton Live 9.7.1' },
  { file: 'idea berto 2.als', expectedVersion: 'Ableton Live 9.7.1' },
  {
    file: 'camoeli2.als',
    expectedVersion: 'Ableton Live 11.3.13',
    expectedClip: {
      relativePath: '../../Untitled Project/Samples/Recorded/3-Audio 0001 [2024-10-28 184520].wav',
      originalFileSize: 10990316,
    },
  },
  // Copia actualizada por el usuario el 30 oct 2026 (ya con las pistas
  // renombradas: guitarra 1, guitarra 2 izq/der, bass), tras subir de
  // versión de Live.
  { file: 'la religiosidad.als', expectedVersion: 'Ableton Live 11.3.43' },
]

describe('parseAlsProject con proyectos reales', () => {
  for (const { file, expectedVersion, expectedClip } of realFixtures) {
    const ruta = resolve(process.cwd(), 'tests/fixtures', file)

    it.skipIf(!existsSync(ruta))(`lee "${file}" sin romperse`, async () => {
      const buffer = await readFile(ruta)
      const info = await parseAlsProject(new Uint8Array(buffer))

      expect(info.liveVersion).toBe(expectedVersion)
      expect(info.bpm).not.toBeNull()
      expect(info.bpm).toBeGreaterThan(0)
      expect(info.tracks.length).toBeGreaterThan(0)

      if (expectedClip) {
        expect(info.audioClips).toContainEqual(
          expect.objectContaining({
            relativePath: expectedClip.relativePath,
            originalFileSize: expectedClip.originalFileSize,
          }),
        )
      }
    })
  }

  // camoeli2.als tiene una pista grabada muchas veces: casi todas esas tomas
  // quedaron en "take lanes" (carriles que Ableton no reproduce por defecto),
  // así que deben venir marcadas como no principales.
  const rutaCamoeli2 = resolve(process.cwd(), 'tests/fixtures', 'camoeli2.als')
  it.skipIf(!existsSync(rutaCamoeli2))('marca como no principales las tomas archivadas en carriles', async () => {
    const buffer = await readFile(rutaCamoeli2)
    const info = await parseAlsProject(new Uint8Array(buffer))

    const archivadas = info.audioClips.filter((clip) => clip.principal === false)
    expect(archivadas.length).toBeGreaterThan(100)
  })

  // guitarra 1 de "la religiosidad.als": varios clips comparten un mismo
  // archivo largo ("oscar clean 0019...wav"), cada uno usando un trozo
  // distinto. Sin leer el tramo real (HiddenLoopStart/End + WarpMarkers),
  // todos sonarían igual (desde el principio del archivo).
  const rutaReligiosidad = resolve(process.cwd(), 'tests/fixtures', 'la religiosidad.als')
  it.skipIf(!existsSync(rutaReligiosidad))('calcula el tramo real de los clips de guitarra 1', async () => {
    const buffer = await readFile(rutaReligiosidad)
    const info = await parseAlsProject(new Uint8Array(buffer))

    const deGuitarra1 = info.audioClips.filter((clip) => clip.track === 'guitarra 1' && clip.principal !== false)
    expect(deGuitarra1.length).toBeGreaterThan(0)

    const tramos = deGuitarra1.map((clip) => {
      expect(clip.inicioBeats).not.toBeUndefined()
      expect(clip.finBeats).not.toBeUndefined()
      expect(clip.marcasDeTempo?.length ?? 0).toBeGreaterThanOrEqual(2)
      const inicio = beatsASegundos(clip.inicioBeats as number, clip.marcasDeTempo ?? [])
      const fin = beatsASegundos(clip.finBeats as number, clip.marcasDeTempo ?? [])
      expect(inicio).not.toBeNull()
      expect(fin).not.toBeNull()
      expect((fin as number) - (inicio as number)).toBeGreaterThan(0)
      return { relativePath: clip.relativePath, inicio, fin }
    })

    // No todos los clips de "oscar clean 0019...wav" deberían empezar en el
    // mismo segundo: si lo hicieran, seguiríamos sonando siempre lo mismo.
    const inicios = new Set(tramos.map((t) => t.inicio))
    expect(inicios.size).toBeGreaterThan(1)
  })

  // Live a veces deja "OriginalFileSize Value=\"0\"" (no es un tamaño real).
  // Si se cuela como si lo fuera, la app puede confundir un archivo con otro
  // al buscar por nombre. Ninguna fixture real debería traer un 0.
  for (const { file } of realFixtures) {
    const ruta = resolve(process.cwd(), 'tests/fixtures', file)
    it.skipIf(!existsSync(ruta))(`"${file}": ningún clip se queda con tamaño 0`, async () => {
      const buffer = await readFile(ruta)
      const info = await parseAlsProject(new Uint8Array(buffer))
      expect(info.audioClips.some((clip) => clip.originalFileSize === 0)).toBe(false)
    })
  }
})
