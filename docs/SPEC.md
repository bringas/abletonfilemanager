# ProjectRescue — Documento de desarrollo

Oct 30, 2026 · @Carlos

## Resumen

ProjectRescue es una web que cataloga tus proyectos de Ableton Live y te deja oír las grabaciones que contienen sin abrir Live ni haber exportado nada. Todo ocurre dentro del navegador: ningún archivo sale del ordenador.

Principios no negociables:

- **Es una web.** Se abre con una URL y no se instala nada.
- **Nada se sube.** El servidor solo entrega la página. Los proyectos y los audios se leen en local, sin backend, cuentas ni base de datos en la nube.
- **Solo lectura.** La app nunca mueve, renombra ni modifica archivos. Los nombres nuevos son alias guardados en el catálogo.
- **El objetivo es reconocer la idea en segundos, sin abrir Live.** Si el proyecto tiene una mezcla (pista o export llamado algo como "Master", "Mix", "Bounce" o "Export"), esa suena primero porque es la que mejor representa la idea completa. Si no la hay, se usan las grabaciones originales del proyecto.

La monetización queda fuera de este documento y se decidirá con la app funcionando.

## Recorrido del usuario

La primera visita debe llevar de la URL a la primera preescucha en menos de dos minutos. Las siguientes, en un clic.

**Primera visita**

1. **Llega a la web.** Ve una frase que explica qué hace, un aviso de privacidad ("Tus archivos no salen de este ordenador") y un único botón: *Elegir carpeta de proyectos*.
2. **Comprobación del navegador.** En Chrome o Edge de escritorio sigue el flujo completo. En Safari o Firefox ve un aviso y la alternativa de sesión única (ver *Acceso a archivos y persistencia*).
3. **Elige la carpeta.** El navegador abre su selector nativo y pide permiso de lectura. No se copia nada.
4. **Escaneo.** La app recorre la carpeta, encuentra los .als y los audios, y descarta las copias de seguridad. Una barra indica "47 de 180 proyectos" y la lista se va llenando mientras lee.
5. **Biblioteca.** Lista ordenada por última modificación. Cada fila muestra nombre, fecha, BPM, número de pistas y un indicador de preescucha: hay grabaciones, solo MIDI, o audios no encontrados.
6. **Escucha desde la lista.** Un botón de play en cada fila hace sonar unos 15 segundos de la grabación más representativa. Puede ir de proyecto en proyecto sin abrir ninguno.
7. **Abre la ficha.** Ve las pistas, los clips de audio y el estado de cada archivo referenciado. Puede escuchar las demás grabaciones del proyecto.
8. **Lo reconoce.** Le pone un alias ("Post-punk, riff octavado"), etiquetas y lo marca como favorito.
9. **Vuelve a Live.** Copia la ruta del proyecto dentro de la carpeta elegida y lo abre en Live por su cuenta. La web no puede abrir Live.

**Visitas siguientes**

1. Abre la web y el catálogo ya está: alias, etiquetas y favoritos se guardan en el navegador.
2. Para escuchar, pulsa *Reconectar carpeta* y concede el permiso de nuevo si el navegador lo pide.
3. *Buscar cambios* relee solo los proyectos nuevos o modificados desde la última vez.

## Alcance del MVP

El viernes tiene que funcionar la columna de la izquierda. La del medio solo entra si sobra tiempo.

| Imprescindible | Si sobra tiempo | Fuera del MVP |
| --- | --- | --- |
| Elegir una carpeta raíz | Varias carpetas raíz (por ejemplo, la de samples) | Reproducir MIDI, instrumentos VST o la mezcla completa |
| Leer cada .als: nombre, fecha, versión de Live, BPM, pistas y clips de audio | Forma de onda en miniatura | Modificar, mover o renombrar archivos |
| Localizar los audios referenciados dentro de la carpeta | Saltar silencios al elegir el fragmento | Abrir el proyecto en Live desde la web |
| Preescucha de un fragmento por proyecto | Exportar e importar el catálogo como copia de seguridad | Cuentas, pagos y sincronización entre dispositivos |
| Búsqueda por nombre, alias y nombre de pista | Modo de sesión única para Safari y Firefox | Versión móvil y otros DAW |
| Alias, etiquetas y favoritos guardados en el navegador |  |  |
| Reescaneo de proyectos nuevos o modificados |  |  |

## Arquitectura

