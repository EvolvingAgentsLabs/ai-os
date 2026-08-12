<img src="doc/assets/icon.png" alt="" width="76" align="left" hspace="14">

# ai-os

**Un sistema operativo de agentes**, construido sobre [QM](https://github.com/yc-software/qm).

El trabajo sobrevive a la conversación. Los agentes y sus subagentes son archivos
markdown en la carpeta del propio proyecto. La interfaz es un escritorio que
acomodás, no un log de chat. Y toda afirmación sobre si eso ayuda tiene una
medición atrás — incluidas las que volvieron diciendo que no.

### → **[evolvingagentslabs.github.io](https://evolvingagentslabs.github.io/)** — qué es, y un escritorio que podés usar en el navegador

<a href="https://evolvingagentslabs.github.io/demo/"><img src="doc/assets/manual/09-desk.jpg" alt="El escritorio: flows como documentos, agentes como cubitos apilados encima" width="100%"></a>

<sub><b><a href="https://evolvingagentslabs.github.io/demo/">Probá el escritorio →</a></b> La interfaz real con un backend simulado. Sin instalar nada, sin gastar nada.</sub>

## Correrlo

Tres procesos. El [**manual**](doc/es/manual.md) tiene la secuencia completa con
capturas; la versión corta:

```bash
cd ai-base  && npm ci && node --env-file=.env src/index.ts   # core        :8080
cd ai-flows && node --env-file=../ai-base/.env scripts/serve.ts  # flows   :8097
cd ai-ui    && node scripts/serve.ts                         # escritorio  :8098
```

## Documentación

| | |
|---|---|
| [**Manual**](doc/es/manual.md) | Cómo correrlo, gesto por gesto, con capturas de una instancia viva |
| [**Especificaciones**](doc/es/) | Un documento por pilar y por problema. Son las specs que el código sigue |
| [**Decisiones**](doc/adr/) | Un archivo por decisión de arquitectura, reemplazada y nunca editada |
| [**Próximo**](NEXT.md) | Qué sigue, y cómo volver a levantar el stack |

## Estado

`ai-base`, `ai-flows` y `ai-ui` corren — **462 tests propios**, arriba de los
3.768 que `ai-base` trae de upstream. `ai-storage` está especificado y no
construido.

Nada en este repositorio describe software que exista salvo que lo diga, y toda
captura es de una instancia viva.

## Distribución

| | | |
|---|---|---|
| [`ai-base/`](ai-base/) | QM, vendorizado como subtree y traído semanalmente | MIT, de upstream |
| [`ai-flows/`](ai-flows/) | Flows, composición y el instrumental de medición | Apache 2.0 |
| [`ai-ui/`](ai-ui/) | El escritorio | Apache 2.0 |
| `ai-storage/` | No construido | — |

`ai-base/` queda byte a byte igual a upstream. Cualquier cambio ahí necesita una
línea en [`ai-base/AI-OS-PATCHES.md`](ai-base/AI-OS-PATCHES.md), y CI lo exige.
Términos completos: [licencias](doc/es/06-licensing.md).

## Idiomas

El inglés es canónico. Cada documento tiene su espejo en español en
[`doc/es/`](doc/es/); cuando difieren, el correcto es el inglés.

---

El proyecto principal de [Evolving Agents Lab](https://github.com/EvolvingAgentsLabs).
Todo lo demás en la organización está congelado — [por qué](doc/es/07-freeze-policy.md).
