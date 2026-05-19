import katex from 'katex';
import 'katex/dist/katex.min.css';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderToken(token) {
  let tex = token;
  let displayMode = false;

  if (token.startsWith('$$') && token.endsWith('$$')) {
    tex = token.slice(2, -2);
    displayMode = true;
  } else if (token.startsWith('$') && token.endsWith('$')) {
    tex = token.slice(1, -1);
  } else if (token.startsWith('\\[') && token.endsWith('\\]')) {
    tex = token.slice(2, -2);
    displayMode = true;
  } else if (token.startsWith('\\(') && token.endsWith('\\)')) {
    tex = token.slice(2, -2);
  }

  try {
    return katex.renderToString(tex, {
      throwOnError: false,
      displayMode,
      strict: false,
    });
  } catch {
    return escapeHtml(token);
  }
}

export function mathToHtml(text) {
  const source = String(text ?? '');
  const regex =
    /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  let html = '';
  let cursor = 0;
  for (const match of source.matchAll(regex)) {
    html += escapeHtml(source.slice(cursor, match.index)).replace(
      /\n/g,
      '<br />'
    );
    html += renderToken(match[0]);
    cursor = match.index + match[0].length;
  }
  html += escapeHtml(source.slice(cursor)).replace(/\n/g, '<br />');
  return html;
}

export function MathText({ text, className = '' }) {
  return (
    <div
      className={className}
      dangerouslySetInnerHTML={{ __html: mathToHtml(text) }}
    />
  );
}
