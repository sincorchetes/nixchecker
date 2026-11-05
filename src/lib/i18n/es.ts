// Source language. Every key added here needs its translation in en.ts
// (the compiler and a test both enforce it).
export const es = {
  "site.title": "nixchecker · Validador de archivos Nix",
  "site.description":
    "Pega tu flake.nix o configuración de Nix y valídala contra la documentación oficial de NixOS, Home Manager, nix-darwin, disko y flakes. No oficial y de código abierto.",
  "nav.language": "EN",
  "nav.languageLabel": "Cambiar a inglés",
  "nav.source": "Código fuente",
  "nav.main": "Navegación principal",
  "nav.themeLight": "Modo claro",
  "nav.themeDark": "Modo oscuro",

  "hero.title": "Valida tu configuración de Nix antes de reconstruir.",
  "hero.subtitle":
    "Pega tu flake.nix o tu configuración y comprueba cada opción contra la documentación oficial de NixOS, Home Manager, nix-darwin, disko y flakes.",

  "checker.label": "Tu archivo Nix",
  "checker.placeholder": "{ config, pkgs, ... }:\n{\n  services.openssh.enable = true;\n}",
  "checker.target": "Objetivo",
  "checker.version": "Versión",
  "checker.versionHint": "Versión de NixOS, Home Manager y nix-darwin contra la que se valida",
  "checker.system": "Sistema",
  "checker.systemHint":
    "Sistema para el que se construye la configuración; las opciones son las mismas en todos",
  "checker.validate": "Validar",
  "checker.example": "Cargar ejemplo",
  "checker.clear": "Limpiar",
  "checker.open": "Abrir archivo",
  "checker.export": "Descargar informe",
  "checker.remember": "Guardar el borrador en este dispositivo",
  "checker.privacy": "Todo se valida en tu navegador. Tu código no se envía a ningún servidor.",

  "target.auto": "Detectar automáticamente",
  "target.nixos": "NixOS",
  "target.home-manager": "Home Manager",
  "target.nix-darwin": "nix-darwin",
  "target.nix-conf": "nix.conf",
  "target.disko": "disko",
  "target.flake": "Flake",

  "result.empty": "Pega algo de Nix para empezar.",
  "result.ok":
    "No se detectaron problemas estáticos en las partes analizables. Los valores dinámicos, las funciones y los conjuntos rec no se evalúan: esto no garantiza que la configuración funcione.",
  "result.clean": "Sin problemas",
  "result.validating": "Validando…",
  "result.previous": "Resultado anterior",
  "result.failed": "No se pudo validar",
  "result.viewLabel": "Vista",
  "result.viewEditor": "Editor",
  "result.viewProblems": "Problemas",
  "result.viewProblemsN": "Problemas ({n})",
  "result.details": "Detalles",
  "checker.replaced": "Se ha sustituido el texto.",
  "checker.undo": "Deshacer",
  "result.divider": "Ancho del panel de resultados",
  "result.example": "Ejemplo de diagnóstico:",
  "result.error": "error",
  "result.warning": "aviso",
  "result.errorCount.one": "{n} error",
  "result.errorCount.many": "{n} errores",
  "result.warningCount.one": "{n} aviso",
  "result.warningCount.many": "{n} avisos",
  "result.and": " y ",
  "result.detected": "Objetivo: {target}",
  "result.catalog": "Catálogo: {source}",
  "result.command":
    "La misma comprobación con el sistema de módulos real de tu Nix (imports, mkIf y aserciones), en tu máquina:",
  "result.coverage": "{checked} de {total} asignaciones comprobadas",
  "coverage.dynamic": "{n} con valor dinámico",
  "coverage.any": "{n} de tipo libre",
  "coverage.hidden": "{n} en una opción oculta",
  "coverage.interpolated": "{n} con texto interpolado",
  "coverage.free-form": "{n} en una opción de forma libre",
  "coverage.declared": "{n} de una opción declarada en este archivo",
  "result.fileTooBig": "Ese archivo pesa demasiado (máximo {max} KB).",
  "result.fileError": "No se pudo leer el archivo.",
  "result.loadError": "No se pudo cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.",
  "result.internalError":
    "Ocurrió un error interno al validar. Es un fallo de nixchecker, no de tu archivo: si se repite, abre una incidencia.",
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
  "diag.not-a-module":
    "Este archivo no parece un módulo: ninguna de sus claves es una opción de este tipo de archivo, así que no se ha comprobado nada. Puede ser una biblioteca, un paquete o un overlay, o contener únicamente opciones declaradas por tus propios módulos.",
  "diag.conf-bad-line":
    "Esta línea no es un ajuste: nix.conf espera «nombre = valor», con espacios alrededor del «=». Leído: «{text}».",
  "diag.unknown-option": "La opción «{path}» no existe en la documentación.",
  "diag.type-mismatch": "«{path}» espera {expected}, pero recibe {got}.",
  "diag.deprecated": "«{path}» está obsoleta: usa «{replacement}».",
  "diag.hidden-option":
    "«{path}» no aparece en la documentación: puede estar obsoleta, renombrada o ser interna.",

  "features.title": "Un análisis, no una evaluación.",
  "features.docs.title": "Contra la documentación oficial",
  "features.docs.body":
    "Las opciones se comprueban con los catálogos de NixOS, Home Manager, nix-darwin, disko y el formato de flakes.",
  "features.local.title": "Privado por diseño",
  "features.local.body":
    "El análisis corre en tu navegador. No subimos tu configuración ni guardamos nada.",
  "features.hints.title": "Pistas, no solo errores",
  "features.hints.body":
    "Sugerimos la opción correcta, avisamos cuando una opción ha cambiado de nombre y enlazamos con la documentación.",

  "footer.unofficial":
    "Proyecto no oficial: no está afiliado ni respaldado por la Fundación NixOS, Home Manager, nix-darwin ni disko.",
  "footer.ai": "Hecho con ayuda de IA. Revisa siempre los resultados antes de aplicar cambios.",
  "footer.license": "Software libre bajo GPL v3.0 o posterior.",

  "nav.how": "Cómo funciona",
  "bar.label": "Aviso",
  "bar.unofficial":
    "Herramienta no oficial: no está afiliada, respaldada ni mantenida por el proyecto NixOS, Home Manager, nix-darwin ni disko.",
  "features.lead": "El mismo archivo da siempre los mismos resultados.",
  "footer.tagline": "Hecho para la comunidad Nix. Tu código nunca sale del navegador.",
} as const;

export type MessageKey = keyof typeof es;
