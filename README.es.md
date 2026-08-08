<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

<img src="doc/assets/hero.jpg" alt="" width="100%">

**Un sistema operativo basado en agentes.** Construido sobre
[QM](https://github.com/yc-software/qm), y yendo más allá en cuatro direcciones:
cómo se le da *forma* al trabajo (`ai-flows`), cómo se *ve* el sistema (`ai-ui`),
qué *recuerda* (`ai-storage`), y la base operativa sobre la que todo corre
(`ai-base`).

Es el proyecto principal de Evolving Agents Lab. Todo lo demás en la organización
está congelado — ver [`doc/es/07-freeze-policy.md`](doc/es/07-freeze-policy.md).

**[English](README.md)** · El inglés es la versión canónica de todos los
documentos; ver [Idiomas](#idiomas).

> **Estado: dos pilares corren, dos son diseño.** `ai-base/` es una copia
> vendorizada de QM y corre. **`ai-flows/` corre** — 197 tests. `ai-ui/` y
> `ai-storage/` están especificados y **no implementados** en absoluto; la página
> que se muestra abajo la sirve `ai-flows`, no `ai-ui`. Nada en este README
> describe software que exista, salvo que lo diga explícitamente.

## Qué podés hacer con esto hoy

Todo lo de acá se corrió, y el manual lo muestra con capturas de una instancia
viva: **[Correr ai-os](doc/es/manual.md)** · **[Running ai-os](doc/manual.md)**.

**Organizar gente y agentes por scope.** Organización, proyectos, grupos, equipos e
individuos no son una taxonomía que ai-os inventó — un proyecto *es* el group scope
de upstream con un prefijo reservado, y su roster viene de `ProjectStore`. Una
página muestra cada nivel, quién está en él, y qué define cada uno. La membresía
nunca se lee de una carpeta, y una carpeta que parece membresía se reporta como
hallazgo ([ADR-0008](doc/es/adr/0008-conformation-is-projected.md)).

**Escribir agentes y subagentes como markdown.** Un agente es `agents/<nombre>.md`
— frontmatter para su descripción y tools, cuerpo para sus instrucciones. Una clave
`subagents:` declara qué compone. El mismo archivo sigue siendo un agente válido y
delegable, porque el parser de upstream ignora las claves que no conoce, así que no
hay un segundo registro que mantener sincronizado.

**Ejecutar un árbol declarado como trabajo real.** `POST /flows/from-agent`
convierte `LedgerLead → SchemaAgent, MigrationAgent, ReviewAgent` en un flow y lo
ejecuta, delegando cada paso al archivo del agente. `?dryRun=1` muestra el plan
primero. A cada paso se le entrega lo que produjeron los anteriores.

**Irte y volver.** Un flow arrancado por un proceso lo termina otro, después de un
reinicio y después de una compactación de contexto, sin re-ejecutar trabajo que ya
estaba en vuelo. Ese es el milestone por el que existe el repositorio
([M2](doc/es/08-roadmap.md)).

**Ver si todavía se mueve.** El progreso se juzga contra un piso de ruido *medido*
en vez de una suposición — δ = 0% en digests normalizados, 21,1% en crudo
([10](doc/es/10-observability.md)). Una repetición es prueba; una diferencia es un
rumor.

**Saber quién hizo qué.** Cada flow registra la persona para la que actúa y corre
como ella, así que el guard de roster se le aplica exactamente igual que a esa
persona ([ADR-0009](doc/es/adr/0009-a-flow-records-who-it-acts-for.md)).

### Lo que te va a decir que no puede hacer

La parte inusual, y la razón para confiar en la lista de arriba. El sistema reporta
las preguntas que no pudo contestar en vez de renderizar una página limpia: qué
scopes no puede enumerar, qué subagente declarado no tiene archivo, qué agentes
están inertes en el harness que estás corriendo, qué mensajes no puede atribuir.

**Medir si un cambio en los agentes ayudó.** Mismos escenarios, dos arreglos,
verdad de referencia computada y no recordada. El chequeo de margen corre primero y
solo: si la línea base ya contesta todo, ningún arreglo puede mostrar nada, y el
harness dice `NO-HEADROOM` en vez de dejar que un empate se lea como hallazgo
([13 · Degradación](doc/es/13-degradation.md)).

**Y medir si el revisor que agregaste está ayudando** — una tasa de acierto no
puede, porque las reparaciones y los daños de un revisor se cancelan adentro. El
estudio que sí puede es **[14 · Estudio de revisión](doc/es/14-review-study.md)**, y
vale leerlo por una razón distinta de la prevista: reportó que un revisor había
vuelto incorrecta una respuesta correcta, y **ese hallazgo era un artefacto de un
carácter** — un check que rechazaba toda respuesta correcta terminada en punto. Está
escrito completo en vez de borrado, porque se llevó otros cuatro números con él.

*La configuración es una hipótesis; la ejecución es la evidencia.* Un árbol de
agentes con un `ReviewAgent` adentro parece más seguro que uno sin él. Si **es** más
seguro es una medición.

### Lo que no está construido

Ninguna forma más allá de `Open` — sin `Sequence`, `Loop`, `Fan-out`,
`Deliberation`, `Watch`, y sin merge. Sin canvas. Sin memoria por scope. Un agente
no puede delegar a su propio subagente (ese tope es de upstream, y es deliberado).
Estado completo, milestone por milestone: [08 · Roadmap](doc/es/08-roadmap.md).


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

## Antes de la interfaz: ¿un flow se puede mirar siquiera?

Multijugador significa que una segunda persona abre trabajo en curso y pregunta
*¿esto está bien?* Eso es una pregunta de instrumento antes que de interfaz — y
todo instrumento tiene ruido.

Un flow registra una huella del estado que produjo cada intento. Comparar dos
parece binario. El canal no es simétrico:

```
estado sin cambio ──(1−δ)──▶ huella igual
                  ──( δ )──▶ distinta         ← ruido, no progreso
estado cambiado   ──( 1 )──▶ distinta
```

Solo un cambio real puede *romper* una repetición, pero el no determinismo puede
inventar una diferencia de la nada. Entonces:

> **Una repetición es prueba. Una diferencia es un rumor.**

**δ** es la tasa a la que trabajo *idéntico* produce huellas *distintas*. No es
una constante de la naturaleza — se mueve con el modelo, el harness y sobre qué
se toma la huella — así que hay que medirla, no asumirla. Dos curvas explican por
qué medirla va primero.

**Cuánto puede llevar una comparación.** Esto es un canal Z, y su capacidad es

$$C(\delta) = \log_2\left(1 + (1-\delta)\,\delta^{\frac{\delta}{1-\delta}}\right)$$

<img src="doc/assets/noise-floor.svg" alt="Capacidad y probabilidad de detección contra el piso de ruido" width="100%">

<sub>Computadas, no dibujadas — directo de <code>channelCapacity</code> y <code>detectionProbability</code>. La curva de la derecha es $(1-\delta)^w$: un flow trabado se delata <b>solo</b> repitiendo, y el ruido rompe la repetición.</sub>

| δ | 0.0 | 0.2 | 0.5 | 0.8 |
|---|---|---|---|---|
| bits por comparación | 1.000 | 0.618 | 0.322 | 0.114 |
| flows trabados detectados | 100% | 51% | 13% | **0.8%** |

Con δ = 0.8 un flow puede estar muerto una semana mientras el sistema informa
progreso. Esperar más no ayuda; esperar es justo lo que el ruido está destruyendo.

**Así que la compuerta va sobre el instrumento, no sobre el flow.** Antes de que
la detección de deriva, los presupuestos o cualquier regla de convergencia
signifiquen algo, δ tiene que ser un número.
[`observabilityOf`](ai-flows/src/observability.ts) se niega a llamar
*progressing* a un flow cuando δ dice que uno trabado habría pasado
desapercibido; responde `unreadable`, que es una afirmación sobre el registro y
no sobre el trabajo.

Esa es la distinción que los flows realmente necesitan. **Deriva** — visible y
detenido — quiere más pasos. **Ilegible** — moviéndose hasta donde se puede saber
— quiere un instrumento mejor, y ninguna cantidad de pasos lo reemplaza.

> **Estado: medido.** 22 turnos en `pi` / `deepseek-v4-flash`, repitiendo trabajo
> idéntico. **δ = 21.1% sobre el texto crudo, 0% una vez normalizado** — y toda la
> divergencia era presentación: en el peor grupo, literalmente backticks. Cero
> observado no es cero: la cota al 95% es 14.6%, así que un flow trabado igual se
> detecta al menos el 62% de las veces. **La medición cambió el código** —
> `digestOf` ahora normaliza, porque antes no. Resultado completo, y las tres cosas
> que *no* establece, en [doc/es/10-observability.md](doc/es/10-observability.md).

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
