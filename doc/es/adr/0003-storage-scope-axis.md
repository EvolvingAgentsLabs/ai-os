# ADR-0003 · Agregar `flow` y `system` a los scope kinds de QM

> **El inglés es canónico.** Traducción de
> [`doc/adr/0003-storage-scope-axis.md`](../../adr/0003-storage-scope-axis.md).

- **Fecha:** 2026-08-01
- **Estado:** Aceptada

## Contexto

`ai-storage` direcciona memoria en cuatro niveles: sistema, usuario, proyecto,
flow ([05](../05-ai-storage.md)).

Los scope kinds de QM son una unión cerrada — `ai-base/src/types.ts:12`:

```ts
const SCOPE_KINDS = ["personal", "channel", "team", "org", "group"] as const;
```

Un `ScopeId` es `"<kind>:<ref>"`, y es la clave para memoria, archivos, vista del
keychain, permisos, crons y sandbox. Nuestros niveles mapean así:

| Nivel de ai-storage | Scope kind de QM |
|---|---|
| Usuario | `personal` ✓ |
| Proyecto | `team` / `channel` ✓ |
| Sistema | `org` — cercano, pero es configuración de organización, no "cómo opera este SO" |
| **Flow** | **nada** |

## Decisión

**Agregar `flow` y `system` a `SCOPE_KINDS` dentro de `ai-base`.**

Un ensanchamiento de dos líneas de un array `const`. Registrado en
`ai-base/AI-OS-PATCHES.md` y ofrecido upstream como propuesta escrita a mano.

## Alternativas rechazadas

**Codificar el nivel en el string `ref`** — por ejemplo `team:project-42/flow-7`.

Rechazada, y esta es la razón que carga el peso de todo el ADR: `parseScopeId`
corta en el primer `:` y devuelve `{ kind, ref }`, y **cada chequeo de permisos en
QM parsea un `ScopeId`**. Un scope falso escondido dentro de `ref` sería leído por
`isSharedScope` e `isManageableCreationScope` como el kind *exterior*. La memoria
de flow heredaría en silencio la ACL del proyecto, y no habría bug visible — sólo
una sobre-exposición callada y permanente.

Cero modificación del core no vale un bypass silencioso de ACL.

**Un sistema de scopes paralelo sólo para ai-storage.** Rechazada: dos sistemas de
scopes en un mismo proceso es cómo se llega a dos respuestas distintas a "quién
puede leer esto". Todo el valor del modelo de scopes de QM es que es la única
clave para todo.

**Reutilizar `org` para el nivel de sistema.** Parcialmente viable — `org` es
cercano. Rechazada por claridad: la *configuración* a nivel de organización y la
*memoria operativa* a nivel de sistema tienen vidas y audiencias distintas, y
confundirlas implica que los hechos de sistema hereden los permisos de escritura
de la configuración de organización.

## Consecuencias

- **Dos líneas de divergencia del core**, en el archivo con más probabilidad de
  ser tocado upstream. Aceptado: la alternativa es un agujero de ACL.
- **Hay que chequear cada `switch` sobre `ScopeKind` de upstream** buscando
  exhaustividad después de cada subtree pull. TypeScript lo detecta donde el
  switch es exhaustivo; donde cae en un `default`, no. Agregar al checklist de
  pull en `AI-OS-PATCHES.md`.
- **Los kinds nuevos deben negarse por defecto** en los chequeos de permisos hasta
  ser manejados explícitamente. Un scope kind desconocido para una función de ACL
  tiene que fallar cerrado, nunca abierto. Es lo primero que hay que testear.
- **Upstreameable.** Chico, genérico, y `flow` es plausiblemente útil para QM
  independientemente de ai-os — pero recién después de que `ai-flows` exista para
  justificarlo.
