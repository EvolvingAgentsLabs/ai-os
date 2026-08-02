# ADR-0005 · La escala del trabajo es su scope, y un proyecto es un grupo

> **El inglés es canónico.** Traducción de
> [`doc/adr/0005-scale-is-scope.md`](../../adr/0005-scale-is-scope.md).

- **Fecha:** 2026-08-02
- **Estado:** Aceptada

## Contexto

El trabajo ocurre en cuatro escalas sociales — individual, colectiva, proyecto,
sistema — y tanto `ai-flows` como `ai-storage` necesitan una respuesta para cada
una. La pregunta estaba por responderse dos veces, en dos vocabularios: las
formas de flow estaban adquiriendo una noción de quién participa, y los niveles
de memoria ya tenían una.

QM la responde una sola vez. `ScopeId` es `"<kind>:<ref>"` sobre una unión cerrada
(`ai-base/src/types.ts:12`), y es la clave única de memoria, archivos, vista del
keychain, permisos, crons y sandbox. El modelo de flow ya lleva un `scopeId`.

Dos hechos encontrados al verificar esto, ambos **[read]**:

- **Un proyecto de QM es un scope `group` con un prefijo de ref reservado** —
  `projectScopeId(id) → group:web-project-<id>` (`projects/project-store.ts:47`),
  respaldado por un `ProjectStore` con roster y versión por roster
  (`project-store.ts:27-41`). No es `team:`; `team:` sale de `Principal.teamIds`
  (`types.ts:8`), que son equipos del proveedor de identidad.
- **`isManageableCreationScope` (`channel | team`) e `isSharedScope`
  (`channel | group`) no coinciden** ni sobre `team` ni sobre `group`
  (`types.ts:36,42`), así que elegir el kind para "proyecto" cambia la respuesta
  según qué helper consulte cada call site.

## Decisión

**La escala de un flow — y de un nivel de memoria — es su `scopeId`. ai-os no
define ninguna taxonomía paralela de escalas.**

Concretamente:

- Individual es `personal:`, colectiva es `group:` / `channel:`, proyecto es
  `group:web-project-<id>` vía el `ProjectStore` de upstream, y sistema es `org:`
  hasta que exista el kind `system` de [ADR-0003](0003-storage-scope-axis.md).
- Una escala se especifica con cuatro preguntas — quién puede avanzar, quién
  puede ver, a dónde promueve su memoria, qué pasa en una colisión — y las formas
  heredan las respuestas de su escala en vez de repetirlas ([09](../09-scales.md)).
- **ai-os no implementa un objeto de proyecto.** Rosters, mutaciones de membresía
  y versionado de roster son de upstream: se leen y se reutilizan.

## Alternativas rechazadas

**Una taxonomía de escalas propia, al lado de los scopes.** Rechazada por la
misma razón por la que ADR-0003 rechazó codificar el nivel dentro del `ref`: una
clasificación que los chequeos de permisos no consultan produce una segunda
respuesta a *"quién puede leer esto"*, y la que pierde es la que nadie ve perder.

**`team:` para la escala de proyecto.** Es lo que decía [05](../05-ai-storage.md)
antes de este ADR. Rechazada por evidencia: el objeto de proyecto de upstream
resuelve a un scope `group`, así que `team:` habría significado una escala de
proyecto que el propio `ProjectStore` de upstream no puede ver, más la asimetría
de `isSharedScope` de arriba.

**Una lista `participants[]` en el flow, independiente del scope.** Atractiva
porque hace explícito el handoff. Rechazada: es una ACL que ninguna función de
ACL lee. La membresía pertenece al directorio y al project store; un flow que
guarda su propia copia tiene una copia vieja en el momento en que se saca a
alguien — y upstream ya rechaza el trabajo en vuelo cuando se mueve la versión
del roster (`app-turn.ts:102-106,337`).

## Consecuencias

- **Costo: ai-os hereda el modelo de "proyecto" de upstream, incluida la parte
  que no quiere.** Un proyecto es exactamente un grupo. "Un proyecto que abarca
  uno o más grupos de trabajo" no es expresable hoy, y se convierte en su propio
  ADR cuando un proyecto real lo necesite — no en un supuesto colado dentro de un
  diseño.
- **Ganancia: cero superficie nueva de permisos.** Cada pregunta de escala la
  responde un chequeo que ya existe y que upstream ya testea.
- **Riesgo: el scope de flow todavía no existe.** La memoria a nivel de flow es
  el único nivel sin un scope kind detrás, y el ensanchamiento de ADR-0003 sigue
  **sin probar** — en particular, si las funciones de ACL fallan cerradas ante un
  kind desconocido. Ese test va antes de cualquier escala más allá de la
  individual.
- **Test que lo hace cumplir:** un flow de cualquier escala resuelve sus
  participantes sólo a través del `ScopeId`. Si alguna vez un flow necesita una
  lista de membresía propia para responder "quién puede avanzar esto", este ADR
  hay que revisarlo, no doblarlo en silencio.
