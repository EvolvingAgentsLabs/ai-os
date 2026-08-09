# 12 · Conformación — la forma del sistema, y quién puede verla

<img src="../assets/12-conformation.jpg" alt="" width="100%">

<sub>Scopes, los agentes que contienen, y los hilos entre ellos — dos de los cuales no terminan en ningún lado.</sub>


**Estado: el proyector está construido, testeado y corrido. 18 tests **[ran]**,
131 en todo `ai-flows`. Devolvió cinco agujeros contra una base real, listados en
§ Lo que encontró el proyector. No existe ninguna carpeta nueva, y no puede
existir ninguna hasta que un agujero la nombre.**

Un sistema operativo te deja ver su propia forma. Podés abrir la lista de
procesos, recorrer el filesystem, preguntar quién está logueado. ai-os hoy no
puede contestar ninguna de esas preguntas sobre sí mismo: no hay forma de ver qué
scopes existen, qué agentes definió un proyecto, quién está en su roster, ni quién
le dijo qué a quién. La información existe — casi toda, en stores que ya corren —
y nada la proyecta.

Este documento es sobre ese hueco, y sobre un error muy fácil de cometer mientras
se lo cierra.

## El error que este documento existe para prevenir

El movimiento intuitivo es diseñar una jerarquía de carpetas: un directorio de
proyecto con una carpeta `users/`, una `agents/`, y bajo cada agente orquestador
una `subagents/`. Se lee como el directorio de sistema de Windows o el `.git` de un
repositorio, y la analogía es buena para los *artefactos*.

Es la analogía equivocada para las *personas*. Una carpeta `users/` en un proyecto
es una lista de quién pertenece a ese proyecto, y

> **[ADR-0005](adr/0005-scale-is-scope.md), sobre la misma idea con otra forma:**
> "es una ACL que ninguna función de ACL lee. La membresía le pertenece al
> directorio y al project store; un flow que guarda su propia copia tiene una copia
> vieja en el instante en que alguien es removido."

La falla no es que la carpeta sea redundante. Es que la carpeta es una *segunda
respuesta* a "quién puede leer esto", y las dos respuestas divergen en silencio —
la que pierde es la que nadie ve perder. Esta organización ya encontró un
fail-open exactamente de esa forma, y estaba en un fall-through y no en una
función de permisos (`triggers/run-trigger.ts`, registrado en
[09-scales](09-scales.md)).

**La regla, dicha una vez y usada en todo lo que sigue:**

> Las carpetas de un scope contienen agentes, skills, artefactos y memoria.
> **Nunca contienen membresía.** La membresía se proyecta desde `ProjectStore` y
> el directorio al momento de leer, jamás se guarda al lado del trabajo.

## La estructura de carpetas ya existe

No es una tarea de diseño. Es `resolution/resolution-service.ts:37-45`, y son tres
líneas **[read]**:

```ts
const layers: WorkspaceLayer[] = [
  { scopeId: orgScope, mountPath: "global", mode: "ro" },
  { scopeId: scope,    mountPath: "",       mode: "rw" },
];
if (isDm && actor.teamIds) for (const tid of actor.teamIds)
  layers.push({ scopeId: scopeId("team", tid), mountPath: `team-${tid}`, mode: "ro" });
```

Un `WorkspaceLayer` es `{ scopeId, mountPath, mode }` (`types.ts:108`). Cada turno
corre contra un filesystem por capas ensamblado desde scopes, con directorios
reservados adentro — `agents/`, `skills/`, `memory/MEMORY.md`.

Leído como layout de un OS:

| Capa | Es | Modo |
|---|---|---|
| `global/` | la carpeta de **sistema** — el scope de la org, montado en todos los demás scopes | sólo lectura |
| `` (raíz) | la carpeta de **trabajo** — el scope al que pertenece esta conversación | lectura-escritura |
| `team-<id>/` | scopes de equipo, sólo en DMs | sólo lectura |

