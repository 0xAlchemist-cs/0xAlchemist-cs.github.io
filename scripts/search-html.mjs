// @ts-check
import { parse, HTMLElement, TextNode } from 'node-html-parser';

/**
 * Add consistent Han-character boundaries to the index copy only. U+200B is
 * Pagefind's own invisible word separator; the published HTML is never written.
 * @param {string} html
 */
export function searchHTML(html) {
  const document = parse(html);
  const roots = document.querySelectorAll('[data-pagefind-body]');
  if (!roots.length) return null;
  /** @param {import('node-html-parser').Node} node */
  function visit(node) {
    if (node instanceof TextNode) {
      node.rawText = node.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\p{Script=Han}/gu, '\u200b$&\u200b')
        .replace(/\u200b{2,}/g, '\u200b');
    } else {
      if (
        node instanceof HTMLElement &&
        (node.hasAttribute('data-pagefind-ignore') ||
          /^(SCRIPT|STYLE|NOSCRIPT)$/.test(node.tagName))
      )
        return;
      for (const child of node.childNodes) visit(child);
    }
  }
  for (const root of roots) visit(root);
  return document.toString();
}
