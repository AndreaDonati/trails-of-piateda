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

/**
 * Accepted link targets. `&` is already escaped to `&amp;` here, so query strings still match.
 *
 * A leading `//` (and `/\`, which browsers normalise to `//`) is rejected: the browser reads
 * both as protocol-relative, so `[clicca qui](//evil.example)` would become an off-site anchor
 * while the reviewer of the pull request reads the target as a site-relative path.
 */
const SAFE_HREF = /^(?:https?:\/\/|mailto:|\/(?![/\\]))[^\s]*$/;

/** One `[label](href)`, captured so a run of text can be split around it. */
const LINK = /(\[[^\]]+\]\([^)\s]+\))/;
const LINK_PARTS = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

function emphasis(escaped: string): string {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/(^|[\s(])_([^_\n]+)_(?=[\s.,;:!?)]|$)/g, '$1<em>$2</em>');
}

/**
 * Links are split out of the run before emphasis is applied, the same way code spans are in
 * `inline`, because the emphasis rules must never see generated markup: run over a finished
 * anchor they rewrote the href itself, turning `[x](/a*b*c)` into `href="/a<em>b</em>c"`, and
 * `_` in a URL broke the same way. The label is still emphasised, so `[**x**](/a)` works; as
 * with code spans, an emphasis run that opens before a link and closes after it is left as
 * written rather than reaching across the boundary.
 */
function inlineMarkup(escaped: string): string {
  return escaped
    .split(LINK)
    .map((part, i) => {
      if (i % 2 === 0) return emphasis(part);
      const parts = LINK_PARTS.exec(part);
      if (!parts) return emphasis(part);
      const label = parts[1] as string;
      const href = parts[2] as string;
      return SAFE_HREF.test(href) ? `<a href="${href}" rel="noopener">${emphasis(label)}</a>` : emphasis(part);
    })
    .join('');
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