Y un proyecto tampoco es un objeto nuevo. `projects/project-store.ts:47`:

```ts
const PROJECT_GROUP_PREFIX = "web-project-";
export function projectScopeId(id: string): ScopeId {
  return scopeId("group", projectGroupRef(id));
}
```

con `create`, `listForMember`, `addMember`, `removeMember`, `withRosterLock` y una
`version` por roster. [ADR-0005](adr/0005-scale-is-scope.md) es explícito:
**"ai-os no implementa un objeto proyecto."**

Así que el mapa del diseño intuitivo a lo que corre hoy:

| La intuición | Dónde ya está | Estado |
|---|---|---|
| Carpeta de proyecto | la capa `rw` de `group:web-project-<id>` | **existe** |
| Carpeta de sistema del OS | `global/`, montada sólo-lectura en todos los scopes | **existe** |
| Agentes por proyecto | `agents/*.md` en la capa `rw` | **existe, sólo `pi`** |
| Repositorio de agentes de sistema | `global/agents/*.md` | montado, **inalcanzable** (abajo) |
| Roster del proyecto | `ProjectStore` + `version` | **existe upstream** |
| Orquestador con subagentes | `delegate` + `agents/<n>.md` | **existe a profundidad 1** |
| Ver algo de todo esto | — | **nada** |

La última fila es todo el hueco. Seis de siete filas están construidas; la que
falta es la que permitiría que alguien se entere de que las otras seis existen.

## La carpeta inerte

Un agente es un archivo markdown: `agents/<name>.md`, frontmatter declarando
`description` y `tools`, cuerpo como instrucciones, parseado por
`parseAgentDefinition` (`agents/agent-definition.ts`) y entregado a `delegate`
(`pi-tools.ts:2444`), que lo lee a través del tool context del propio scope.

`pi-tools.ts` es el **único** llamador de ese parser en todo el árbol **[read]**.
En `claude` los tres agentes hijos están hardcodeados (`claude-harness.ts:341` —
`research`, `code`, `consult`); `codex` y `opencode` delegan dentro de su propia
CLI.

**Por lo tanto la carpeta `agents/` de un proyecto es inerte en tres de cinco
harness.** Un equipo que define sus agentes como archivos los está definiendo para
`pi`. Esto no es un argumento contra la carpeta — es el argumento para declarar el
límite en la salida del proyector, porque una carpeta que en silencio no hace nada
en el harness que estás corriendo es peor que no tener carpeta.

Notar también lo que `pi` *no* hace: no escribe filas en `tasks`, así que una
delegación en el harness por defecto no deja rastro durable más allá del reporte
que devuelve el hijo. La conformación de un sistema corriendo es visible; su
historia no.

## El repositorio inalcanzable

`global/agents/*.md` está montado sólo-lectura en todos los scopes. `delegate` no
puede direccionarlo.

`agentDefinitionPath(name)` devuelve `` `agents/${name}.md` `` e `isSafeSkillName`
es `^[A-Za-z0-9](?:[A-Za-z0-9_.-]{0,126}[A-Za-z0-9_-])?$` — sin `/`. La capa global
monta en `global`, así que sus agentes viven en `global/agents/<name>.md`, y ningún
valor de `name` los alcanza **[read]**.

Un repositorio de agentes a nivel organización está entonces a una regex de
existir. Es el ensanchamiento real más chico disponible y le pertenece a upstream y
no a nuestro fork, porque es una feature coherente de upstream y no un asunto de
ai-os — [ADR-0008](adr/0008-conformation-is-projected.md) lo registra como
propuesta, no como parche.

## La profundidad, y la línea que la fija

"Agentes orquestadores, y para los orquestadores una carpeta de subagentes" es
profundidad dos. Está negada a propósito, en una línea, con la razón escrita al
lado (`pi-harness.ts:1313-1318`) **[read]**:

