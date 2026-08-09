# 00 · Visión

<img src="../assets/00-vision.jpg" alt="" width="100%">

<sub>Conversación dispersa convertida en un objeto durable.</sub>

> **Proyecto.** Por qué existe esto. Nada acá afirma nada sobre software que corra.


> **El inglés es canónico.** Traducción de [`doc/00-vision.md`](../00-vision.md).

## La afirmación

Los agentes hoy son **aplicaciones**. ai-os es el argumento de que deberían ser un
**sistema operativo** — y que la diferencia no es de marca, sino cuatro
abstracciones concretas que faltan.

### El mismo hueco, dicho al revés

Y Combinator, 2026-07-31 —
[@ycombinator](https://x.com/ycombinator/status/2079963728439832823):

> Las mejores herramientas de trabajo se volvieron más potentes cuando se
> volvieron multijugador. Pero la IA sigue mayormente atrapada en chats privados,
> con agentes trabajando en sesiones a las que los compañeros de equipo no pueden
> sumarse ni influir.

Ese es el argumento de este documento llegando desde la dirección opuesta.
Nosotros llegamos desde *"un sistema operativo necesita una unidad de trabajo"*;
ellos desde *"el trabajo es multijugador"*. Los dos aterrizan en el mismo objeto.

El puente es una sola frase: **no se puede delegar una conversación.** Un handoff
necesita algo con un objetivo declarado, un estado actual y una historia — algo
que una segunda persona pueda abrir, leer, redirigir y tomar. Una sesión no es
nada de eso. Es privada a quienes participaron, la compactación la resume, y se
bifurca sin registrar que se bifurcó. La unidad está mal, así que todo lo que se
apoya encima es de un solo jugador por construcción.

Vale mantener la honestidad sobre qué afirmación hacemos: la de ellos dice *"en
tiempo real"*. La nuestra es **multijugador asincrónico** — un objeto durable
sobre el que varias personas actúan a lo largo de días, se delega, se bifurca y se
vuelve a unir. La co-presencia en tiempo real es un objetivo legítimo y no es
hacia el que construimos primero ([04-ai-ui](04-ai-ui.md#alcance-del-v1) excluye
la edición simultánea del v1). Delegar trabajo que *sigue corriendo*, sin perder
lo que aprendió, es la mitad difícil y la parte que no tiene nadie.

## Qué falta realmente hoy

Tomá cualquier producto de agentes actual, QM incluido, y hacé cuatro preguntas.

**"¿En qué está trabajando este agente?"** La respuesta honesta es una lista de
sesiones. Una sesión es una conversación, no una unidad de trabajo. No tiene
objetivo declarado, ni condición de éxito, ni relación con la sesión que la
precedió. Cuando una conversación se compacta, el trabajo no sobrevive — sobrevive
un resumen. No hay un objeto que puedas señalar y decir *eso es lo que se está
haciendo*.

**"¿Qué sabe, y por qué?"** La memoria es un archivo. En QM es literalmente
`memory/MEMORY.md`, una lista de bullets con tope de 300 hechos que descarta el
más viejo cuando desborda (`ai-base/src/memory/memory-service.ts`). Todo lo que el
sistema aprendió es un único namespace plano por scope, sin noción de que un hecho
pertenezca a *este proyecto* o a *aquel flow* en vez de a vos personalmente, y sin
forma de preguntar por qué está ahí.

**"¿Qué está mirando?"** Un log de chat y algunos paneles. La interfaz es una
transcripción de lo que se dijo, alejándose hacia arriba, que es la metáfora
correcta para una conversación y la equivocada para trabajo que dura semanas e
involucra doce artefactos.

**"¿Puedo tomar esta corrida y bifurcarla?"** Podés bifurcar una sesión — QM tiene
el endpoint (`ai-base/src/api/app-sessions.ts:392`). Nada registra que el fork
*es* un fork: no hay puntero al padre en ninguna parte del código, sólo una fila
de auditoría. Así que podés bifurcar, y nunca podés hacer diff, merge ni explicar
la divergencia después.

Esas cuatro no son bugs. Son la capa que nadie construyó, porque todos siguen
construyendo la aplicación.

## Los cuatro pilares

**`ai-flows` — trabajo por encima del turno.** Un flow es una unidad de trabajo
declarada, persistida y reanudable, con un objetivo, una forma, un estado y una
historia. Sobrevive a la sesión que lo arrancó, abarca varios agentes y
superficies, aguanta la compactación y el reinicio, y puede inspeccionarse,
pausarse, bifurcarse y reproducirse. El turno pasa a ser un detalle de
implementación del flow, no el objeto de primer nivel.

**`ai-ui` — el canvas inteligente.** Una superficie espacial y viva donde el flow,
sus artefactos, sus agentes y su estado son *objetos que acomodás*, no mensajes
que se van hacia arriba. El canvas es inteligente en un sentido concreto: lo
genera y regenera el sistema a partir del estado del trabajo, en vez de armarlo a
mano. Lo que ves es una proyección del flow, no un log de la conversación.

**`ai-storage` — memoria con espacio de direcciones.** Cuatro niveles — sistema,
usuario, proyecto, flow — cada uno con su tiempo de vida, visibilidad y política
de consolidación. Un hecho aprendido dentro de un flow no pasa a ser en silencio
algo que creés para siempre. La promoción entre niveles es explícita y reversible.
Esta es la pieza donde la organización tiene trabajo real del que partir y,
honestamente, también donde su intento anterior midió **igual que el enfoque
ingenuo**; ver [05-ai-storage](05-ai-storage.md) para cómo eso moldea el diseño.

**`ai-base` — la base operativa.** QM. Identidad, scopes, permisos, sandboxes,
auditoría, la capa de modelos, las superficies de Slack y web, el deploy. No lo
escribimos nosotros y no lo vamos a reescribir.

## Qué NO es esto

- **No es un competidor de QM.** Si un cambio corresponde upstream, va upstream.
  El fork existe para movernos rápido en la capa de arriba, no para relitigar la
  base.
- **No es un framework.** Esta organización construyó frameworks de agentes
  repetidamente y los borró; la última vez borró 10.165 líneas porque un SDK las
  había superado. ai-os agrega abstracciones que la base genuinamente no tiene, y
  adopta todo lo demás.
- **No es un proyecto de investigación.** Cada pilar tiene que correr contra
  trabajo real, o no está en el repositorio.

## El riesgo honesto

El patrón que esta organización repite es: una arquitectura coherente,
documentada a fondo, nunca amarrada a nada que pudiera contradecirla. El flagship
anterior publicó 18.680 líneas con tres funciones de test.

Así que el compromiso falsable de ai-os queda escrito acá, arriba de todo, antes
de cualquier código: **cada pilar se entrega con la medición que mostraría que no
vale la pena.** Para flows, que un flow complete trabajo que una sesión pierde.
Para storage, que la memoria por niveles recupere mejor que un archivo plano — la
afirmación exacta que ya volvió en cero la vez pasada. Para el canvas, que una
persona encuentre el estado más rápido que en una transcripción. Un pilar sin su
medición no está terminado, por más que esté todo escrito.
