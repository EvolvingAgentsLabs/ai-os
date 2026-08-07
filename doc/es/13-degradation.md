# 13 · Degradación — por qué un sistema bien configurado deja de estar bien

<img src="../assets/13-degradation.jpg" alt="" width="100%">

<sub>Un paso de revisión que corre, reporta y no aporta nada.</sub>

> **El inglés es canónico.** Traducción de [`doc/13-degradation.md`](../13-degradation.md).
>
> **Estado: un modo de falla documentado y una medición propia. Nada de esto está
> construido.** Este documento existe para nombrar algo que ai-os hoy no puede
> notar, y para decir qué haría falta para notarlo — no para afirmar que lo hace.

Todo lo demás en `doc/` pregunta si un diseño vale la pena construirse. Este
pregunta otra cosa: **una vez corriendo, ¿cómo se enteraría alguien de que dejó de
ser bueno?**

La respuesta hoy es que no se enteraría. ai-os puede decir si un flow se *mueve*
([10-observability](10-observability.md), δ medido). No tiene ningún instrumento
para si el trabajo *está empeorando*. Son fallas distintas, y la segunda es más
silenciosa.

## El caso: supervisión que no ayudó

Google DeepMind / Google Research, *Towards physician-centered oversight of
conversational diagnostic AI* ([arXiv:2507.15743](https://arxiv.org/abs/2507.15743)).
Un OSCE virtual aleatorizado y ciego sobre **60 escenarios**. Un agente, g-AMIE,
hacía la anamnesis y proponía un diagnóstico diferencial y un plan; después un
médico de atención primaria supervisor revisaba y podía editar ambos antes de que
se emitiera nada. Human-in-the-loop bien hecho: el humano tiene la última palabra,
ve todo, y puede cambiar cualquier cosa.

El hallazgo, citado exacto **[read]**:

> "in 93.3% of scenarios, edits did not improve (in 21.7% edits reduced)
> diagnostic quality"

Que se descompone en:

| ediciones del médico | proporción de escenarios |
|---|---:|
| mejoraron la calidad diagnóstica | **6,7%** |
| no cambiaron nada | 71,6% |
| **redujeron** la calidad diagnóstica | **21,7%** |

### Lo que esto NO dice

No es *"la revisión humana empeora la salida de la IA"*, y leerlo así tira la parte
más útil. El mismo paper reporta la misma medida para los brazos humanos de
control: las ediciones no mejoraron el **80%** de los casos g-PCP y el **83,3%** de
los g-NP/PA — o sea que la supervisión mejoró cerca del 20% y del 17% del trabajo
*humano* contra el 6,7% del agente.

La asimetría es el hallazgo. **La supervisión aportó menos donde la salida ya era
fuerte**, y donde actuó, restó casi tanto como sumó. El paso de revisión no era
inútil en principio; se aplicó a algo que ya tenía muy poco margen, por un revisor
cuyo juicio valía menos en ese margen particular que la cosa revisada.

## La misma forma, en nuestro propio sistema, medida hoy

El 2026-08-07 un flow compuesto corrió tres agentes de proyecto en secuencia:
`SchemaAgent → MigrationAgent → ReviewAgent`. Todos los pasos completaron. El flow
llegó a `done`. La página renderizó en verde.

`ReviewAgent` devolvió **[ran]**:

> "There are no files in the workspace to review. There is no change visible, so I
> cannot point to any defect on any line."

Tenía razón, y era inútil. Cada delegación arrancaba con contexto aislado, así que
el revisor nunca vio el esquema que propuso el primer paso. **Un paso de revisión
corrió, reportó limpio y no aportó nada — mientras cada señal que el sistema tenía
decía que el flow había salido bien.**

Los mismos agentes, el mismo objetivo, después de que cada paso recibiera los
resultados de los anteriores:

> "**Defect 1 — Line 4:** `NULL` on the `currency` column violates the invariant
> that every ledger must have a well-defined currency."

Nada de la *configuración* cambió entre esas dos corridas. Los agentes, su
markdown, su árbol declarado, las tools que tenían — idénticos. Lo que cambió fue
una propiedad de la **ejecución**: qué podía ver cada paso.

Ese par de citas es todo el argumento de este documento. **Una configuración que
parece óptima en el papel no es evidencia sobre el sistema que corre.** La primera
corrida no era un bug que alguien fuera a reportar: terminó, fue rápida, y todos
los chequeos pasaron.

## Qué necesitaría ai-os para notarlo

Siendo preciso sobre el hueco, porque "los agentes deberían adaptarse" es un deseo
hasta que nombra una señal:

**Lo que existe.** `observabilityOf` contesta *¿este flow se sigue moviendo?* desde
los digests de intentos, contra un piso de ruido medido
([10-observability](10-observability.md)). Habría llamado `progressing` a las dos
corridas de arriba. Y no se equivoca — se movían.

**Lo que no existe, de más barato a más caro:**

1. **La contribución de un paso.** En la corrida fallida, la salida de
   `ReviewAgent` era casi idéntica en contenido informativo a no tener paso. Un
   paso cuyo digest de observación no te dice nada que no tuvieras ya del paso
   anterior es un paso que no contribuyó — y `digestOf` ya es el instrumento que
   podría decirlo. **Éste es el barato, y no está construido.**
2. **Margen, antes de agregar supervisión.** El resultado de g-AMIE es la versión
   clínica de una regla que este repositorio ya tuvo que aprender: **chequear el
   margen antes de construir el tratamiento**. Su propio benchmark de memoria sacó
   10/10 en el baseline y su suite de física pasó 12/12 — en ambos todos los brazos
   empataron en el techo y el empate se leyó como éxito
   ([08 § M4](08-roadmap.md)). Un paso de revisión agregado a trabajo que ya está
   bien, en el mejor caso, no hará nada.
3. **Si una intervención ayudó.** El paper pudo calcularlo porque tenía un
   evaluador con verdad de referencia. ai-os no lo tiene para trabajo general, e
   inventarlo es el camino caro — por eso (1) va primero.

## Hacia dónde apunta, y cómo se falsifica

La dirección es la que sugiere el caso: **un sistema de agentes debería poder
reportar sobre su propia ejecución, no sólo producir salida** — un paso que avisa
"no me dieron nada con qué trabajar" vale más que uno que contesta igual en
silencio. El árbol declarado ([12-conformation](12-conformation.md)) es la
configuración; este documento es sobre la distancia entre eso y lo que pasa.

Pero la afirmación tiene que ser falsificable o es un eslogan:

> **Falsación.** Construir (1) — marcar un paso cuya observación no agrega nada
> sobre la del anterior — y correrlo sobre flows reales. Si se dispara en corridas
> que estaban genuinamente bien tan seguido como en las que no, es ruido y hay que
> borrarlo en vez de afinarlo. Si nunca se dispara, el modo de falla de arriba fue
> un caso aislado y este documento es una anécdota, no una entrada de diseño.

La expectativa honesta es que (1) va a ser ruidoso: un paso que legítimamente
reformula su entrada se ve igual que uno que no agregó nada. Esa es exactamente la
distinción para la que se construyó δ, y por eso esto reutiliza ese instrumento en
vez de proponer uno nuevo.

## La regla que deja

Corta como para sobrevivir:

> **La configuración es una hipótesis. La ejecución es la evidencia.** Un árbol de
> agentes que parece correcto, con las tools correctas y las descripciones
> correctas, es una afirmación sobre un sistema que todavía no corrió — y la falla
> que más probablemente esconde es un paso que tiene éxito sin contribuir.