> "Un agente delegado corre como su propia sesión aislada contra el tool context
> del padre, así que comparte el workspace y el scope de memoria pero arranca con
> una conversación vacía. **Se construye sin `runChild`, que es lo que le niega
> `delegate` y acota el árbol a un nivel.**"

y `CHILD_POLICY` lo dice en prosa: *"You cannot delegate further."*

Se siguen dos cosas. Primero, el workspace compartido significa que un hijo ya ve
el mismo directorio `agents/` que vio su padre — la carpeta de subagentes existe;
lo que está negado es la *recursión*, no el *directorio*. Segundo, levantar el tope
es un argumento (pasarle `runChild` al conjunto de tools del hijo) con una
consecuencia no acotada, y no es una decisión que ai-os deba tomar calladamente
dentro de un fork. Diferido con una condición en
[ADR-0008](adr/0008-conformation-is-projected.md).

## Agentes con privilegios de usuario

`PrincipalType = "internal" | "guest"` (`types.ts:3`). No hay principal-agente, y
las dos formas de conseguir uno difieren en tipo, no en esfuerzo:

- **Suplantación** — el agente actúa como un principal humano. Barato, y destruye
  la auditoría: toda pregunta de la forma *quién hizo esto* se vuelve
  incontestable, permanente y retroactivamente. Rechazado.
- **Un tercer tipo de principal** — el agente *es* un principal, con su propio
  scope `personal:`, su propia memoria, sus propias entradas de ACL y sus propias
  filas en cada registro de auditoría. Correcto, y edita `types.ts` en el centro de
  una dependencia que se mergea a mano.

El segundo es el diseño correcto y lo incorrecto para construir antes de que el
proyector haya mostrado un sistema donde sería legible. Diferido con una condición.

## Lo que falta de verdad: nadie puede ver nada de esto

<img src="../assets/manual/06-system-explorer.jpg" alt="" width="100%">

<sub>La salida del proyector, renderizada — una instancia viva. Cada nivel, su roster, su árbol de agentes. <code>AnomalyScanner</code> aparece tachado porque está declarado en <code>DataQualityAgent.md</code> y no tiene archivo: un nombre declarado es una afirmación, un archivo es un hecho. <strong>[ran]</strong> 2026-08-09.</sub>


Que es un problema de proyección, no de almacenamiento. El sustrato del grafo de
comunicación es durable y ya está escrito: el tape de sesión lleva `kind:
"message"`, `author`, `scopeLabel` y `overheard` por registro
(`sessions/session-store.ts`), scopeado exactamente como lo están los permisos.

Dos stores vecinos parecen servir y no sirven — vale nombrar los dos porque ambos
producirían un grafo que pierde datos en silencio:

- `AuditLog` es **en memoria**, tope de 50.000 eventos, se pierde al reiniciar
  (`audit/audit-log.ts`) **[read]**.
- `run_activity` tiene TTL y se barre:
  `DELETE FROM run_activity WHERE created_at < $1`
  (`runs/postgres-run-activity-store.ts:30`) **[read]**. Además no está expuesto en
  ninguna ruta de API ([ADR-0007](adr/0007-observation-captured-not-derived.md)).

Entonces: leer el tape, proyectar el grafo, y no construir un bus.

## El proyector, y cómo se falsifica

`ai-flows/src/conformation.ts` — sólo lectura, sin tablas nuevas, sin scope kinds
nuevos, sin ruta. Lee lo que existe y emite un documento:

- **Conformación** — scopes; para `group:web-project-*`, el roster y su `version`
  desde `ProjectStore`; por scope, el listado del workspace filtrado a `agents/`,
  `skills/`, `memory/`; cada agente parseado con `parseAgentDefinition` para
  mostrar su descripción y sus tools declaradas en vez de su nombre de archivo.
- **Comunicación** — aristas reconstruidas desde los registros de sesión, actor a
  actor, etiquetadas por scope.
