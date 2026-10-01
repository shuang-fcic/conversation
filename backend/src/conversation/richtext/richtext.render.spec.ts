import { MessageBodyTooLargeError } from 'src/conversation/conversation.error';

import {
  assertBodySize,
  MAX_BODY_BYTES,
  renderToHtml,
} from './richtext.render';

describe('renderToHtml', () => {
  it('renders an empty doc', () => {
    expect(renderToHtml({ type: 'doc', content: [] })).toBe('');
  });

  it('renders a paragraph with plain text', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello world' }],
        },
      ],
    };
    expect(renderToHtml(doc)).toBe('<p>Hello world</p>');
  });

  it('escapes HTML entities in text nodes', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '<script>alert(1)</script>' }],
        },
      ],
    };
    expect(renderToHtml(doc)).toContain('&lt;script&gt;');
    expect(renderToHtml(doc)).not.toContain('<script>');
  });

  it('applies bold mark', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'bold',
              marks: [{ type: 'bold' }],
            },
          ],
        },
      ],
    };
    expect(renderToHtml(doc)).toBe('<p><strong>bold</strong></p>');
  });

  it('applies italic mark', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };
    expect(renderToHtml(doc)).toBe('<p><em>italic</em></p>');
  });

  it('sanitizes link hrefs — allows https', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
            },
          ],
        },
      ],
    };
    expect(renderToHtml(doc)).toContain('href="https://example.com"');
  });

  it('strips javascript: hrefs', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'click',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }],
            },
          ],
        },
      ],
    };
    const html = renderToHtml(doc);
    expect(html).not.toContain('href');
    expect(html).toContain('click');
  });

  it('drops unknown node types silently', () => {
    const doc = {
      type: 'doc',
      content: [{ type: 'unknownWidget', content: [] }],
    };
    expect(renderToHtml(doc)).toBe('');
  });

  it('renders heading with correct tag', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Title' }],
        },
      ],
    };
    expect(renderToHtml(doc)).toBe('<h2>Title</h2>');
  });

  it('renders bullet list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'item' }],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(renderToHtml(doc)).toBe('<ul><li><p>item</p></li></ul>');
  });

  it('returns empty string for non-doc root', () => {
    expect(renderToHtml({ type: 'paragraph', content: [] })).toBe('');
    expect(renderToHtml({})).toBe('');
  });
});

describe('assertBodySize', () => {
  it('accepts a small document', () => {
    expect(() => assertBodySize({ type: 'doc', content: [] })).not.toThrow();
  });

  it('throws MessageBodyTooLargeError when the JSON exceeds the limit', () => {
    const huge = { type: 'doc', content: 'x'.repeat(MAX_BODY_BYTES + 1) };
    expect(() => assertBodySize(huge)).toThrow(MessageBodyTooLargeError);
  });
});

describe('HTML link attribute boundary', () => {
  it('escapes quotes in an otherwise allowed URL', () => {
    const html = renderToHtml({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'link',
              marks: [
                {
                  type: 'link',
                  attrs: { href: 'https://example.com/" onclick="alert(1)' },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(html).not.toContain(' onclick="');
    expect(html).toContain('&quot;');
  });
});

describe('malformed rich text', () => {
  it('drops invalid children and marks without breaking thread retrieval', () => {
    expect(
      renderToHtml({
        type: 'doc',
        content: [
          null,
          { type: 'paragraph', content: {} },
          { type: 'text', text: 'safe', marks: [null] },
        ],
      }),
    ).toBe('<p></p>safe');
  });
  it('caps nesting depth', () => {
    let nested: Record<string, unknown> = { type: 'text', text: 'deep' };
    for (let i = 0; i < 100; i++)
      nested = { type: 'paragraph', content: [nested] };
    expect(renderToHtml({ type: 'doc', content: [nested] })).not.toContain(
      'deep',
    );
  });
});
