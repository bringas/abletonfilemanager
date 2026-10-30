import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseAlsProject } from './alsReader'

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
  { file: 'la religiosidad.als', expectedVersion: 'Ableton Live 11.3.13' },
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
})
