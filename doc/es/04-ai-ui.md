# 04 · ai-ui — el canvas inteligente

> **El inglés es canónico.** Traducción de [`doc/04-ai-ui.md`](../04-ai-ui.md).
>
> **Estado: especificado, no implementado.**

## El problema

La web UI de QM es una buena aplicación de chat: dos sesiones concurrentes, una
barra lateral con archivos, crons, keychain, deploys, memoria y skills. Vite +
Lit, con `dockview-core` haciendo el layout de paneles
(`ai-base/plugins/web-ui/`).

Una transcripción es la forma correcta para una conversación y la equivocada para
el trabajo. Tres fallas concretas:

1. **El presente se va hacia arriba.** El estado actual del trabajo se deduce
   leyendo historia hacia atrás. En trabajo que dura semanas, la respuesta a
   "dónde está esto" no está en el último mensaje.
2. **Los artefactos se mencionan, no se sostienen.** Un archivo, una app, un
   borrador, una decisión — cada uno aparece como un mensaje *sobre* él, y después
   se aleja al mismo ritmo que una charla trivial.
3. **Los paneles son un menú fijo.** Archivos, crons, keychain, skills — los
   mismos paneles sin importar qué estés haciendo. La interfaz no tiene opinión
   sobre el trabajo.

## La afirmación

> La interfaz debería ser una **proyección del estado del trabajo**, espacial y
> viva, generada por el sistema — no un log de lo que se dijo.

## Qué significa "canvas inteligente"

Con precisión, para que no degenere en "un canvas con IA adentro":

**Espacial.** Los objetos tienen posición y persisten. Un flow, sus pasos, sus
artefactos, sus agentes y sus preguntas abiertas son cosas que acomodás y a las
que volvés, no mensajes que dejás atrás. La posición significa algo y se guarda.

**Vivo.** Los objetos reflejan el estado actual sin que haya que volver a
preguntar. Un paso corriendo se ve corriendo. Un artefacto que cambió un agente
se actualiza en el lugar.

**Generado.** Esta es la palabra que carga el peso. El canvas lo *compone el
sistema a partir del estado del flow* — la forma de un `Fan-out` sobre 40 hilos no
es la de una `Deliberation` sobre tres arquitecturas, y el usuario no debería
estar armando ninguna de las dos a mano. El sistema propone la disposición; el
usuario la sobreescribe; **la sobreescritura se recuerda** y le gana a la
propuesta de ahí en adelante.

**Dirigible.** La manipulación directa es una entrada de primera clase, a la par
del texto. Mover un paso, partir un artefacto, marcar una rama como muerta — todo
eso son instrucciones, no sólo cambios de vista.

El modo de falla contra el que hay que diseñar: un layout generado que se
reacomoda bajo las manos del usuario. **Regla: el sistema propone cuando cambia el
estado; nunca reacomoda lo que el usuario tocó.**

## Relación con la web-ui existente

`ai-ui` es un **quinto plugin**, construido contra el mismo chassis que `web-ui`,
`admin`, `portal` y `auth`. No bifurca ni reemplaza a `web-ui`, por dos razones:
`web-ui` es la superficie que todo el upstream mantiene funcionando, y correr las
dos permite compararlas sobre trabajo real en vez de afirmar que el canvas es
mejor.

**Vive en `ai-base/deploy/layers/evolvingagents/plugins/`** — la ubicación
sancionada por QM para las imágenes de servicio propias de una organización
(`ai-base/deploy/layers/README.md`). Es el único pilar que no necesita ninguna
divergencia del core: es exactamente la personalización para la que upstream
diseñó el límite de layers. El código fuente vive en `ai-ui/`; el layer contiene
su imagen de deploy y su configuración.

Cuando el canvas necesite datos que la API de QM no expone, la solución es una
ruta en `ai-flows`, no un canal especial hacia el core.

### El contrato del chassis, verificado

`ai-base/plugins/chassis/package.json` — *"firma de source-auth, los helpers
firmados de cliente del core, helpers chicos de request/response de `node:http`,
helpers de error, y el bloque común de env `CORE_*`… nunca importa el core."*

Consecuencias que aceptamos:

- `ai-ui` habla con el core **sólo por HTTP firmado**. Sin proceso compartido, sin
  acceso directo a los stores.
- Auth, identidad y scope vienen del core. El canvas renderiza lo que el scope de
  quien llama permite, y nunca lo amplía.
- El chassis es sólo-fuente y no se publica; las imágenes Docker copian
  `plugins/chassis` junto a cada plugin. `ai-ui` sigue el mismo empaquetado.

## Tecnología

Arrancar de lo que upstream ya corre, y divergir sólo donde el canvas lo exija:

| Aspecto | Elección | Por qué |
|---|---|---|
| Render | Lit | Lo que usa `web-ui`; no un segundo framework en un mismo repo |
| Layout | `dockview-core`, y después reevaluar | Ya es dependencia; los paneles acoplables son un canvas débil pero un punto de partida real |
| Transporte | HTTP firmado del chassis + el streaming existente del core | No inventar un segundo protocolo |
| Superficie de canvas | **Abierta** | Los paneles acoplables podrían no sobrevivir al contacto con un canvas espacial. Decidir después de renderizar el primer flow real, no ahora |

Esa última fila queda deliberadamente sin resolver. Elegir un motor de canvas
antes de haber renderizado un flow real es el tipo de decisión que esta
organización ya tomó demasiado temprano.

## Alcance del v1

**Adentro:** renderizar un flow corriendo — pasos, estados, artefactos, el agente
activo; actualizaciones en vivo; manipulación directa del estado de un paso;
layout persistido por scope; disposición propuesta por el sistema según la forma
del flow, sobreescribible y pegajosa.

**Afuera:** reemplazar `web-ui`; Slack (esa superficie queda como upstream la
entrega); **edición simultánea del canvas por varios usuarios**; una herramienta
de diagramación general.

> La exclusión de la edición simultánea es la que hay que decir en voz alta, dado
> que el problema que enmarca el proyecto es
> [multijugador](../../README.es.md#el-problema-la-ia-sigue-siendo-de-un-solo-jugador).
> ai-os apunta a **multijugador asincrónico** — varias personas actuando sobre un
> objeto durable a lo largo de días — no a co-presencia en tiempo real. Es una
> afirmación más angosta, y hay que sostenerla en vez de dejar que se lea como la
> otra.

## Cómo se falsifica

**La medición:** una persona, y un flow que no corrió ella, de tres días atrás.
Tiempo hasta responder: *cuál es el estado, qué está bloqueado, qué produjo*.
Canvas contra la transcripción de `web-ui`.

**La afirmación:** el canvas es más rápido, y la brecha se agranda con la edad del
flow.

**Si no es más rápido, ai-ui es decoración.** Es el pilar más vulnerable a ser
lindo e inútil, así que la medición es un cronómetro sobre una tarea real y no una
opinión sobre cómo se ve.
