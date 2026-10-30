import Dexie, { type EntityTable } from 'dexie'
import type { AlsProjectInfo } from './alsReader'
import type { EstadoPreescucha } from './estadoPreescucha'

export interface RootRecord {
  /** Solo soportamos una carpeta raíz a la vez (MVP), así que el id es fijo. */
  id: number
  nombre: string
  handle: FileSystemDirectoryHandle
  ultimoEscaneo: Date
}

export interface ProjectRecord {
  path: string
  info?: AlsProjectInfo
  error?: string
  estado?: EstadoPreescucha
  /** Fecha de modificación del .als (timestamp), para ordenar la biblioteca. */
  lastModified?: number
}

/**
 * Lo que escribe el usuario (alias, etiquetas, favorito). Va en su propia
 * tabla para que un reescaneo de `projects` nunca lo pise.
 */
export interface UserMetaRecord {
  projectId: string
  alias?: string
  etiquetas?: string[]
  favorito?: boolean
}

type ProjectRescueDB = Dexie & {
  roots: EntityTable<RootRecord, 'id'>
  projects: EntityTable<ProjectRecord, 'path'>
  userMeta: EntityTable<UserMetaRecord, 'projectId'>
}

export const db = new Dexie('ProjectRescueDB') as ProjectRescueDB

db.version(1).stores({
  roots: 'id',
  projects: 'path',
})

db.version(2).stores({
  roots: 'id',
  projects: 'path',
  userMeta: 'projectId',
})

export const ROOT_ID = 1
