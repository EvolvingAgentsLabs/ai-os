# Los casos de validación

> **Especificación.** Ninguno está construido. Compañero de
> [`PLAN-PLATFORM.md`](PLAN-PLATFORM.md): ese documento dice qué construir y en
> qué orden; éste dice **sobre qué se valida cada etapa**, y cada caso es una
> pieza de trabajo real en vez de una demo.

## La regla que estos casos existen para satisfacer

De [05 · ai-storage](05-ai-storage.md), ganada por una medición que sacó
80% / 80% / 80%:

> **Ningún eje nuevo de memoria shippea sin un benchmark que el baseline pueda
> perder, nombrado antes de construir el eje.**

Una etapa sin caso acá no arranca. Donde todavía no existe un caso honesto, este
documento lo dice en vez de inventarlo — ése es el estado de A3 y de E.

## Por qué los casos salen del trabajo de este mismo repositorio

Tres de las cuatro etapas necesitan una tarea donde **la conducta correcta no se
pueda derivar de la tarea misma**. `05-ai-storage.md` estableció por qué, con
cuatro resultados nulos seguidos:

> Todos los instrumentos compartían una propiedad: la conducta correcta era
> derivable de la información que la tarea ya contenía. Donde la respuesta es
> derivable, una estrategia aprendida no agrega nada, porque el modelo
> simplemente la deriva.

La convención organizacional arbitraria es la fuente más limpia de información no
derivable que existe, y **este repositorio está lleno de ella, ya enforced por
código**. Eso vuelve a sus propias reglas de casa el fixture honesto más barato
disponible — y usarlas significa que el sistema se valida sobre trabajo real y no
sobre un escenario escrito para ser aprobado.

---

## Caso A1 — el cronómetro del escritorio, sobre un flow de COCLEA-SR

**Etapa:** Track A1. **Tipo:** aplicación real, medida.

**El material.** Un flow de [`projects/coclea-sr`](../../projects/coclea-sr) — el
workload que ya conduce este repositorio. No una demo sembrada: una corrida que
pasó porque el proyecto la necesitaba.

**Preparación.** El flow tiene que tener **tres días** al momento de medir y el
sujeto no tiene que haberlo corrido. Es el único ítem de todo el plan con reloj:
sembrarlo no se puede comprimir después, así que va primero.

**La tarea, sin cambios respecto de [04 · ai-ui](04-ai-ui.md):** contestar *cuál
es el estado, qué está bloqueado, qué produjo* — escritorio contra la
transcripción de `web-ui`.

**Se mide:** tiempo hasta una respuesta correcta, y corrección de la respuesta.
Las dos, no sólo el cronómetro — una respuesta equivocada más rápido no es una
victoria.

**Pasa si:** el escritorio es más rápido **y** la brecha se ensancha con la edad
del flow.

**Falla si:** el explorador plano empata. Entonces el canvas es decoración, M5 se
vuelve a argumentar en vez de pulirse, y A2 no arranca.

**Guardias.**
- `ai-flows/src/view.ts` es el arm de control. Es evidencia sólo mientras se
  mantenga inerte, y `test/view.test.ts:141` lo exige. **No mejorarlo para esto.**
- Dos sujetos son una señal sobre si el instrumento funciona, **no evidencia**.
  El reporte dice cuál de las dos cosas es.

---

## Caso C1 — el corrector sostiene las reglas de casa de este repositorio

**Etapa:** Track C, el experimento que licencia toda la escalera de memoria.
**Tipo:** aplicación real (un agente trabajando en este repo), oráculo exacto.

Es el caso del que depende todo el plan, y su fixture ya existe como código de
enforcement.

### Las tres reglas

Cada una es **arbitraria** (nada en el código la implica), **no derivable**
(ninguna cantidad de razonamiento sobre la tarea la produce) y **chequeable sin el
corrector** (CI o un test ya la deciden). Las tres son **[read]** de los archivos
nombrados.

| # | regla | enforced en | por qué no se puede derivar |
|---|---|---|---|
| 1 | Un cambio dentro de `ai-base/` tiene que quedar registrado en `ai-base/AI-OS-PATCHES.md` **en el mismo PR** | `.github/workflows/ci.yml:201` | Es una convención de resolución de conflictos de `git subtree`. Nada en el archivo cambiado la insinúa. |
| 2 | `ai-flows/src/view.ts` tiene que quedarse **inerte** — no se le puede agregar interacción | `ai-flows/test/view.test.ts:141` | La acción correcta es **la inacción**, y sólo porque el archivo es el arm de control de M5. A un agente al que le pidan mejorar un explorador le va a agregar interacción; ése es el movimiento *obvio*. |
| 3 | La cantidad de tests se chequea contra las suites | `scripts/check-test-count.sh`, `ci.yml:140` | Agregar tests es normalmente bueno sin ambigüedad. Acá rompe CI salvo que además se actualice un contador. |

**La regla 2 es el instrumento más fuerte de este documento.** Una regla cuya
conducta correcta es *no hacer lo obvio* no se puede satisfacer por una derivación
con suerte, ni por competencia general. Sólo se puede satisfacer sabiendo algo
sobre esta organización.

