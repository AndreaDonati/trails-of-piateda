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

  it('does not accept a protocol-relative URL as site-relative', () => {
    // `//evil.example` reads as an internal path in a pull request diff but sends the visitor
    // off site; `/\\` is the same thing after the browser normalises the backslash.
    for (const href of ['//evil.example/phish', '/\\evil.example/phish']) {
      const html = renderMarkdown(`[clicca qui](${href})`);
      expect(html).not.toContain('<a ');
      expect(html).toContain('clicca qui');
    }
  });

  it('still accepts the schemes and the site-relative paths it promises', () => {
    expect(renderMarkdown('[x](/sentieri/piateda-ambria/)')).toBe(
      '<p><a href="/sentieri/piateda-ambria/" rel="noopener">x</a></p>',
    );
    expect(renderMarkdown('[x](/)')).toBe('<p><a href="/" rel="noopener">x</a></p>');
    expect(renderMarkdown('[x](mailto:info@esempio.it)')).toContain('href="mailto:info@esempio.it"');
    expect(renderMarkdown('[x](http://esempio.it)')).toContain('href="http://esempio.it"');
    expect(renderMarkdown('[x](/a?b=1&c=2)')).toContain('href="/a?b=1&amp;c=2"');
  });

  it('rejects the other ways of writing an active target', () => {
    for (const href of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'JAVASCRIPT:alert(1)',
      'data:text/html;base64,PHNjcmlwdD4=',
      'vbscript:msgbox(1)',
      'HTTPS://esempio.it',
      'file:///etc/passwd',
      '\\\\server/share',
    ]) {
      expect(renderMarkdown(`[x](${href})`), href).not.toContain('<a ');
    }
  });

  it('cannot break out of the href attribute or emit a raw tag', () => {
    const quoted = renderMarkdown('[x](/a"onmouseover=alert)');
    expect(quoted).toBe('<p><a href="/a&quot;onmouseover=alert" rel="noopener">x</a></p>');
    expect(renderMarkdown("[x](/a'onmouseover=alert)")).toContain('href="/a&#39;onmouseover=alert"');
    expect(renderMarkdown('[<img src=x onerror=alert(1)>](/a)')).toBe(
      '<p><a href="/a" rel="noopener">&lt;img src=x onerror=alert(1)&gt;</a></p>',
    );
    expect(renderMarkdown('[x](/a<script>)')).toContain('href="/a&lt;script&gt;"');
  });

  it('leaves the href alone when the URL contains emphasis characters', () => {
    // The emphasis rules used to run over the generated anchor and rewrite its href.
    expect(renderMarkdown('[x](/a*b*c)')).toBe('<p><a href="/a*b*c" rel="noopener">x</a></p>');
    expect(renderMarkdown('[x](/a_b_c)')).toBe('<p><a href="/a_b_c" rel="noopener">x</a></p>');
    expect(renderMarkdown('[x](https://esempio.it/**a**/b)')).toContain('href="https://esempio.it/**a**/b"');
  });

  it('still emphasises the label of a link and the text around it', () => {
    expect(renderMarkdown('[**x**](/a)')).toBe('<p><a href="/a" rel="noopener"><strong>x</strong></a></p>');
    expect(renderMarkdown('*prima* [x](/a_b) *dopo*')).toBe(
      '<p><em>prima</em> <a href="/a_b" rel="noopener">x</a> <em>dopo</em></p>',
    );
  });

  it('applies no rule inside a code span', () => {
    expect(renderMarkdown('`[x](/a*b*c)`')).toBe('<p><code>[x](/a*b*c)</code></p>');
  });

  it('returns an empty string when there is no description', () => {
    expect(renderMarkdown(undefined)).toBe('');
    expect(renderMarkdown('')).toBe('');
  });
});
