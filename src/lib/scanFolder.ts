export interface FoundAls {
  handle: FileSystemFileHandle
  path: string
}

/**
 * Las carpetas "Backup" son copias automáticas que guarda Live de cada
 * proyecto, y los archivos que empiezan por "._" son metadatos que crea
 * macOS en discos externos. Ninguno de los dos es un proyecto real.
 */
export function debeIgnorarse(name: string, kind: 'file' | 'directory'): boolean {
  if (name.startsWith('._')) return true
  if (kind === 'directory' && name === 'Backup') return true
  return false
}

export async function buscarArchivosAls(
  dirHandle: FileSystemDirectoryHandle,
  path = '',
): Promise<FoundAls[]> {
  const encontrados: FoundAls[] = []

  for await (const [name, handle] of dirHandle.entries()) {
    if (debeIgnorarse(name, handle.kind)) continue

    const entryPath = path ? `${path}/${name}` : name
    if (handle.kind === 'directory') {
      encontrados.push(...(await buscarArchivosAls(handle, entryPath)))
    } else if (name.toLowerCase().endsWith('.als')) {
      encontrados.push({ handle, path: entryPath })
    }
  }

  return encontrados
}
