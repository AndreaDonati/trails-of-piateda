import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '../src/components/markdown';

describe('renderMarkdown', () => {
  it('joins the soft-wrapped lines of a paragraph and separates paragraphs', () => {
    expect(renderMarkdown('Prima riga\nsecondo pezzo\n\nAltro paragrafo')).toBe(
      '<p>Prima riga secondo pezzo</p>\n<p>Altro paragrafo</p>',
    );
  });

  it('renders lists', () => {
    expect(renderMarkdown('- acqua\n- ponte')).toBe('<ul><li>acqua</li><li>ponte</li></ul>');
    expect(renderMarkdown('1. sali\n2. scendi')).toBe('<ol><li>sali</li><li>scendi</li></ol>');
  });

  it('renders headings below the page heading levels', () => {
    expect(renderMarkdown('## Accesso')).toBe('<h3>Accesso</h3>');
    expect(renderMarkdown('#### Nota')).toBe('<h5>Nota</h5>');
  });

  it('renders the inline subset', () => {
    expect(renderMarkdown('**attenzione** al *guado* e al `GPS`')).toBe(
      '<p><strong>attenzione</strong> al <em>guado</em> e al <code>GPS</code></p>',
    );
    expect(renderMarkdown('vedi [la scheda](https://esempio.it/x)')).toBe(
      '<p>vedi <a href="https://esempio.it/x" rel="noopener">la scheda</a></p>',
    );
  });

  it('escapes contributed text before any rule runs, so no markup can be injected', () => {
    expect(renderMarkdown('<script>alert(1)</script>')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
    );
    expect(renderMarkdown('a & b < c')).toBe('<p>a &amp; b &lt; c</p>');
  });

  it('leaves a link with an unsupported scheme as plain text', () => {
    expect(renderMarkdown('[x](javascript:alert(1))')).toContain('[x](javascript:alert(1))');
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a ');
  });

  it('returns an empty string when there is no description', () => {
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });
});
