/**
 * Exporta docs/FICHA_NEGOCIO.md a docs/FICHA_NEGOCIO.pdf (A4) con el Chromium de Playwright
 * y verifica que el PDF tenga exactamente 1 página (Fase 10, condición a).
 *
 *   npm run ficha:pdf
 *
 * Convierte solo el subconjunto de Markdown que usa la ficha: títulos, párrafos, listas,
 * tablas, **negrita**, `código` y enlaces.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import { extractText, getDocumentProxy } from 'unpdf';

const ENTRADA = 'docs/FICHA_NEGOCIO.md';
const SALIDA = 'docs/FICHA_NEGOCIO.pdf';

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(texto: string): string {
  return esc(texto)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s(])(https?:\/\/[^\s)<]+)/g, '$1<a href="$2">$2</a>');
}

function celdas(linea: string): string[] {
  return linea.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function aHtml(markdown: string): string {
  const lineas = markdown.split(/\r?\n/);
  const html: string[] = [];
  let i = 0;
  while (i < lineas.length) {
    const linea = lineas[i]!;
    if (linea.trim() === '') { i++; continue; }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linea);
    if (titulo) { html.push(`<h${titulo[1]!.length}>${inline(titulo[2]!)}</h${titulo[1]!.length}>`); i++; continue; }
    if (linea.trim().startsWith('|')) {
      const filas: string[] = [];
      while (i < lineas.length && lineas[i]!.trim().startsWith('|')) filas.push(lineas[i++]!);
      const [cabecera, , ...cuerpo] = filas;
      html.push(
        `<table><thead><tr>${celdas(cabecera!).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>` +
          cuerpo.map((f) => `<tr>${celdas(f).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>',
      );
      continue;
    }
    if (/^-\s+/.test(linea)) {
      const items: string[] = [];
      while (i < lineas.length && /^-\s+/.test(lineas[i]!)) items.push(lineas[i++]!.replace(/^-\s+/, ''));
      html.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`);
      continue;
    }
    const parrafo: string[] = [];
    while (i < lineas.length && lineas[i]!.trim() !== '' && !/^(#{1,3}\s|\||-\s)/.test(lineas[i]!)) parrafo.push(lineas[i++]!);
    html.push(`<p>${inline(parrafo.join(' '))}</p>`);
  }
  return html.join('\n');
}

const CSS = `
  @page { size: A4; margin: 11mm 13mm; }
  body { font-family: "Segoe UI", Arial, sans-serif; font-size: 10pt; line-height: 1.36; color: #1a1a1a; margin: 0; }
  h1 { font-size: 17.5pt; margin: 0 0 4px; color: #0b3d66; }
  h2 { font-size: 11.8pt; margin: 11px 0 4px; color: #0b3d66; border-bottom: 1px solid #c9d6e2; padding-bottom: 2px; }
  p { margin: 3px 0; } ul { margin: 3px 0; padding-left: 17px; } li { margin: 2px 0; }
  table { border-collapse: collapse; width: 100%; margin: 4px 0; font-size: 9.5pt; }
  th, td { border: 1px solid #c9d6e2; padding: 3px 6px; text-align: left; vertical-align: top; }
  th { background: #eaf1f8; }
  code { background: #f1f1f1; padding: 0 2px; border-radius: 2px; font-size: 9.2pt; }
  a { color: #0b3d66; text-decoration: none; }
`;

const markdown = await readFile(ENTRADA, 'utf8');
const documento = `<!doctype html><html lang="es-CL"><head><meta charset="utf-8"><title>Demand Planning AI · Ficha de negocio</title><style>${CSS}</style></head><body>${aHtml(markdown)}</body></html>`;

const navegador = await chromium.launch();
const pagina = await navegador.newPage();
await pagina.setContent(documento, { waitUntil: 'load' });
const pdf = await pagina.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
if (process.env.FICHA_PNG) {
  // Vista previa con el ancho útil de una página A4 (210 − 26 mm ≈ 697 px) para revisar la legibilidad.
  await pagina.emulateMedia({ media: 'print' });
  await pagina.setViewportSize({ width: 697, height: 1039 });
  const alto = await pagina.evaluate(() => document.body.scrollHeight);
  await pagina.screenshot({ path: process.env.FICHA_PNG, fullPage: true });
  console.log(`vista previa: el contenido mide ${alto} px de alto; una página A4 ofrece unos 1039 px útiles`);
}
await navegador.close();
await writeFile(SALIDA, pdf);

const lectura = await getDocumentProxy(new Uint8Array(pdf));
const { text } = await extractText(lectura, { mergePages: true });
console.log(`${SALIDA}: ${lectura.numPages} página(s) · ${(pdf.byteLength / 1024).toFixed(0)} KB · ${text.length} caracteres de texto`);
if (lectura.numPages !== 1) {
  console.error('ERROR: la ficha debe tener exactamente 1 página. Acorte el texto o ajuste el CSS.');
  process.exit(1);
}
