/**
 * Minimal Markdown renderer for the `description` field of an entry (task 4.3).
 *
 * Why not a library: `description` is a YAML string, not a collection body, so Astro's own
 * Markdown pipeline never sees it, and the project must not gain a dependency for this one
 * field. The supported subset is what CONTRIBUTING tells contributors to write:
 *
 *   - paragraphs separated by a blank line; single newlines are soft wraps
 *   - unordered lists (`- ` or `* `) and ordered lists (`1. `)
 *   - headings `##` to `####`, rendered as h3..h5 (h1 is the entry name, h2 the sections)
 *   - inline `**grassetto**`, `*corsivo*`/`_corsivo_`, `` `codice` `` and `[testo](url)`
 *
 * Anything else is shown as written. The input is HTML-escaped before any rule runs, so a
 * contributed description can never inject markup, and only http/https/mailto and site-relative
 * links are turned into anchors.
 */

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] as string);
}

/** `&` is already escaped to `&amp;` at this point, so query strings still match. */
const SAFE_HREF = /^(https?:\/\/|mailto:|\/)[^\s]*$/;

function inlineMarkup(escaped: string): string {
  return escaped
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label: string, href: string) =>
      SAFE_HREF.test(href) ? `<a href="${href}" rel="noopener">${label}</a>` : whole,
    )
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
}

/** Code spans are extracted first so emphasis and links are not applied inside them. */
function inline(escaped: string): string {
  return escaped
    .split(/(`[^`\n]+`)/)
    .map((part, i) => (i % 2 === 1 ? `<code>${part.slice(1, -1)}</code>` : inlineMarkup(part)))
    .join('');
}

const HEADING = /^(#{2,4})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;

export function renderMarkdown(source: string | undefined): string {
  if (!source) return '';
  const lines = escapeHtml(source.replace(/\r\n?/g, '\n')).split('\n');
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    html.push(`<p>${inline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    html.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`);
    list = null;
  };
  const flush = () => {
    flushParagraph();
    flushList();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') {
      flush();
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      const level = (heading[1] as string).length + 1; // ## -> h3
      html.push(`<h${level}>${inline((heading[2] as string).trim())}</h${level}>`);
      continue;
    }

    const unordered = UNORDERED.exec(line);
    const ordered = unordered ? null : ORDERED.exec(line);
    if (unordered || ordered) {
      flushParagraph();
      const tag = unordered ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push(((unordered ?? ordered) as RegExpExecArray)[1] as string);
      continue;
    }

    flushList();
    paragraph.push(line);
  }
  flush();
  return html.join('\n');
}
