# 09 · Escalas — a quién pertenece un flow

<img src="../assets/09-scales.jpg" alt="" width="100%">

<sub>De individual a sistema — un solo eje, y es el scope.</sub>


> **El inglés es canónico.** Traducción de [`doc/09-scales.md`](../09-scales.md).

> **Estado: el eje está especificado. Sólo la escala individual entra en M2.**
>
> Este documento existe porque la misma pregunta estaba por responderse dos veces
> — una para flows, otra para memoria — con dos vocabularios distintos. Se
> responde una sola vez acá, y los dos pilares apuntan a este archivo.

## La pregunta

El trabajo ocurre en cuatro escalas sociales, y tanto `ai-flows` como
`ai-storage` necesitan una respuesta para cada una:

| Escala | El trabajo |
|---|---|
| **Individual** | una persona y sus agentes |
| **Colectiva** | un grupo de personas trabajando juntas |
| **Proyecto** | trabajo sostenido con un roster, abarcando uno o más grupos |
| **Sistema** | el deployment completo |

La tentación es definir seis shapes de flow × cuatro escalas, y cuatro niveles de
memoria × cuatro escalas. Eso son veinticuatro definiciones de shape y dieciséis
celdas de memoria escritas antes de que haya corrido un solo flow — exactamente
la falla que esta organización ya registró una vez
([regla de la casa 4](README.md#reglas-de-la-casa-para-estos-documentos)).

Este documento hace la versión barata: establece que **el eje de escalas ya
existe en la base**, nombra qué implementa upstream en cada escala, y especifica
sólo las cuatro preguntas que una escala tiene que responder.

## El hallazgo: el eje de escalas es el `scopeId`

Los scope kinds de QM son una unión cerrada — `ai-base/src/types.ts:12` **[read]**:

```ts
const SCOPE_KINDS = ["personal", "channel", "team", "org", "group"] as const;
```

Un `ScopeId` es `"<kind>:<ref>"` y es la clave única de memoria, archivos, vista
del keychain, permisos, crons y sandbox
([ADR-0003](adr/0003-storage-scope-axis.md)). El modelo de flow ya lleva uno en
su primera línea ([03](03-ai-flows.md), el bloque del modelo:
`Flow ├─ id, scopeId, title`).

**Decisión: la escala de un flow es su scope. No hay una segunda taxonomía.**
Registrada como [ADR-0005](adr/0005-scale-is-scope.md).

La razón es la misma que mató la alternativa del scope falso en ADR-0003: una
clasificación paralela significa dos respuestas a *"quién puede leer esto"*, y la
que pierde siempre es la que el chequeo de permisos no consulta.

## Qué implementa upstream en cada escala

| Escala | Scope | La membresía sale de | Evidencia |
|---|---|---|---|
| Individual | `personal:<principalId>` | el principal mismo | `types.ts:25` |
| Colectiva | `group:<ref>` · `channel:<ref>` | el directorio — `listGroupsFor`, `listChannelsFor` | `app-helpers.ts:339-348` |
| **Proyecto** | **`group:web-project-<id>`** | un registro `Project` con `ownerId` + `memberIds` | `projects/project-store.ts:11,47` |
| Sistema | `org:<orgId>` | el deployment | `app-helpers.ts:334` |

Las cuatro **[read]**.

### La corrección que este documento le hace a 05

[05-ai-storage](05-ai-storage.md) mapeaba el nivel de proyecto a `team` /
`channel`. Está mal, y la respuesta correcta es más útil que la equivocada:

**Un proyecto en QM es un scope de grupo con un prefijo de ref reservado.**

```ts
const PROJECT_GROUP_PREFIX = "web-project-";
export function projectScopeId(id: string): ScopeId {
  return scopeId("group", projectGroupRef(id));
}
```

`project-store.ts:9,43-49`. Hay un `ProjectStore` con `create`, `listForMember`,
`addMember`, `removeMember`, `withRosterLock` y una `version` por roster
(`project-store.ts:27-41`) **[read]**. La escala de proyecto no es algo que ai-os
tenga que inventar; es algo que ai-os tiene que *no reimplementar*.

`team:` es otra cosa completamente: sale de `Principal.teamIds` (`types.ts:8`),
poblado por identity, y se deriva por viewer en `app-helpers.ts:333`. Equipos del
proveedor de identidad, no rosters de proyecto.

Hay además una asimetría viva que conviene conocer antes de apoyarse en
cualquiera de los dos kinds:

```ts
isManageableCreationScope → kind === "channel" || kind === "team"   // types.ts:36
isSharedScope             → kind === "channel" || kind === "group"  // types.ts:42
```

Las dos funciones no coinciden sobre `team` ni sobre `group`. Un "proyecto"
respondido con `team:` es manejable pero no compartido; respondido con `group:`
es compartido pero no manejable. Elegir mal produce una respuesta de permisos que
se ve bien en un call site y mal en el otro.

## Las cuatro preguntas que una escala debe responder

No seis shapes por escala. Cuatro preguntas por escala, y cada shape hereda las
respuestas de la suya:

1. **Quién puede avanzarlo** — quién puede causar que corra el próximo paso
2. **Quién puede verlo** — el límite de lectura, que es la ACL, no un filtro de UI
3. **A dónde promueve su memoria** — el nivel de arriba, y si la promoción es
   automática (ver [05](05-ai-storage.md#promoción): automática se permite, sin
   registro no)
4. **Qué pasa cuando dos participantes chocan** — la que la teoría contesta mal,
   porque la base ya decidió una parte

| Escala | Avanzar | Ver | La memoria promueve a | Colisión |
|---|---|---|---|---|
| Individual | el dueño | el dueño | nivel usuario | imposible — un solo participante |
| Colectiva | cualquier miembro del scope | miembros del scope | usuario (construido) y proyecto (no) | `steer` sobre el run vivo — ver abajo |
| Proyecto | cualquier miembro del roster | miembros del roster | sistema (no construido) | guarda de versión de roster — ver abajo |
| Sistema | sólo operadores | todos | terminal | fuera de alcance hasta que exista un scope de sistema |

Las celdas no construidas están marcadas así a propósito. Esta tabla especifica
*dónde van las respuestas*, y hoy tres están vacías.

## Tres restricciones que la base ya decidió

Cada respuesta colectiva de arriba está acotada por éstas. Todas **[read]**, y
ninguna es visible desde los documentos solos — que es el argumento para dejar
esta sección corta y la teoría más corta todavía.

### 1. Un run a la vez por sesión

La query de claim en `postgres-run-store.ts:149`:

```sql
SELECT id FROM runs WHERE status='pending'
  AND session_id NOT IN (SELECT session_id FROM runs WHERE status='running')
ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1
```

Los runs se serializan por sesión. **Colectivo no significa concurrente.** Dos
miembros de un grupo no pueden tener dos runs ejecutando contra la misma sesión,
nunca. La concurrencia a escala colectiva exige que el flow abarque varias
sesiones, que es [la pregunta abierta #2 de 03](03-ai-flows.md#preguntas-abiertas)
— y esta restricción es lo que convierte esa pregunta en algo estructural en vez
de una cuestión de gusto.

### 2. La primitiva multiplayer que existe es `steer`, no el paralelismo

```ts
export type RunSignalKind = "abort" | "steer";   // run-signal-store.ts:3
```

Un segundo mensaje que llega a un run vivo se rutea como señal hacia adentro
(`app-turn.ts:326-338`) y se aplica a mitad de turno (`run-signal-store.ts:80`).
La forma de trabajo colectivo que upstream ya soporta es **intercalar sobre un
run vivo**, no ejecutar en paralelo. Un flow que quiere dos personas actuando a
la vez no está extendiendo esta primitiva; está pidiendo otra.

### 3. Los cambios de roster invalidan el trabajo en vuelo

```ts
async function withCurrentProjectRoster<T>(fn) {            // app-turn.ts:102
  return (await deps.projects.withVersion(conversationRef, projectVersion, fn)) ?? null;
}
```

Si la versión del roster se movió, el turno se **rechaza**: `"project membership
changed; retry from the current project"` (`app-turn.ts:337`). Upstream ya
decidió que un cambio de membresía a mitad del trabajo es un rechazo y no una
continuación silenciosa. Los flows lo heredan; no pueden volver a decidirlo, y un
motor de flows que encola runs pasa por la misma guarda.

## Memoria, por el mismo eje

Los cuatro niveles de [05](05-ai-storage.md#los-cuatro-niveles) son este mismo
eje, más un nivel por debajo:

| Nivel | Escala | Existe hoy |
|---|---|---|
| Sistema | sistema | sólo `org:`; no hay kind `system` — [ADR-0003](adr/0003-storage-scope-axis.md) |
| Proyecto | proyecto | sí, como `group:web-project-<id>` |
| Usuario | individual | sí, `personal:` |
| Flow | por debajo de toda escala | **no** — no existe el scope kind `flow` |

Una flecha de promoción ya está construida, y 05 no lo dice:

```ts
export function ccTargetFor(origin, actorId): ScopeId | null   // memory-service.ts:158
export async function ccCaptureToPersonal(...)                 // memory-service.ts:166
```

Un hecho aprendido en un scope compartido se copia al scope `personal:` de quien
actuó, con la fuente etiquetada. Dispara sólo para orígenes `channel` / `group` y
nunca para actores de sistema, y está cableada en dos de las tres estrategias de
memoria (`per-turn.ts:140`, `scratch-promote.ts:167-170`) **[read]**.

Eso es la flecha `proyecto → usuario` del diagrama de promoción de 05, en
producción, hoy. Las que **no** existen son `flow → proyecto` y
`proyecto → sistema` — y la primera no puede existir hasta que exista un scope
`flow`.

## Qué toca M2

**Una celda.** Escala individual, scope `personal:`, una sesión, shape `Open`
([08-roadmap M2](08-roadmap.md)).

| Celda | Estado |
|---|---|
| Individual × `Open` | **M2** |
| Colectiva × `Open` | después de M2, y atada a la pregunta abierta #2 |
| Proyecto × cualquier shape | después de que un flow ejercite la guarda de roster |
| Sistema × cualquier shape | necesita el scope kind `system` — ADR-0003, sin probar |
| Cualquier escala × los otros cinco shapes | M6, y sólo cuando trabajo real lo exija |

Escribir las otras celdas ahora significaría especificar semántica de handoff
para escalas cuyo modelo de concurrencia es una pregunta abierta. El orden es
deliberado: la celda individual es la que falsifica `ai-flows` de entrada
([03 § Cómo se falsifica](03-ai-flows.md#cómo-se-falsifica)), y si un flow no le
gana a una sesión para una sola persona, las celdas colectivas son decoración
sobre algo que no funciona.

## Los supuestos sobre los que se apoya este documento

Se enuncian porque la alternativa — un documento teórico con los supuestos
implícitos — es cómo la primera pasada de `doc/` acumuló siete errores materiales
en una sola hora de correr la base de verdad
([02 § Lo que cambió al correrlo](02-ai-base.md#qué-cambió-al-correrlo)).

| # | Supuesto | Estado | El check que lo zanja |
|---|---|---|---|
| 1 | Agregar `flow` / `system` a `SCOPE_KINDS` **falla cerrado** en todos los caminos de ACL | **probado — y no se cumplía** **[ran]** | `ai-base/test/scope-kind-fail-closed.test.ts`. Ver abajo |
| 2 | Un paso es un turno de modelo | abierta ([03 #1](03-ai-flows.md#preguntas-abiertas)) | el primer paso que sólo renombra un archivo |
| 3 | Un flow puede abarcar varias sesiones | abierta ([03 #2](03-ai-flows.md#preguntas-abiertas)) | forzada por la restricción 1 de arriba; zanjarla antes de la celda colectiva |
| 4 | Un proyecto puede abarcar **uno o más grupos** | **falso hoy** — un proyecto *es* un grupo (`project-store.ts:47`) | necesita una relación nueva y por lo tanto un ADR nuevo; no asumirlo en ningún diseño |
| 5 | Cada scope kind tiene su propio `MEMORY.md` | **[read]** (`memory-service.ts:6`), observado sólo para `personal:` **[ran]** ([02](02-ai-base.md#qué-cambió-al-correrlo)) | escribir en un scope `group:` y mirar el disco |
| 6 | Las escalas se diferencian entre sí de un modo que importa | **sin probar** — ver falsación | la tabla de cuatro preguntas, llenada desde flows reales |

### El supuesto 1, corrido

ADR-0003 lo llamaba "the first thing to test". Se probó antes del ensanchamiento,
y **era falso** — no para los kinds que ai-os planea agregar, sino ya, hoy:

`actorMayReadScope` (`triggers/run-trigger.ts`) terminaba en
`if (kind !== "channel") return true`, así que un cron o un monitor cuyo
`ownerScopeId` no parseaba — malformado, o apenas mal capitalizado como
`PERSONAL:U1` — **corría el turno para un actor sin evidencia de membresía en
ningún lado.** `currentScopeMembers` devuelve `undefined` para cualquier kind que
no reconoce, y el llamador lee ese `undefined` como "caé en
`actorMayReadScope`", que decía que sí.

Corregido enumerando los kinds que otorga; comportamiento idéntico para los cinco
kinds actuales. El resto de la superficie de ACL ya estaba bien — cada decisión de
`resolution/scope-membership.ts` termina en `return false`.

**Lo que esto le da al eje de escalas** es un mecanismo y no una tranquilidad: el
test lleva un censo que afirma que `SCOPE_KINDS` tiene exactamente los cinco kinds
de upstream, así que el día que aterrice el ensanchamiento el test falla y quien
lo haga tiene que darle a `flow` y `system` una decisión explícita en vez de
dejarlos heredar un default. Es la guarda que pedía ADR-0003, y corre como job
propio de CI — `Fail-closed scope guard` en `.github/workflows/ci.yml`, con
nombre separado de los cinco shards para que su falla no pase desapercibida.

**La lección general, que vale más que el bug:** el fail-open estaba en un
fall-through, no en una función de permisos. Nada de la tabla de cuatro preguntas
lo habría encontrado, porque la tabla describe qué *debería* responder cada
escala — y ese código nunca preguntaba.

Los supuestos 1 y 4 son los que cargan peso. **El 4 es el que contradice un
objetivo declarado**: "un proyecto que abarca uno o más grupos de trabajo" no es
algo que la base pueda expresar hoy, y la versión honesta de ese requisito es una
relación nueva entre `Project` y varios scopes `group:`, argumentada en su propio
ADR cuando un proyecto real la necesite.

## Cómo se falsifica

**La afirmación:** las cuatro escalas responden las cuatro preguntas de manera
*distinta*, y esa diferencia es lo que un scope plano no puede expresar.

**La medición:** cuando haya flows corriendo en más de una escala, llenar la
tabla de cuatro preguntas desde el comportamiento y no desde el diseño. Si todas
las escalas responden idéntico las cuatro, el eje es contabilidad — **este
documento se borra y la escala vuelve a colapsar en el `scopeId` sin semántica
ai-os encima**, no se defiende.

**La afirmación más chica, y la primera que vale mirar:** en la escala colectiva,
alguien que no creó el flow lo avanza. Si a lo largo de trabajo real nadie toma
nunca un flow que no arrancó, la escala colectiva es peso muerto por más bien
especificada que esté — y lo que se falsifica ahí es el contrato de handoff de
cada shape ([03](03-ai-flows.md#formas-de-flow)), no este documento.
