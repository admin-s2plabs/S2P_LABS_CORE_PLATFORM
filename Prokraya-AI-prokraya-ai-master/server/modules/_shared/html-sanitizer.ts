import sanitizeHtml from "sanitize-html";

// Allowlist for contract clause/section HTML: covers what the Co-Pilot template
// and the WYSIWYG toolbar can produce (inline formatting spans with style attrs,
// tables, lists), nothing else. Used wherever AI-edited or user-styled section
// HTML is written into the live preview (srcDoc) or persisted to the DB.
const ALLOWED_STYLE_PROPS = [
  "font-weight", "font-style", "font-family", "font-size",
  "text-decoration", "text-decoration-color", "text-align",
  "color", "background", "background-color",
  "margin", "margin-top", "margin-bottom", "margin-left", "margin-right",
  "padding", "padding-top", "padding-bottom", "padding-left", "padding-right",
  "border", "border-top", "border-bottom", "border-left", "border-right",
  "width",
];

const STYLE_VALUE_PATTERN = new RegExp(
  `^(${ALLOWED_STYLE_PROPS.map((p) => p.replace(/-/g, "\\-")).join("|")})\\s*:\\s*[^;<>"]+$`,
  "i"
);

export function sanitizeContractHtml(html: string): string {
  return sanitizeHtml(html || "", {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "span", "div",
      "ul", "ol", "li",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "h1", "h2", "h3", "h4", "hr", "blockquote",
    ],
    allowedAttributes: {
      "*": ["style", "class", "data-section-key", "data-fingerprint"],
      td: ["colspan", "rowspan"],
      th: ["colspan", "rowspan"],
    },
    allowedSchemes: [],
    // sanitize-html doesn't validate individual style declarations out of the box —
    // strip the whole style attribute down to only the declarations we allow, below.
  }).replace(/style="([^"]*)"/gi, (_match, decls: string) => {
    const kept = decls
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && STYLE_VALUE_PATTERN.test(d))
      .join("; ");
    return kept ? `style="${kept}"` : "";
  });
}
