/**
 * Carga de prompts versionados (PROMPT_MAESTRO 6.8 y 6.14). Solo servidor.
 *
 * cargarPrompt('normalizador') lee la versión activa en /prompts/versiones.json,
 * carga /prompts/normalizador_{versión}.md y devuelve { texto, version }.
 * Si el archivo no existe falla con "IA no configurada": nunca hay un prompt
 * de respaldo escrito en el código (regla 14).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { MENSAJE_IA_NO_CONFIGURADA, type ErrorIA } from './cliente';

export const AGENTES = ['normalizador', 'coherencia', 'pronostico'] as const;
export type Agente = (typeof AGENTES)[number];

export interface PromptCargado {
  /** Texto del prompt de sistema, sin el encabezado de versión. */
  texto: string;
  /** Versión del archivo, p. ej. "v2". */
  version: string;
  /** Identificador que se guarda en uso_ia, p. ej. "normalizador_v2". */
  versionPrompt: string;
}

export type ResultadoPrompt = { ok: true; prompt: PromptCargado } | { ok: false; error: ErrorIA };

export interface OpcionesPrompt {
  /** Carpeta de prompts (por defecto, /prompts en la raíz del proyecto). */
  directorio?: string;
  /** Fuerza una versión (lo usa el golden set: --version v1). */
  version?: string;
}

const PATRON_VERSION = /^v\d+$/;
const esquemaVersiones = z.object({
  normalizador: z.string().regex(PATRON_VERSION),
  coherencia: z.string().regex(PATRON_VERSION),
  pronostico: z.string().regex(PATRON_VERSION),
});

export function directorioPrompts(): string {
  return path.join(process.cwd(), 'prompts');
}

/** Quita el encabezado de tres líneas (<!-- versión / fecha / cambios -->). */
export function quitarEncabezado(contenido: string): string {
  return contenido.replace(/^(\s*<!--[\s\S]*?-->\s*\n)+/, '').trim();
}

function noConfigurada(detalle: string): ResultadoPrompt {
  return { ok: false, error: { tipo: 'no_configurada', detalle: `${MENSAJE_IA_NO_CONFIGURADA}: ${detalle}` } };
}

export async function cargarPrompt(agente: Agente, opciones: OpcionesPrompt = {}): Promise<ResultadoPrompt> {
  const directorio = opciones.directorio ?? directorioPrompts();

  let version = opciones.version;
  if (version === undefined) {
    try {
      const versiones = esquemaVersiones.parse(JSON.parse(await readFile(path.join(directorio, 'versiones.json'), 'utf8')));
      version = versiones[agente];
    } catch {
      return noConfigurada('versiones.json no existe o no es válido');
    }
  }
  // Solo "v" + número: evita que una versión arme una ruta fuera de /prompts.
  if (!PATRON_VERSION.test(version)) return noConfigurada(`versión inválida «${version}»`);

  const versionPrompt = `${agente}_${version}`;
  try {
    const texto = quitarEncabezado(await readFile(path.join(directorio, `${versionPrompt}.md`), 'utf8'));
    if (texto === '') return noConfigurada(`${versionPrompt}.md está vacío`);
    return { ok: true, prompt: { texto, version, versionPrompt } };
  } catch {
    return noConfigurada(`no existe ${versionPrompt}.md`);
  }
}
