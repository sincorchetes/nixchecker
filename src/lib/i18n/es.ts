// Source language. Every key added here needs its translation in en.ts
// (the compiler and a test both enforce it).
export const es = {
  "site.title": "nixchecker · Validador de archivos Nix",
  "site.description":
    "Pega tu flake.nix o configuración de Nix y valídala contra la documentación oficial de NixOS, Home Manager, disko y flakes. No oficial y de código abierto.",
  "nav.language": "English",
  "nav.languageLabel": "Cambiar a inglés",
  "nav.source": "Código fuente",

  "hero.eyebrow": "Proyecto no oficial · Código abierto",
  "hero.title": "Valida tu Nix antes de reconstruir.",
  "hero.subtitle":
    "Pega tu flake.nix o tu configuración y comprueba cada opción contra la documentación oficial de NixOS, Home Manager, disko y flakes.",
  "hero.unofficial":
    "nixchecker no es un proyecto oficial y no está afiliado a la Fundación NixOS, Home Manager ni disko.",

  "checker.label": "Tu archivo Nix",
  "checker.placeholder": "{ config, pkgs, ... }:\n{\n  services.openssh.enable = true;\n}",
  "checker.target": "Objetivo",
  "checker.version": "Versión",
  "checker.versionHint": "Versión de NixOS y de Home Manager contra la que se valida",
  "checker.validate": "Validar",
  "checker.example": "Cargar ejemplo",
  "checker.clear": "Limpiar",
  "checker.privacy": "Todo se valida en tu navegador. Tu código no se envía a ningún servidor.",

  "target.auto": "Detectar automáticamente",
  "target.nixos": "NixOS",
  "target.home-manager": "Home Manager",
  "target.disko": "disko",
  "target.flake": "Flake",

  "result.empty": "Pega algo de Nix para empezar.",
  "result.ok": "Sin problemas. Todo coincide con la documentación conocida.",
  "result.summary": "{errors} errores · {warnings} avisos",
  "result.detected": "Objetivo: {target}",
  "result.catalog": "Catálogo: {source}",
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
  "diag.undefined-variable":
    "«{name}» no está definido: no es un argumento ni se declara en el archivo. ¿Faltan comillas o un valor?",
  "diag.nothing-to-check":
    "No se ha encontrado ningún conjunto de atributos { ... } que revisar, así que no se ha comprobado nada. Pon las opciones dentro de llaves.",
  "diag.unknown-option": "La opción «{path}» no existe en la documentación.",
  "diag.type-mismatch": "«{path}» espera {expected}, pero recibe {got}.",
  "diag.deprecated": "«{path}» está obsoleta: usa «{replacement}».",
  "diag.hidden-option":
    "«{path}» no aparece en la documentación: puede estar obsoleta, renombrada o ser interna.",

  "features.title": "Hecho para el día a día con Nix",
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
} as const;

export type MessageKey = keyof typeof es;