La app es una página estática: un hosting gratuito la entrega y, a partir de ahí, todo ocurre en el navegador.

Flujo de datos (todo dentro del navegador):

- Hosting estático → entrega solo la página (HTML, JS, CSS). Nunca recibe archivos.
- Disco del usuario (solo lectura) → **Escáner** (recorre la carpeta y lista .als y audios) → **Lector .als** (descomprime y lee BPM, pistas, clips) → **Buscador de audios** (por ruta relativa o nombre + tamaño) → **Catálogo** (IndexedDB con Dexie, más alias y etiquetas).
- **Catálogo** → **Interfaz** (biblioteca, ficha, búsqueda, alias) → **Reproductor** (lee unos 15 s de audio directamente del disco, solo lectura).

Los archivos solo viajan del disco al navegador, en modo lectura. Ninguna flecha sale del navegador hacia el servidor.

| Pieza | Elección | Por qué |
| --- | --- | --- |
| Proyecto | Vite + React + TypeScript | Web estática sin servidor; los tipos ayudan a la IA a detectar errores |
| Descompresión | `DecompressionStream` | Nativa del navegador, sin dependencias |
| XML | `DOMParser` | Nativo del navegador, sin dependencias |
| Base de datos local | Dexie sobre IndexedDB | Consultas sencillas y guarda el handle de la carpeta |
| Audio | Elemento `<audio>` con `URL.createObjectURL` | Lee del disco sin cargar el archivo entero |
| Estilos | Tailwind CSS | Las herramientas de IA lo escriben con soltura |
| Código y despliegue | GitHub + Vercel, Netlify o Cloudflare Pages | Plan gratuito; cada cambio subido se publica solo |

## Lectura de proyectos .als

Un .als es un XML comprimido con gzip. El navegador puede descomprimirlo y leerlo sin servidor y sin librerías externas.

1. Leer el archivo como bytes desde la carpeta elegida.
2. Descomprimirlo con `DecompressionStream('gzip')`, que viene de serie en el navegador.
3. Convertirlo a texto y analizarlo como XML con `DOMParser`.
4. Extraer los datos de la tabla.

| Dato | Dónde está en el XML | Nota |
| --- | --- | --- |
| Versión de Live | Atributo `Creator` del elemento raíz `Ableton` | Decide cómo leer las rutas de audio |
| BPM | `MasterTrack` (Live 9 a 11) o `MainTrack` (Live 12) → `DeviceChain` → `Mixer` → `Tempo` → `Manual` | Buscar los dos nombres |
| Pistas | `Tracks` → `AudioTrack`, `MidiTrack`, `GroupTrack`, `ReturnTrack` | Nombre en `Name` → `EffectiveName` |
| Clips de audio | `AudioClip` dentro de cada pista de audio | En la vista de arreglo y en la de sesión |
| Archivo de cada clip | `AudioClip` → `SampleRef` → `FileRef` | Cambia según la versión (abajo) |
| Tamaño del audio | `FileRef` → `OriginalFileSize` | Confirma que el archivo encontrado es el correcto |

**Rutas según la versión de Live**

- **Live 11 y 12:** cada `FileRef` trae `Path` (ruta absoluta), `RelativePath` (relativa al proyecto) y `RelativePathType`. Es el caso fácil.
- **Live 9 y 10:** la ruta es una lista de `RelativePathElement` (atributo `Dir`) más `Name`, y un bloque `Data` en hexadecimal. Para el MVP basta con los elementos y el nombre; `Data` se ignora.

Los proyectos antiguos, los que más interesa rescatar, son justo los del formato viejo. Por eso la prueba del lunes incluye al menos uno de Live 9 o 10.

**Qué ignorar al escanear**

- Las carpetas `Backup`, donde Live guarda copias automáticas de cada proyecto.
- Los archivos que empiezan por `._`: macOS los crea en discos externos y no son proyectos reales.
- Cualquier archivo que no descomprima o no sea XML válido. Se marca como "no legible" y el escaneo sigue.

**Rendimiento.** Un .als descomprimido puede ocupar muchos megas. Se leen de uno en uno, con barra de progreso. Si la interfaz se congela, el análisis pasa a un Web Worker. Ojo: `DOMParser` no existe dentro de un Worker, así que haría falta una librería XML en JavaScript.

## Resolución de audios y preescucha

El navegador solo ve lo que hay dentro de la carpeta elegida y no puede abrir una ruta absoluta. Por eso cada audio se busca así:

1. **Ruta relativa.** Se sigue la ruta relativa del `FileRef` desde la carpeta del proyecto. Así se encuentran casi todas las grabaciones, que Live guarda en `Samples/Recorded` dentro del proyecto.
2. **Índice por nombre.** Durante el escaneo se apuntan todos los audios de la carpeta raíz con su nombre y tamaño. Si la ruta relativa falla, se busca por nombre y se confirma con `OriginalFileSize`.
3. **No encontrado.** Si tampoco aparece, el clip se marca así: el audio está fuera de la carpeta elegida o se borró.

Los archivos `.asd` que hay junto a los audios son análisis internos de Live. Se ignoran.

**Qué grabación suena primero**

El objetivo es reconocer la idea en pocos segundos:

1. **Master/mezcla/export**: una pista o clip cuyo nombre sugiera que es la mezcla completa (`Master`, `Mix`, `Bounce`, `Export`...). Representa mejor la idea que una grabación suelta.
2. Audio grabado por ti, en `Samples/Recorded`.
3. Audio consolidado o procesado, en `Samples/Processed`. Las pistas congeladas (`Freeze`) podrían dejar oír partes MIDI; se investiga el martes.
4. Samples importados de librerías, como último recurso: suenan igual en muchos proyectos.

Dentro de cada grupo gana el clip más largo del arreglo. Suenan unos 15 segundos, saltando el silencio inicial cuando lo hay; si no se puede calcular, desde el principio del archivo.

**Cómo se reproduce**

- Un elemento `<audio>` con `URL.createObjectURL(archivo)`. Lee del disco sin cargar el archivo entero en memoria y permite saltar al segundo deseado.
- WAV, MP3, FLAC y OGG suenan sin más en Chrome.
- AIFF no está garantizado en Chrome. Si tus grabaciones son AIFF, se añade una librería de decodificación como `audio-decode`. La prueba del lunes lo confirma.

## Acceso a archivos y persistencia

Chrome y Edge de escritorio dan acceso de lectura a una carpeta y pueden recordarlo entre visitas. Es el flujo principal.

**Primera visita**

- `showDirectoryPicker()` abre el selector nativo y devuelve un *handle* de la carpeta con permiso de lectura.
- Ese handle se guarda en IndexedDB, la base de datos local del navegador.
- El handle no revela la ruta absoluta del disco, solo los nombres desde la carpeta elegida. Por eso *Copiar ruta* copia algo como `Proyectos/2019/Untitled 47.als`.

**Visitas siguientes**

- La app recupera el handle de IndexedDB y, al pulsar *Reconectar carpeta*, llama a `requestPermission()`.
- Desde Chrome 122, ese aviso ofrece permitir el acceso en cada visita. Si el usuario lo elige, no se le vuelve a preguntar.
- `navigator.storage.persist()` pide al navegador que no borre los datos de la app para liberar espacio.

**Otros navegadores**

- La app comprueba si existe `showDirectoryPicker`, no el nombre del navegador.
- Si no existe (Safari, Firefox), se ofrece `<input type="file" webkitdirectory>`. Permite elegir una carpeta para esa sesión, pero no recuerda el permiso: para volver a escuchar hay que elegirla otra vez. El catálogo sí se conserva.

**Dónde vive el catálogo**

- Todo se guarda en IndexedDB a través de Dexie, una librería que lo hace manejable.
- Los datos existen solo en ese navegador de ese ordenador. Si el usuario borra los datos del sitio, pierde alias y etiquetas, no sus proyectos. La exportación a JSON lo cubre si sobra tiempo.

## Modelo de datos

Cinco tablas en IndexedDB. Lo que escribe el usuario va en una tabla aparte para que un reescaneo nunca lo pise.

| Tabla | Para qué | Campos principales |
| --- | --- | --- |
| `roots` | Carpetas elegidas | id, nombre, handle, fecha del último escaneo |
| `projects` | Un registro por .als | id (carpeta raíz + ruta relativa), nombre de archivo, fecha de modificación, tamaño, versión de Live, BPM, número de pistas, estado de preescucha |
| `clips` | Clips de audio de cada proyecto | projectId, pista, nombre del archivo, tamaño original, categoría (grabado, procesado, sample), punto de inicio, duración, ruta encontrada o vacía |
| `audioFiles` | Índice de audios de la carpeta | carpeta raíz, ruta relativa, nombre, tamaño |
| `userMeta` | Lo que añade el usuario | projectId, alias, etiquetas, favorito, notas |