- **Agujeros** — cada lugar donde se hizo una pregunta y el dato no existía,
  declarado como agujero en vez de omitido.

El último punto es el entregable. Un proyector que renderiza un cuadro completo
prueba que las carpetas son innecesarias; un proyector lleno de agujeros
especifica exactamente cuáles hacen falta, desde evidencia y no desde analogía.

> **Falsación, escrita antes de correrlo:** si la salida del proyector alcanza para
> que una persona entienda y dirija el sistema, entonces esto era un problema de
> proyección y **no se envía ninguna carpeta nueva** — este documento pasa a ser un
> párrafo en [09-scales](09-scales.md) y debe borrarse como documento. Si no
> alcanza, los agujeros son la especificación, y cada carpeta nueva llega con el
> agujero que llena.

Una segunda condición, más angosta y que vale vigilar: el grafo de comunicación es
*analizable* sólo si una repetición se puede distinguir del ruido. Ese instrumento
ya existe — `ai-flows/src/observability.ts`, δ medido en 21,1% crudo y 0%
normalizado ([10-observability](10-observability.md)) — y el grafo lo reutiliza. Si
el grafo necesita su propio analizador, eso es evidencia de que está midiendo algo
que la capa de flows ya mide mejor.

## Lo que encontró el proyector

Corrido el 2026-08-06, `HARNESS=pi`, `deepseek/deepseek-v4-flash`, contra un par de
scopes sembrados más dos turnos reales **[ran]**. Cinco agujeros. Dos eran
esperados y tres no, y esos tres inesperados son la razón por la que esto se
construyó antes que cualquier carpeta:

**1 · Ningún store contesta "qué scopes existen".** `SessionStore.distinctScopes()`
lista los scopes que sostuvieron una conversación; `WorkspaceStore` no puede
enumerar scope ids en absoluto (`list(scopeId)` y nada más). Un scope con archivos
y sin conversación es invisible para todos los stores. El probe lo recupera
decodificando nombres de directorio del workspace y confirmando el round-trip por
`scopeStorageKey` — que es lossy, así que un nombre que no round-trippea se reporta
como indecodificable en vez de adivinarse.

**2 · Nadie firma nada.** *El hallazgo.* `meta.author` en un registro de tape se
escribe desde `actor.displayName` y desde nada más
(`core/orchestrator.ts:2170`). Dos turnos, que difieren en un campo:

| Scope | actor | registros | atribuidos |
|---|---|---|---|
| `personal:U1` | sin `displayName` | 2 | **0** |
| `personal:U2` | `displayName: "Ada"` | 2 | **1** |

Así que la autoría es una **etiqueta humana mutable, no un principal id**, ausente
cada vez que la superficie no provee una — y el segundo registro sin atribuir del
scope de U2 es *la propia respuesta del asistente*. **El agente, el actor más
activo en un OS de agentes, es anónimo en su propio registro de comunicación.** Un
grafo que dibujara eso en silencio habría fundido a todos los hablantes distintos
en un solo nodo, y se habría visto completo haciéndolo. El proyector levanta un
agujero en cambio, y un test fija el comportamiento.

### Atribución, recuperada

El agujero 2 resultó mayormente reparable contra el seam público, que es por qué no
se parcheó en core. Upstream ya contesta "quién habló" — el join detrás de
`attributedTurns` cruza `session_entries` con `participants` dentro de la ventana
de membresía (`memory-session-store.ts:494`). Agrega la respuesta por día y nunca
la expone por registro. `attributeMessage` aplica el mismo join y se queda con el
resultado por registro.

Tres fuentes, en orden de precedencia, cada una etiquetada en la arista que produce
para que el lector pueda descontarla: `declared` (upstream escribió `meta.author`),
`role` (una entrada del asistente — habló el agente, sin ambigüedad posible),
`window` (exactamente una ventana de membresía cubría el registro).

Los mismos dos turnos, recorridos de nuevo **[ran]**:

