import { MessageBodyTooLargeError } from 'src/conversation/conversation.error';

/** Tighter per-message cap; the 20 MB global body limit is the outer ceiling (R14.3). */
export const MAX_BODY_BYTES = 100 * 1024; // 100 KB

type TipTapNode = {
  type?: string;
  text?: string;
  content?: TipTapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  attrs?: Record<string, unknown>;
};

/**
 * Validates and enforces the per-message byte cap on the raw JSON string.
 * Throws MessageBodyTooLargeError when exceeded.
 */
export function assertBodySize(doc: Record<string, unknown>): void {
  const bytes = Buffer.byteLength(JSON.stringify(doc), 'utf8');
  if (bytes > MAX_BODY_BYTES) {
    throw new MessageBodyTooLargeError(bytes, MAX_BODY_BYTES);
  }
}

/**
 * Renders a TipTap JSON document to sanitized HTML.
 * Unknown node/mark types are silently dropped (whitelist-only, R14.2).
 */
export function renderToHtml(doc: Record<string, unknown>): string {
  const root = doc as TipTapNode;
  if (!root || root.type !== 'doc' || !Array.isArray(root.content)) {
    return '';
  }
  return renderNodes(root.content);
}

function renderNodes(nodes: TipTapNode[], depth = 0): string {
  if (!Array.isArray(nodes) || depth > 64) return '';
  return nodes.map((node) => renderNode(node, depth)).join('');
}

function renderNode(node: TipTapNode, depth: number): string {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'paragraph':
      return `<p>${renderNodes(node.content ?? [], depth + 1)}</p>`;

    case 'text': {
      const text = escapeHtml(typeof node.text === 'string' ? node.text : '');
      return applyMarks(text, node.marks ?? []);
    }

    case 'heading': {
      const level = Math.min(
        Math.max(Math.trunc(Number(node.attrs?.level)) || 2, 1),
        6,
      );
      return `<h${level}>${renderNodes(node.content ?? [], depth + 1)}</h${level}>`;
    }

    case 'bulletList':
      return `<ul>${renderNodes(node.content ?? [], depth + 1)}</ul>`;

    case 'orderedList':
      return `<ol>${renderNodes(node.content ?? [], depth + 1)}</ol>`;

    case 'listItem':
      return `<li>${renderNodes(node.content ?? [], depth + 1)}</li>`;

    case 'blockquote':
      return `<blockquote>${renderNodes(node.content ?? [], depth + 1)}</blockquote>`;

    case 'codeBlock':
      return `<pre><code>${renderNodes(node.content ?? [], depth + 1)}</code></pre>`;

    case 'hardBreak':
      return '<br>';

    case 'horizontalRule':
      return '<hr>';

    default:
      // Sanitize by omission: unknown types are dropped.
      return '';
  }
}

function applyMarks(
  text: string,
  marks: Array<{ type: string; attrs?: Record<string, unknown> }>,
): string {
  if (!Array.isArray(marks)) return text;
  return marks.reduce((acc, mark) => {
    if (!mark || typeof mark !== 'object') return acc;
    switch (mark.type) {
      case 'bold':
        return `<strong>${acc}</strong>`;
      case 'italic':
        return `<em>${acc}</em>`;
      case 'underline':
        return `<u>${acc}</u>`;
      case 'strike':
        return `<s>${acc}</s>`;
      case 'code':
        return `<code>${acc}</code>`;
      case 'link': {
        const rawHref = mark.attrs?.href;
        const href = sanitizeHref(typeof rawHref === 'string' ? rawHref : '');
        return href ? `<a href="${href}">${acc}</a>` : acc;
      }
      default:
        return acc;
    }
  }, text);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Allows only http/https/mailto hrefs; drops everything else. */
function sanitizeHref(href: string): string {
  try {
    const url = new URL(href);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return escapeHtml(href);
    }
  } catch {
    // non-URL string
  }
  return '';
}