El estado de preescucha toma uno de cuatro valores: *con audio*, *solo MIDI*, *audio no encontrado* o *no legible*. La fecha de modificación de cada .als permite saber qué hay que releer en un reescaneo.

## Plan de lunes a viernes

Cada día termina con algo que funciona y queda publicado. El lunes decide si se sigue.

- **Lunes — Montaje y prueba decisiva.** Mañana: Node, editor, herramienta de IA, GitHub y hosting; publicar una página vacía. Tarde: leer 5 .als propios (uno de Live 9 o 10), sacar BPM y pistas, y oír una grabación.
- **Criterio:** pasa si suena audio en 3 de 5 proyectos. Si no, se cambia de proyecto ese mismo día.
- **Martes — Escáner completo y catálogo.** Recorrer la carpeta entera, ignorar Backup y archivos ._, guardar todo en IndexedDB; barra de progreso, estados de preescucha, investigar pistas congeladas.
- **Miércoles — Biblioteca y preescucha.** Lista con búsqueda y orden, play en cada fila, ficha de proyecto; regla de qué grabación suena primero.
- **Jueves — Lo tuyo y la vuelta.** Alias, etiquetas y favoritos; Reconectar carpeta; reescaneo de cambios; prueba con la biblioteca completa.
- **Viernes — Pulido y publicación.** Portada con aviso de privacidad, mensajes de error, prueba en Edge, dominio y publicación.

Publicar una página vacía el lunes por la mañana evita que el despliegue sea una sorpresa el viernes. Las horas para un principiante son el doble de lo que parecen: lo que no quepa pasa a *Si sobra tiempo*.

**Prueba del lunes**

- [ ] Cinco .als propios leídos sin error, al menos uno de Live 9 o 10
- [ ] BPM y nombres de pista coinciden con lo que muestra Live
- [ ] Una grabación suena en el navegador en al menos tres proyectos
- [ ] Comprobado si tus grabaciones son WAV o AIFF

## Riesgos, límites y decisiones pendientes

El mayor riesgo es que las rutas de los proyectos antiguos no se resuelvan. Todo lo demás tiene salida conocida.

| Riesgo | Cómo se nota | Qué hacer |
| --- | --- | --- |
| Rutas de Live 9 y 10 que no se resuelven | Muchos *audio no encontrado* en proyectos viejos | Buscar por nombre y tamaño; si no basta, leer el bloque `Data` en los proyectos de Windows |
| Grabaciones en AIFF | Error al pulsar play | Librería de decodificación |
| Proyectos solo con MIDI | Indicador *solo MIDI* | Aceptarlo; investigar las pistas congeladas |
| Audios en otro disco o en librerías | *Audio no encontrado* con la ruta absoluta visible | Permitir varias carpetas raíz |
| Cientos de proyectos | La interfaz se congela al escanear | Mover el análisis a un Web Worker |
| Proyecto movido o renombrado | Desaparece su alias tras reescanear | Volver a emparejar por nombre y tamaño (después del MVP) |
| Safari y Firefox | No existe `showDirectoryPicker` | Modo de sesión única |
| Versiones futuras de Live | Campos nuevos o renombrados | Leer de forma tolerante e ignorar lo desconocido |

**Decisiones pendientes**

- [ ] Nombre definitivo y dominio
- [ ] Analítica de visitas, si la hay: nunca nombres de archivo ni rutas
- [ ] Monetización, con la app ya publicada

## Fuentes

- [Persistent permissions for the File System Access API (Chrome for Developers)](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api)
- [Rutas en .als según la versión de Live (daw-project-manager, issue 216)](https://github.com/bandpassrecords/daw-project-manager/issues/216)
- [Importador de .als de Live 8.2 a 12 (ethereal, PR 261)](https://github.com/diegoimbert/ethereal/pull/261)
- [MasterTrack y MainTrack en el parser bravoh-daw](https://docs.rs/crate/bravoh-daw/0.1.0/source/src/ableton.rs)
- [Ruta del tempo en el XML de un .als (foro de QLab)](https://groups.google.com/g/qlab/c/F5Tg83tvH2Y)
- [AIFF y decodeAudioData en Chrome (Volcengine)](https://www.volcengine.com/article/2303275)
