# 06 · Licenciamiento

<img src="../assets/06-licensing.jpg" alt="" width="100%">

<sub>Apache sobre MIT, y qué permite la intersección.</sub>


> **El inglés es canónico.** Traducción de [`doc/06-licensing.md`](../06-licensing.md).
>
> No es asesoramiento legal. Es un documento de ingeniería que registra qué
> hicimos y por qué. Si ai-os alguna vez se comercializa o recibe contribuciones
> de terceros, que un abogado lea esta página.

## La pregunta

¿Puede ai-os ser Apache 2.0 si QM es MIT?

**Sí.** Verificado en la fuente en vez de asumido:

```
$ curl -s https://api.github.com/repos/yc-software/qm | jq .license.spdx_id
"MIT"

$ head -3 ai-base/LICENSE
MIT License

Copyright (c) 2026 QM contributors
```

La licencia MIT concede, con sus propias palabras, el derecho *"to deal in the
Software without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, **sublicense**, and/or sell copies"*.

**`sublicense` es la palabra operativa.** Es lo que permite redistribuir una obra
derivada o combinada bajo términos distintos, incluido Apache 2.0. Es rutinario y
no es una zona gris.

## Qué NO podemos hacer

Tres límites, porque el "sí" no es incondicional:

**1. No podemos des-MIT-ear el código de upstream.** Relicenciar hacia adelante no
revoca nada. Quien obtenga QM desde `yc-software/qm` lo recibe bajo MIT sin
importar lo que diga este repositorio. Lo que Apache 2.0 cubre es *nuestro*
trabajo y el conjunto combinado — no la distribución propia del upstream.

**2. La atribución es obligatoria, no cortesía.** MIT: *"The above copyright
notice and this permission notice **shall** be included in all copies or
substantial portions of the Software."* Borrar `ai-base/LICENSE`, o publicar un
build de código de `ai-base` sin ese aviso, es una violación de licencia. Es lo
único acá que además es fácil de hacer mal.

**3. Apache 2.0 no concede derechos de marca (§6), y MIT tampoco.** "QM" es el
nombre de yc-software. No lo usamos para nada nuestro, y no insinuamos aval ni
afiliación — están vinculados a YC, lo que hace que la asociación implícita sea
peor que simplemente inexacta.

## Qué hicimos

| Ruta | Licencia | Por qué |
|---|---|---|
| `/LICENSE` | Apache 2.0 | El repositorio y todo el código propio |
| `/NOTICE` | — | Atribución de Apache §4(d), nombrando a QM y sus términos MIT |
| `ai-base/LICENSE` | MIT, **textual, sin modificar** | El aviso de upstream, conservado como exige MIT |
| `ai-base/**` (incl. nuestras ediciones) | MIT | Ver abajo |
| `doc/`, `ai-flows/`, `ai-ui/`, `ai-storage/` | Apache 2.0 | Propio |

### Por qué nuestras modificaciones dentro de `ai-base/` siguen siendo MIT

Podríamos licenciar nuestros cambios a `ai-base` bajo Apache 2.0 — legalmente
válido, ya que son obra nuestra. Deliberadamente no lo hacemos, por una razón
práctica:

**Poder mandarlo upstream.** Un parche que queramos enviar a QM tiene que ser
contribuible bajo *su* licencia. Si nuestras ediciones de `ai-base` fueran Apache
2.0, cada contribución upstream necesitaría un relicenciamiento por parche, y en
la práctica esa fricción significa que el parche nunca se manda. Mantener
`ai-base/` uniformemente MIT deja la puerta abierta en ambas direcciones.

Es además el incentivo honesto: nos beneficia que upstream siga moviéndose.
Hacer difícil devolver es un mal negocio para un fork que piensa traer cambios
todas las semanas.

### Por qué Apache 2.0 para todo lo demás

Tres propiedades que MIT no tiene:

1. **Concesión de patentes (§3).** Los contribuyentes conceden licencia de
   patentes, que se termina si demandan por el software. MIT no dice nada sobre
   patentes. Para un proyecto a nivel de SO esto importa más de lo habitual.
2. **Cláusula explícita de marca (§6).** Elimina una ambigüedad que si no habría
   que responder a mano.
3. **Avisos de cambio (§4(b)).** Los archivos modificados llevan una declaración
   de cambio, que es exactamente la disciplina que un fork vendorizado necesita de
   todos modos.

Notar la asimetría: la concesión de patentes de Apache cubre **nuestras**
contribuciones. **No** le agrega retroactivamente una concesión de patentes al
código MIT de QM. Quien dependa de `ai-base` depende del silencio de MIT ahí, igual
que si lo tomara de upstream.

## Reglas prácticas

**Para cada archivo agregado bajo `ai-base/`:** es MIT. Agregar el encabezado SPDX
`// SPDX-License-Identifier: MIT`.

**Para cada archivo agregado en cualquier otro lado:** es Apache 2.0. Agregar
`// SPDX-License-Identifier: Apache-2.0`.

**Para cada archivo modificado bajo `ai-base/`:** agregar una línea a
`ai-base/AI-OS-PATCHES.md` — qué, por qué, upstreamable sí/no. Eso satisface el
espíritu de Apache §4(b), y más importante, es la lista que vas a necesitar cuando
un `git subtree pull` genere conflicto.

**Nunca:** borrar ni editar `ai-base/LICENSE`; mover código derivado de MIT fuera
de `ai-base/` hacia un directorio Apache sin llevar el aviso MIT con él; llamar
"QM" a nada; insinuar afiliación con yc-software o Y Combinator.

## Dependencias

QM no vendoriza sus dependencias npm, así que no hay licencias de terceros
mezcladas en el código de este repositorio. Sus licencias importan al momento de
*distribuir*, no para la licencia del repositorio.

Una a tener presente, por lo inusual en este stack: `ai-base/plugins/web-ui`
depende de `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai` y
`@earendil-works/pi-web-ui`. Si ai-os alguna vez distribuye artefactos compilados
en vez de código fuente, **auditar entonces el árbol completo de dependencias** —
ese es el momento en que la pregunta se vuelve real, y hasta entonces está fuera
de alcance.

## Si alguna vez queremos dejar de ser un fork

Dos salidas, registradas ahora para que nadie las vuelva a derivar después:

**Convertirse en un deployment.** El camino de extensión previsto por QM: un
repositorio de deployment que depende de `@yc-software/qm`, con los sustratos
cableados en un archivo. Es Apache-sobre-MIT limpio, sin nada de código
vendorizado. Viable si — y sólo si — nuestras modificaciones al core se reducen a
cero. Seguido en [ADR-0001](adr/0001-fork-vs-dependency.md).

**Mandar la divergencia upstream.** Si `ai-flows` resulta pertenecer a QM y ellos
lo quieren, la razón de existir del fork se evapora en gran parte. Es un buen
desenlace, no un fracaso.
