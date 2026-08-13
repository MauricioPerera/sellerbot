---
type: 'Task Contract'
title: 'Versionado de la plantilla: coherencia CHANGELOG/README/upgrade'
description: 'Test de coherencia que fija el versionado de la plantilla: CHANGELOG semver, mencion en README y nodo de upgrade enlazado desde el index.'
tags: ['versionado', 'changelog', 'upgrade', 'coherencia', 'tooling']

task: versioning-plantilla
intent: "Fijar por test la coherencia del versionado de la plantilla."
target: tests/test_versioning.py
signature: "def test_changelog_first_entry_is_semver(self) -> None:"
test_command: "python -m unittest tests/test_versioning.py"
budget:
  cyclomatic_max: 5
  nesting_max: 3
tests: "tests/test_versioning.py"
tests_sha256: "7b474e9cd236b3aaef09580ab416aa04fc3f4d75b59c87a0e545738fc79c4155"
touch_only: ['tests/test_versioning.py']
deps_allowed: []
forbids: ['network', 'subprocess']
---

# Contract: versioning-plantilla

## Intent
Que la plantilla tenga versión y quien la instanció pueda traer mejoras: CHANGELOG con
semver, README que lo anuncia (EN/ES) y la historia de upgrade como nodo OKF. El test de
coherencia (target de este contrato) fija doc↔doc, patrón de
[agents-context-rule](./agents-context-rule.md). Spec:
`specs/CONTRACT-14-versionado-plantilla.md`; proceso: [metodología de
ejecución](../metodologia-ejecucion.md).

## Interface
```python
class TestVersioning(unittest.TestCase):
    def test_changelog_first_entry_is_semver(self) -> None: ...
    def test_readme_mentions_changelog(self) -> None: ...
    def test_upgrade_node_exists_and_indexed(self) -> None: ...
```
La "implementación" incluye los artefactos que el test fija: `CHANGELOG.md`,
`knowledge/plantilla-upgrade.md`, el enlace en `index.md` y la subsección del README.

## Invariants
- El test lee archivos con `pathlib`/`open` (UTF-8); sin red, sin subprocess, sin mocks.
- `CHANGELOG.md` existe y su primera entrada `## v` matchea `\d+\.\d+\.\d+`.
- README menciona `CHANGELOG.md` al menos una vez (sin exigir una estructura bilingue
  particular: un proyecto instanciado puede reescribir su README para describir su propio
  producto en lugar de la metodologia, y sigue siendo coherente mientras apunte al
  CHANGELOG).
- `knowledge/plantilla-upgrade.md` existe y `knowledge/index.md` lo enlaza.
- Mensajes de aserción que nombran QUÉ falta y EN QUÉ archivo.
- Borrar la entrada semver del CHANGELOG o el enlace del index pone el test en rojo.

## Examples
- Repo tras la tarea: `python -m unittest tests/test_versioning.py` -> OK (3+ tests).
- Mutación: quitar toda mención de `CHANGELOG.md` del README -> el test falla nombrando
  el README.

## Do / Don't
- DO: regex simple para semver.
- DO: historia retroactiva del CHANGELOG destilada de `docs/reports/` (rastreable).
- DON'T: red, subprocess, editar specs/reportes históricos, crear tags (los crea el PM).
- DON'T: asumir una estructura bilingue EN/ES fija del README — un proyecto instanciado
  puede tener un README de un solo idioma describiendo su propio producto.

## Tests
(Los tests están en `tests/test_versioning.py` — el target de este contrato. El dev
reemplaza el stub sellado y re-sella `tests_sha256` aquí al terminar.)

## Constraints
- PARAR y reportar si... la coherencia exigiera editar `tests/test_init_project.py`,
  `scripts/init_project.py` o estructura del index más allá del enlace nuevo.