| | antes | después |
|---|---|---|
| atribuidos | **1 de 4** | **4 de 4** |
| turnos del propio agente | 0 de 2 | **2 de 2**, vía `role` |
| el humano sin display name | sin atribuir | **`U1`**, vía `window` |

El identificador recuperado es el **principal id**, que es lo que un grafo durable
necesita y es estrictamente mejor que el display name que habría llevado
`meta.author`.

Una regla es la que sostiene todo y es donde esto se aparta del propio join de
upstream: **cuando varias ventanas cubren un registro resuelve `ambiguous`, nunca
una elección.** El agregado de upstream cuenta un turno bajo cada principal
candidato, cosa que una métrica de uso tolera; un grafo de comunicación que lo
hiciera dibujaría una arista desde alguien que no habló, y eso es peor que no
dibujar ninguna.

Lo que queda es un residuo, y es ahora el único agujero de atribución: la
recuperación matchea contra `ParticipantWindow.validFrom` / `validTo`, que son
**timestamps**, mientras que upstream atribuye por `validFromSeq` / `validToSeq`,
que **no están expuestos**. Los dos coinciden salvo en el borde de una ventana. Ese
es el segundo de los dos pedidos a upstream.

**3 · Un scope de proyecto puede llevar el prefijo reservado sin roster detrás.**
`group:web-project-seed` proyectó como proyecto y `ProjectStore` no devolvió nada
para él. El prefijo es una convención de nombres; nada obliga a que un scope que lo
lleva esté registrado.

**4 · El repositorio de agentes de sistema es inalcanzable**, como se predijo
arriba — un agente `org:`, direccionable por nada.

**5 · El path con forma de membresía se reportó, no se creyó.** El `users/alice.md`
sembrado apareció como hallazgo mientras el roster venía del puerto de roster
solamente. Eso es la regla de ADR-0008 ejecutándose en vez de afirmándose.

### Lo que costó encontrarlo

Tres defectos en el propio probe, ninguno que una lectura hubiera atrapado, y cada
uno produjo una **vista limpia y completamente equivocada**:

- `WorkspaceStore.list` devuelve rutas **absolutas** (`workspace-store.ts:61-68`),
  mientras que `delegate` direcciona `agents/x.md` relativo a la raíz de la capa.
  Cableado sin convertir, la primera corrida renderizó dos scopes sembrados sin
  agentes, sin memoria y sin hallazgos — un vacío confiado.
- La misma función está envuelta en `catch { return [] }`, así que un scope
  ilegible y un scope vacío son indistinguibles desde afuera.
- `meta.author` lo había leído **[read]** del tipo `TapeMeta` y asumido lleno. Un
  tipo dice que un campo puede estar presente; no dice que el pipeline lo llene.

El patrón es el que este repositorio sigue registrando: todo instrumento que mintió
acá mintió renderizando limpio. Ninguno de los tres falló ruidosamente, y los tests
de fixture pasaron todo el tiempo — incluso a través de dos bytes NUL que habían
reemplazado en silencio los separadores de una clave de Map, invisibles hasta que
`grep` empezó a tratar el fuente como binario.

## Lo que costó encontrarlo

Toda afirmación en este documento es un `[read]` contra una dependencia que se trae
cada semana, y una de ellas — la matriz de harnesses — estuvo mal en `doc/` durante
cinco días y citada en cuatro lugares antes de que alguien abriera el archivo
([01-architecture](01-architecture.md#la-matriz-de-capacidades-por-harness),
corregida el 2026-08-06).

El hábito que se sigue, y es barato: **una afirmación sobre una capacidad de
upstream nombra el archivo y la línea que tendrían que cambiar para que deje de ser
cierta.** "`pi` no tiene subagentes" no nombraba nada y no podía pudrirse a la
vista. "`delegate` se admite sólo cuando el harness provee `runChild`,
`pi-harness.ts:1345`" nombra la línea exacta cuya eliminación la falsifica.