### El loop

1. Al agente se le da una tarea real que toca un archivo bajo `ai-base/`.
2. Intenta. CI falla.
3. El corrector enuncia la regla **en términos generales** — *"los cambios a
   archivos vendorizados tienen que quedar registrados en el log de parches de
   este repositorio"* — y **nunca el valor**: ni el archivo, ni el diff, ni la
   línea a agregar.
4. El pase en reposo destila la corrección en memoria.
5. **Se puntúa una instancia distinta más tarde**: otro archivo bajo `ai-base/`,
   en otra tarea, sin corrección presente.

### La condición de falsación, escrita antes de correr

> Si un agente que recibió la corrección no anda mejor en la **instancia
> posterior y distinta** que uno que no la recibió, entonces la información no
> derivable no sobrevive al pase de memoria, y **el Track B no tiene caso**.

Ese resultado se publica, y el Track B no arranca.

### Las tres formas en que este caso hace trampa, nombradas antes de que pueda

- **Si el mensaje del corrector contiene la respuesta, no se aprendió nada — se
  copió una pista.** La regla, nunca el valor.
- **Nunca puntuar un reintento de la instancia corregida.** Un reintento mide
  seguimiento de instrucciones a corto plazo, que no es la afirmación.
- **La regla tiene que ser chequeable sin el corrector**, o la evaluación es
  circular. Las tres de arriba las chequea CI, que es por lo que se eligieron.

### Un control que hay que correr sí o sí

Un arm donde al agente se le da la regla **en el prompt** en vez de por
corrección. Si promptear puntúa igual que recordar, el pase de memoria no fue lo
que transportó la información, y el resultado le pertenece al prompt.

---

## Caso B1 — el fixture del Reconciler que no existe

**Etapa:** Track B, una vez que C devolvió un número. **Tipo:** hechos reales de
la historia de esta organización, con la respuesta conocida por otra vía.

**Corregido el 2026-09-06.** `ai-storage` está construido — store, promoción,
procedencia, historia, ACLs, 119 tests — así que este caso ya no es "¿funciona la
escalera?". Apunta a lo único del componente que **tiene código y no tiene
fixture**:

> *Cuando dos notas dicen lo mismo, ¿cuál sobrevive?* El Reconciler contesta en
> código — `same` conserva la más vieja, `conflict` conserva las dos — y **ningún
> fixture lo probó.** **[read]**

Una rama sin fixture es una rama que nadie vio fallar. Eso la vuelve el ítem
incumplido más barato del componente y el lugar correcto para este caso.

### El material

Hechos reales de este workspace cuyo nivel correcto ya conocemos por otra vía —
incluido uno que **no** debe promoverse, que es el caso que caza la promoción
silenciosa.

| hecho | nivel correcto | por qué |
|---|---|---|
| la semilla y los parámetros de una corrida | **flow** — muere con ella | Nada posterior la necesita. Una escalera que promueve esto promueve todo. |
| *"el place code está falsificado — no re-derivarlo"* (COCLEA-SR) | **project**, y no más arriba | Es cierto de ese proyecto. Promovido a sistema se vuelve una creencia sobre trabajo que no describe. |
| *"Gemma 4 en ollama escribe su cadena en un campo `reasoning` aparte y devuelve `content` vacío por debajo de ~800 max tokens — presupuestar ≥ 900 y tratar el content vacío como error, nunca como default"* | **system** | Aprendido dentro de un proyecto, cierto para cada llamada a modelo de este despliegue. |

### Los dos casos de reconciliación, que son el punto

- **`same`** — el mismo hecho llega dos veces, redactado distinto, desde dos
  flows. Sobrevive el más viejo; la procedencia del nuevo se fusiona en él en vez
  de perderse.
- **`conflict`** — una nota posterior contradice a una anterior. **Sobreviven las
  dos**, y la contradicción se expone en vez de fusionarse. Ésta es la rama sin
  test, y es la que importa: un store que elige ganador en silencio es cómo una
  corrección y lo que corrigió se vuelven indistinguibles.

**Pasa si:** cada hecho aterriza en su nivel; el del medio **se queda** en nivel
proyecto a través de un pase de promoción; cada promoción lleva nivel de origen,
id de origen, actor, momento y razón; una degradación restaura el estado previo
en cada nivel tocado; y las dos ramas de reconciliación hacen lo que dice el
código.

**Falla si:** el hecho del medio llega a sistema, o si `conflict` conserva una
sola nota. Cualquiera de las dos vale más atención que todos los casos que pasan
— *la promoción silenciosa es cómo un parche de una sola vez se vuelve una
creencia organizacional.*

## Caso A2 — la promoción, apretada por alguien que no sabe git

**Etapa:** Track A2. **Tipo:** aplicación real, observada.

`ai-ui/src/memory.ts` ya dibuja la escalera estampada **NOT BUILT — THIS IS THE
SPEC**, y la instrucción de diseño es que *uno se entera de lo que necesita una
promoción tratando de apretar el botón*. Así que la validación es una persona
apretándolo.

