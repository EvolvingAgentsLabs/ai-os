# ADR-0009 · Un flow registra el principal para el que actúa, y eso no es un agente-principal

- **Fecha:** 2026-08-07
- **Estado:** Aceptado

## Contexto

Correr un flow compuesto en un scope de proyecto produjo un rechazo del core
**[ran]**:

```
core 403 on /v1/turns?async=1: {"status":"refused","reason":"you're not a member of that context"}
```

Ese es el guard de roster de upstream funcionando. El servidor de flows avanza un
paso posteando un turno, el turno llevaba la identidad de servicio `flows`, y
`flows` no está en ningún roster de proyecto. El parche fue `FLOWS_ACTOR` — un
principal configurado, una persona real, que tiene que ser miembro de todos los
scopes que el servidor toca.

`FLOWS_ACTOR` está mal como siempre están mal las cuentas de servicio compartidas:
**cada flow en la auditoría queda atribuido a la misma persona sin importar quién
lo pidió.** En un sistema cuyo argumento entero es que el trabajo se puede pasar
entre personas, eso no es un defecto cosmético.

### La lectura que fue demasiado rápida

Esto se registró primero, en el commit que introdujo el parche, como la condición
de [ADR-0008](0008-conformation-is-projected.md) para agentes-principal
disparándose — *"un agente que deba aparecer en un roster"*. **Esa lectura está mal
y este ADR existe en parte para corregirla.**

Lo que fue rechazado fue una **cuenta de servicio**, y el arreglo que sugiere una
cuenta de servicio — meterla en el roster — no es el que la situación pide. Un flow
no es trabajo autónomo que apareció de la nada. Alguien lo creó. Esa persona ya
está en el roster, ya tiene derecho a actuar en ese scope, y ya es a quien la
auditoría debería nombrar. Al sistema no le faltaba una identidad de agente; **le
faltaba la procedencia que ya tenía y tiró.**

`Flow` lleva `scopeId`, `title`, `goal`, `shape`, `state`, `forkedFrom` — y nada
sobre para quién es. Así que cuando un paso necesitó un actor genuinamente no había
nadie que ser, y una cuenta de servicio era la única respuesta disponible. Esa
ausencia es el defecto, no el tipo de principal faltante.

## Decisión

**Un flow registra el principal para el que actúa. Un paso corre como ese
principal. No se agrega ningún `PrincipalType` nuevo.**

Concretamente:

1. `Flow` gana `actorId` — el principal que lo creó, registrado en la creación y
   nunca inferido después.
2. `POST /flows` y `POST /flows/from-agent` lo exigen. Un flow sin actor no se
   crea, en vez de crearse y quedar atribuido en silencio a una cuenta de servicio.
3. El turno de un paso corre como `flow.actorId`. El guard de roster de upstream
   hace entonces exactamente aquello para lo que existe: si esa persona es removida
   del proyecto, sus flows dejan de avanzar, lo cual es correcto y no es un caso
   que ai-os deba esquivar.
4. `FLOWS_ACTOR` se elimina cuando (1)–(3) aterricen. Dejarlo como fallback
   preservaría el modo de falla que este ADR existe para quitar.
5. **La pregunta del agente-principal sigue diferida**, con una condición más
   afilada — ver Consecuencias.

Nada de esto toca `ai-base`. `flow_flows` es nuestra tabla; el actor es nuestro
para registrar; el turno ya acepta cualquier actor que el llamador nombre.

## Alternativas rechazadas

**Agregar `flows` a todos los rosters de proyecto.** La lectura literal del error, y
deja la auditoría permanentemente inútil: cada flow de cada proyecto atribuido a una
cuenta de servicio, con el solicitante real recuperable desde nada. Además le da a
una identidad de larga vida membresía de todos los proyectos, que es un privilegio
permanente que nadie revisa.

**Un tercer `PrincipalType`, ahora.** Es lo que ADR-0008 difirió y no es lo que la
evidencia pide. El rechazo fue sobre procedencia, no sobre un agente que necesite
derechos propios — y el costo es un cambio en `types.ts` en el centro de una
dependencia que se trae cada semana, que es la línea más cara disponible. Comprarla
contra una señal mal leída es peor que no comprarla.

**Inferir el actor desde el scope del flow** — el dueño del proyecto, digamos.
Rechazado: fabrica procedencia en vez de registrarla. El dueño no pidió ese flow, y
una auditoría que nombra a una persona plausible es peor que una que dice que no
sabe.

**Que el actor sea opcional, con `FLOWS_ACTOR` por defecto.** Rechazado porque un
default es cómo sobrevive la falla actual. Un campo opcional con una cuenta de
servicio detrás es la misma atribución compartida con un paso extra.

## Consecuencias

- **Ganancia: la auditoría pasa a ser verdadera.** Cada turno que corre un flow
  queda atribuido a la persona que pidió el trabajo, por el mismo mecanismo que los
  turnos propios de una persona.
- **Ganancia: cero superficie de permisos nueva.** El guard de roster ya decide
  quién puede actuar en un scope. Esto deja de esquivarlo.
- **Costo: un flow ahora puede quedar bloqueado por un cambio de membresía.** Si su
  actor deja el proyecto, el flow se detiene. Es correcto — la alternativa es
  trabajo continuando en un scope en nombre de alguien que fue removido — y hace que
  el guard de versión de roster de [09-scales](../09-scales.md) también muerda en
  los flows.
- **Costo: los flows existentes no tienen actor.** Se crearon antes de que el campo
  existiera. Quedan con `actorId: null` y no se pueden avanzar, en vez de rellenarse
  con una suposición, porque un actor adivinado es exactamente la procedencia
  fabricada que se rechazó arriba.
- **Condición afilada para el agente-principal**, que reemplaza la de ADR-0008, lo
  bastante laxa como para haber sido malinterpretada una vez ya:

  > Un agente-principal se reabre cuando un agente necesita un derecho **que ningún
  > solicitante humano tiene** — membresía de un scope que ninguna persona en él
  > pidió, memoria que ninguna persona posee, o una decisión de ACL que difiere de
  > la de todo humano para el que podría actuar. *Una cuenta de servicio rechazada
  > no es esto*, ni ningún caso que registrar al solicitante hubiera resuelto.

- **Test que lo hace cumplir:** crear un flow sin actor falla. Si algún camino de
  código necesita alguna vez crear un flow sin actor, este ADR necesita revisión en
  vez de un default.

## Estado del trabajo

**Decidido, todavía no construido.** El cambio de schema, las dos rutas y la
eliminación de `FLOWS_ACTOR` no están implementados al 2026-08-07 — registrado acá
para que la decisión no se confunda con el cambio
([08-roadmap § Fase 3](../08-roadmap.md)).
