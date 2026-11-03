// Source language. Every key added here needs its translation in en.ts
// (the compiler and a test both enforce it).
export const es = {
  "site.title": "nixchecker · Validador de archivos Nix",
  "site.description":
    "Pega tu flake.nix o configuración de Nix y valídala contra la documentación oficial de NixOS, Home Manager, disko y flakes. No oficial y de código abierto.",
  "nav.language": "EN",
  "nav.languageLabel": "Cambiar a inglés",
  "nav.source": "Código fuente",
  "nav.main": "Navegación principal",

  "hero.eyebrow": "Análisis estático, sin enviar nada",
  "hero.subtitle":
    "Pega tu flake.nix o tu configuración y comprueba cada opción contra la documentación oficial de NixOS, Home Manager, disko y flakes.",

  "checker.label": "Tu archivo Nix",
  "checker.placeholder": "{ config, pkgs, ... }:\n{\n  services.openssh.enable = true;\n}",
  "checker.target": "Objetivo",
  "checker.version": "Versión",
  "checker.versionHint": "Versión de NixOS y de Home Manager contra la que se valida",
  "checker.validate": "Validar",
  "checker.example": "Cargar ejemplo",
  "checker.clear": "Limpiar",
  "checker.open": "Abrir archivo",
  "checker.export": "Descargar informe",
  "checker.remember": "Recordar mi texto en este dispositivo",
  "checker.privacy": "Todo se valida en tu navegador. Tu código no se envía a ningún servidor.",

  "target.auto": "Detectar automáticamente",
  "target.nixos": "NixOS",
  "target.home-manager": "Home Manager",
  "target.disko": "disko",
  "target.flake": "Flake",

  "result.empty": "Pega algo de Nix para empezar.",
  "result.ok":
    "No se detectaron problemas estáticos en las partes analizables. Los valores dinámicos, las funciones y los conjuntos rec no se evalúan: esto no garantiza que la configuración funcione.",
  "result.summary": "{errors} errores · {warnings} avisos",
  "result.detected": "Objetivo: {target}",
  "result.catalog": "Catálogo: {source}",
  "result.coverage": "{checked} de {total} asignaciones comprobadas",
  "coverage.dynamic": "{n} con valor dinámico",
  "coverage.any": "{n} de tipo libre",
  "coverage.hidden": "{n} en una opción oculta",
  "coverage.interpolated": "{n} con texto interpolado",
  "coverage.free-form": "{n} en una opción de forma libre",
  "result.fileTooBig": "Ese archivo pesa demasiado (máximo {max} KB).",
  "result.fileError": "No se pudo leer el archivo.",
  "result.loadError": "No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.",
  "result.line": "Línea {line}, columna {col}",
  "result.suggest": "¿Quisiste decir {suggestion}?",
  "result.docs": "Documentación oficial",
  "result.available": "Opciones disponibles: {options}",
  "result.apply": "Aplicar corrección",
  "result.applyAll": "Aplicar todas las correcciones",
  "result.goto": "Ir a la línea",

  "diag.syntax-unbalanced": "El carácter «{char}» no tiene pareja.",
  "diag.syntax-expected": "Se esperaba «{expected}», pero aparece «{found}».",
  "diag.syntax-expected-eof": "Se esperaba «{expected}», pero el archivo termina.",
  "diag.syntax-unexpected": "No se esperaba «{found}» aquí.",
  "diag.syntax-unexpected-eof": "El archivo termina antes de completar la expresión.",
  "diag.syntax-unclosed": "«{char}» se abre aquí pero nunca se cierra.",
  "diag.syntax-unterminated-string": "Cadena de texto sin cerrar.",
  "diag.syntax-unterminated-comment": "Comentario /* ... */ sin cerrar.",
  "diag.syntax-incomplete": "«{path}» no tiene «= valor;»: la asignación está incompleta.",
  "diag.syntax-unterminated": "Falta el «;» al final de la asignación de «{path}».",
  "diag.not-callable-list":
    "«{name}» es una lista y no se puede llamar como una función. ¿Falta un operador, como «++»?",
  "diag.not-callable-string":
    "«{name}» es una cadena de texto y no se puede llamar como una función. ¿Falta un operador, como «+»?",
  "diag.not-callable-number":
    "«{name}» es un número y no se puede llamar como una función. ¿Falta un operador?",
  "diag.list-plus": "«{name}» es una lista: para unir listas se usa «++», no «+».",
  "diag.concat-non-list": "«++» solo une listas, y «{name}» no es una lista.",
  "diag.undefined-variable":
    "«{name}» no está definido: no es un argumento ni se declara en el archivo. ¿Faltan comillas o un valor?",
  "diag.nothing-to-check":
    "No se ha encontrado ningún conjunto de atributos { ... } que revisar, así que no se ha comprobado nada. Pon las opciones dentro de llaves.",
  "diag.unknown-option": "La opción «{path}» no existe en la documentación.",
  "diag.type-mismatch": "«{path}» espera {expected}, pero recibe {got}.",
  "diag.deprecated": "«{path}» está obsoleta: usa «{replacement}».",
  "diag.hidden-option":
    "«{path}» no aparece en la documentación: puede estar obsoleta, renombrada o ser interna.",

  "features.title": "Un análisis, no una evaluación.",
  "features.docs.title": "Contra la documentación oficial",
  "features.docs.body":
    "Las opciones se comprueban con los catálogos de NixOS, Home Manager, disko y el formato de flakes.",
  "features.local.title": "Privado por diseño",
  "features.local.body":
    "El análisis corre en tu navegador. No subimos tu configuración ni guardamos nada.",
  "features.hints.title": "Pistas, no solo errores",
  "features.hints.body":
    "Sugerimos la opción correcta, avisamos de las renombradas y enlazamos la documentación.",

  "footer.unofficial":
    "Proyecto no oficial: no está afiliado ni respaldado por la Fundación NixOS, Home Manager ni disko.",
  "footer.ai": "Hecho con ayuda de IA. Revisa siempre los resultados antes de aplicar cambios.",
  "footer.license": "Software libre bajo GPL v3.0 o posterior.",

  "nav.validator": "Validador",
  "nav.how": "Cómo funciona",
  "nav.cta": "Validar ahora",
  "bar.label": "Aviso",
  "bar.unofficial":
    "Herramienta no oficial: no está afiliada, respaldada ni mantenida por el proyecto NixOS, Home Manager ni disko.",
  "hero.titleA": "Valida tu Nix.",
  "hero.titleB": "Antes de reconstruir.",
  "hero.cta": "Empezar a validar",
  "hero.note1": "100 % en tu navegador",
  "hero.note2": "Sin cuentas ni servidor",
  "hero.note3": "NixOS · Home Manager · disko · flakes",
  "validator.kicker": "Validador",
  "validator.title": "Pega tu Nix. Revisa cada línea.",
  "validator.lead": "Los resultados aparecen aquí mismo. Nada se envía a ningún sitio.",
  "features.kicker": "Simple por diseño",
  "features.lead": "El mismo archivo da siempre los mismos resultados.",
  "cta.kicker": "Tu configuración, revisada",
  "cta.title1": "Menos errores.",
  "cta.title2": "Más reconstruir.",
  "cta.button": "Validar mi Nix",
  "footer.tagline": "Hecho para la comunidad Nix. Tu código nunca sale del navegador.",
} as const;

export type MessageKey = keyof typeof es;