**La tarea.** Dados los tres hechos del Caso B1 sentados en nivel flow, un sujeto
promueve lo que hay que promover y deja lo que no.

**Se mide:** si el sujeto promueve el hecho del medio. Si la interfaz vuelve fácil
el camino de sobre-promover, la interfaz está mal — no el sujeto.

**Pasa si:** el sujeto puede decir, sin ayuda, **de dónde salió una nota** y **por
qué fue promovida**, sólo desde la interfaz.

**Falla si:** el sujeto pregunta qué es un commit, una rama o un revert. **En esta
interfaz no aparece vocabulario de git en ningún lado** — la afirmación entera del
"backbone invisible" es que un abogado o un escritor nunca aprenden esas palabras.

---

## Caso A3 — la vertical editorial, sobre el único corpus grande que tenemos

**Etapa:** Track A3, último. **Tipo:** aplicación real.

**La posición honesta primero: no hay fixture legal ni médico.** Ni un expediente
de 500 páginas, ni un conjunto de protocolos clínicos. Conseguir uno es un costo
real con una pregunta real de privacidad encima, y fingir lo contrario es cómo una
vertical termina construida sobre un escenario. **Ésa es la razón por la que A3 va
último, no el cronograma.**

Lo que sí existe es un corpus documental grande, estructurado, gobernado por
convenciones y con corrección chequeable a máquina: **el `doc/` de este mismo
repositorio** — diecinueve documentos numerados, un espejo en español, un índice, y
reglas que ya están escritas.

| regla chequeable | de dónde sale |
|---|---|
| cada documento declara **Reference** o **Specification** en un banner bajo el título | `doc/README.md` |
| *"un documento que cambia de tipo tiene el banner reescrito el mismo día"* | `doc/README.md` |
| cada afirmación está marcada **[read]** o **[ran]**, o es citable a archivo y línea | `doc/README.md` |
| cada documento tiene espejo y entrada en el índice | la convención a la que está sujeto este archivo |

**La tarea:** el sistema mantiene ese corpus — escribe un documento nuevo, mantiene
el espejo en paridad, actualiza el índice, y reescribe un banner cuando una
especificación se vuelve referencia.

**Pasa si:** las cuatro reglas de arriba siguen valiendo después de un cambio que
el sistema hizo solo.

**Por qué esto no es un juguete:** tiene la misma forma que las verticales legal y
editorial — un corpus largo y estructurado, convenciones de casa arbitrarias, y una
corrección que si no un humano tendría que chequear leyendo. Si el sistema no puede
sostener este corpus, que puede leer entero y cuyas reglas están escritas, el
expediente de 500 páginas no es un blanco más cercano.

---

## Caso E1 — abierto, y deliberadamente sin llenar

**Etapa:** Track E, el bloque de escena. **Tipo:** ninguno todavía.

Por la regla vigente, un eje que no puede nombrar el benchmark que espera perder se
está asumiendo en vez de proponiendo. **Éste todavía no puede, y queda registrado
en vez de tapado.**

**Dos candidatos ya descalificados:**

- **Física.** Su brecha 0/24 → 12/12 está atribuida al sandbox, o sea a cómputo. Un
  tratamiento de representación apuntado ahí compite por un resultado ya explicado.
- **Todo lo de forma cerrada**, por la razón que comparten los cuatro nulos.

**Lo que el caso tiene que tener:** una falla **estructural y no computacional** —
el sistema produce algo bien formado y equivocado porque enmarcó mal el problema.
Esta organización tiene una instancia registrada exactamente de esa forma: una
hipótesis que se simuló, **se encontró apoyada en un modelo equivocado**, y se
reparó contra una condición pre-registrada
([18](18-from-a-hypothesis-to-a-therapeutic-surface.md)). Eso es un mal encuadre, no
un error de aritmética.

**El detector más cercano disponible** es `contribution.ts`, que ya marca los pasos
de un flow que no transportaron nada. Un corpus de flows bien formados que no
transportaron nada es lo más parecido a un conjunto de fallas estructurales que
este repositorio tiene.

**Cuando el caso se escriba, su condición de falsación queda fijada de antemano:**
si una sección `## Escena` obligatoria no le gana al mismo archivo de agente sin
ella, la sección se **borra, no se afloja**. Un chequeo que puede fallar mientras
la capacidad funciona está midiendo fraseo.

---

## Qué le permite afirmar cada etapa

| etapa | caso | afirmación que gana |
|---|---|---|
| A1 | flow de COCLEA-SR, cronómetro | el escritorio vale la pena |
| C1 | las reglas de casa de este repo | la información no derivable sobrevive un pase de memoria |
| B1 | las ramas sin test del Reconciler | la contradicción se expone, no se fusiona en silencio |
| A2 | una persona apretando promover | el backbone es genuinamente invisible |
| A3 | el corpus `doc/` de este repo | la vertical editorial sostiene un corpus real |
| E1 | *(sin escribir)* | nada, hasta que el caso exista |
