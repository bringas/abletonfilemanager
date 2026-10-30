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
 * (eso lo confirma el usuario a ojo); aquí solo se comprueba que el lector no se
 * rompe con archivos reales y que saca datos con sentido.
 */
const realFixtures = [
  { file: 'idea frsh cheers.als', expectedVersion: 'Ableton Live 9.7.1' },
  { file: 'barrera de coral 3.als', expectedVersion: 'Ableton Live 9.7.1' },
  { file: 'idea berto 2.als', expectedVersion: 'Ableton Live 9.7.1' },
  { file: 'camoeli2.als', expectedVersion: 'Ableton Live 11.3.13' },
  { file: 'la religiosidad.als', expectedVersion: 'Ableton Live 11.3.13' },
]

describe('parseAlsProject con proyectos reales', () => {
  for (const { file, expectedVersion } of realFixtures) {
    const ruta = resolve(process.cwd(), 'tests/fixtures', file)

    it.skipIf(!existsSync(ruta))(`lee "${file}" sin romperse`, async () => {
      const buffer = await readFile(ruta)
      const info = await parseAlsProject(new Uint8Array(buffer))

      expect(info.liveVersion).toBe(expectedVersion)
      expect(info.bpm).not.toBeNull()
      expect(info.bpm).toBeGreaterThan(0)
      expect(info.tracks.length).toBeGreaterThan(0)
    })
  }
})
