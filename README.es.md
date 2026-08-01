# ai-os

**Un sistema operativo basado en agentes.** Construido sobre
[QM](https://github.com/yc-software/qm), y yendo más allá en cuatro direcciones:
cómo se le da *forma* al trabajo (`ai-flows`), cómo se *ve* el sistema (`ai-ui`),
qué *recuerda* (`ai-storage`), y la base operativa sobre la que todo corre
(`ai-base`).

Es el proyecto principal de Evolving Agents Lab. Todo lo demás en la organización
está congelado — ver [`doc/es/07-freeze-policy.md`](doc/es/07-freeze-policy.md).

**[English](README.md)** · El inglés es la versión canónica de todos los
documentos; ver [Idiomas](#idiomas).

> **Estado: diseño.** `ai-base/` es una copia vendorizada de QM y corre.
> `ai-flows/`, `ai-ui/` y `ai-storage/` están especificados en `doc/` y **no
> están implementados**. Nada en este README describe software que exista, salvo
> que lo diga explícitamente.

## El problema: la IA sigue siendo de un solo jugador

<table>
<tr><td>

> **Las mejores herramientas de trabajo se volvieron más potentes cuando se
> volvieron multijugador. Pero la IA sigue mayormente atrapada en chats privados,
> con agentes trabajando en sesiones a las que los compañeros de equipo no pueden
> sumarse ni influir.**
>
> **La próxima generación de herramientas de IA va a permitir que los equipos
> trabajen con agentes en conjunto y en tiempo real: mirando, redirigiendo y
> delegando trabajo entre ingeniería, ventas, soporte, legales, finanzas y más.
> El momento multijugador de la IA está llegando.**

<sub>— **Y Combinator**, [@ycombinator](https://x.com/ycombinator/status/2079963728439832823)
· [video](https://x.com/ycombinator/status/2079963728439832823/video/1)
· <i>traducción; el original en inglés es el texto de referencia</i></sub>

</td></tr>
</table>

Ese es el problema que ai-os existe para resolver, y nombra el hueco de forma más
legible que nuestro propio encuadre.

**Por qué una sesión no puede ser multijugador.** No se puede delegar una
conversación. Un handoff necesita una *cosa* — algo con un objetivo declarado, un
estado actual y una historia, que otra persona pueda abrir, leer, redirigir y
tomar. Una sesión no es nada de eso: es una transcripción de sólo-agregado,
privada a quienes participaron, resumida por la compactación, y bifurcada sin
dejar registro de que se bifurcó. La unidad está mal, así que todo lo que se
apoya encima es de un solo jugador por construcción.

Cada pilar es una mitad de esa respuesta:

| | El problema multijugador que resuelve |
|---|---|
| [`ai-flows`](ai-flows/) | **La cosa que se delega.** Un flow es un objeto persistido con objetivo, estado y linaje — direccionable por cualquiera con el scope, no propiedad de una conversación |
| [`ai-ui`](ai-ui/) | **Mirar y redirigir.** Un canvas proyecta el *estado* del trabajo, que un tercero puede leer. Una transcripción sólo es legible para quienes estuvieron ahí |
| [`ai-storage`](ai-storage/) | **Lo que sabe el equipo.** Memoria a nivel de proyecto y de sistema, para que el contexto no quede varado en el chat privado de una persona |
| [`ai-base`](ai-base/) | **Quién tiene permiso.** Los scopes, permisos y auditoría de QM — ya multijugador, y la razón por la que no empezamos por acá |

### Una precisión, dicha de entrada

El tweet dice **"en tiempo real"**. ai-os hace una afirmación más angosta y, nos
parece, más defendible: **multijugador asincrónico** — un objeto durable sobre el
que varias personas actúan a lo largo de días, que se delega, se bifurca y se
vuelve a unir. No varios cursores sobre un mismo canvas a la vez;
[el v1 de `ai-ui` excluye explícitamente la edición simultánea](doc/es/04-ai-ui.md#alcance-del-v1).

La co-presencia en tiempo real es un objetivo legítimo y no es hacia el que
construimos primero. Delegar trabajo que *sigue corriendo*, sin perder lo que
aprendió, es la mitad difícil y la parte que no tiene nadie.

## Por qué existe

QM resuelve la parte que la mayoría de los proyectos de agentes hace mal: un
harness multi-inquilino real, con identidad por scope, permisos, sandboxes,
auditoría y una capa de modelos intercambiable. 72.000 líneas, en forma de
producción. Reconstruir eso sería un año de trabajo para llegar donde alguien ya
está.

Lo que QM no tiene es una **capa del sistema por encima del turno**. Corre turnos
— una entrada, una respuesta, con crons y triggers para dispararlos. No tiene
noción de una *unidad de trabajo* durable, reanudable e inspeccionable que abarque
muchos turnos, muchos agentes y muchos días. No tiene modelo de memoria más allá
de un markdown con tope por scope. Su interfaz es una ventana de chat con paneles.

Un sistema operativo necesita esas tres cosas. Eso es lo que agrega ai-os.

## Estructura

| Directorio | Qué es | Licencia |
|---|---|---|
| [`doc/`](doc/) | El diseño, en detalle. **Leer esto primero — va por delante del código por construcción.** | Apache 2.0 |
| [`ai-base/`](ai-base/) | QM vendorizado. La base operativa: harness, scopes, sandbox, identidad, política, auditoría. | **MIT** (upstream) |
| [`ai-flows/`](ai-flows/) | Flows: unidades de trabajo declarativas, reanudables, multi-turno. | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | La interfaz a nivel de SO — un canvas inteligente, no un log de chat. | Apache 2.0 |
| [`ai-storage/`](ai-storage/) | Memoria en cuatro niveles: sistema, usuario, proyecto, flow. | Apache 2.0 |

## Licenciamiento en un párrafo

El repositorio es **Apache 2.0**. `ai-base/` sigue siendo **MIT**, porque deriva
de QM y porque mantenerlo MIT es lo que permite mandar parches upstream sin
incompatibilidad de licencias. MIT concede explícitamente `sublicense`, así que la
combinación es sólida; el aviso de copyright original se conserva textual en
[`ai-base/LICENSE`](ai-base/LICENSE) y se atribuye en [`NOTICE`](NOTICE). El
análisis completo, incluido lo que **no** podemos hacer, está en
[`doc/es/06-licensing.md`](doc/es/06-licensing.md).

## Relación con QM

Trabajamos desde una copia, a propósito — ver
[ADR-0001](doc/es/adr/0001-fork-vs-dependency.md). Eso compra control total sobre
la evolución y cuesta la carga de merge para siempre. El vendorizado es un
`git subtree` contra `yc-software/qm@main`, así que upstream sigue siendo
traíble en vez de ser una foto de una sola dirección.

No competimos con QM ni pretendemos estar afiliados. Cuando un cambio corresponde
upstream, va upstream, como texto escrito a mano en su formato `adrs/` — que es lo
que pide su `CONTRIBUTING.md`.

## Idiomas

**El inglés es canónico.** Cada documento tiene su contraparte en español, y
cuando los dos difieren el correcto es el inglés — una traducción que se
desactualizó es peor que no tener traducción, así que la regla queda escrita en
vez de asumida.

| | English | Español |
|---|---|---|
| Este archivo | [`README.md`](README.md) | `README.es.md` |
| Documentos de diseño | [`doc/`](doc/) | [`doc/es/`](doc/es/) |

Un cambio a un documento de diseño no está terminado hasta que su contraparte en
español se mueve con él, en el mismo pull request. Separarlos en dos PRs es cómo
empieza a mentir la copia que nadie revisa.

---

<sub>Evolving Agents Lab · Apache 2.0 · `ai-base/` MIT</sub>
