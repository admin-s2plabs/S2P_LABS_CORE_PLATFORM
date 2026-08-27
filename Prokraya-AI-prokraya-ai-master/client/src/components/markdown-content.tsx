import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type ListItem = {
  indent: number;
  ordered: boolean;
  number?: number;
  lines: string[];
};

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; lines: string[] }
  | { kind: "list"; items: ListItem[] }
  | { kind: "code"; lines: string[] }
  | { kind: "quote"; lines: string[] }
  | { kind: "rule" };

const HEADING = /^(#{1,6})\s+(.*)$/;
const UNORDERED_ITEM = /^(\s*)[-*+]\s+(.*)$/;
const ORDERED_ITEM = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const FENCE = /^\s*(`{3,}|~{3,})/;
const QUOTE = /^\s*>\s?(.*)$/;

// Ordered so that longer delimiters win over their prefixes (** before *).
const INLINE = /(`[^`\n]+`|\*\*\*[^*\n]+\*\*\*|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|~~[^~\n]+~~|\[[^\]\n]*\]\([^()\s]+\))/;

function parseBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim() === "") {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const closing = fence[1][0];
      const code: string[] = [];
      i++;
      while (i < lines.length && !new RegExp(`^\\s*${closing}{3,}\\s*$`).test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push({ kind: "code", lines: code });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        quoted.push(lines[i].match(QUOTE)![1]);
        i++;
      }
      blocks.push({ kind: "quote", lines: quoted });
      continue;
    }

    if (UNORDERED_ITEM.test(line) || ORDERED_ITEM.test(line)) {
      const items: ListItem[] = [];
      while (i < lines.length) {
        const unordered = lines[i].match(UNORDERED_ITEM);
        const ordered = lines[i].match(ORDERED_ITEM);
        if (unordered) {
          items.push({ indent: unordered[1].length, ordered: false, lines: [unordered[2]] });
        } else if (ordered) {
          items.push({
            indent: ordered[1].length,
            ordered: true,
            number: Number(ordered[2]),
            lines: [ordered[3]],
          });
        } else if (items.length > 0 && lines[i].trim() !== "" && /^\s+/.test(lines[i])) {
          // Continuation of the previous item.
          items[items.length - 1].lines.push(lines[i].trim());
        } else {
          break;
        }
        i++;
      }
      blocks.push({ kind: "list", items });
      continue;
    }

    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !HEADING.test(lines[i]) &&
      !RULE.test(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !UNORDERED_ITEM.test(lines[i]) &&
      !ORDERED_ITEM.test(lines[i])
    ) {
      paragraph.push(lines[i]);
      i++;
    }
    blocks.push({ kind: "paragraph", lines: paragraph });
  }

  return blocks;
}

function isSafeHref(href: string) {
  return /^(https?:\/\/|mailto:|\/)/i.test(href);
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.filter(Boolean).map((part, idx) => {
    const key = `${keyPrefix}-${idx}`;

    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("***") && part.endsWith("***")) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          <em>{part.slice(3, -3)}</em>
        </strong>
      );
    }
    if ((part.startsWith("**") && part.endsWith("**")) || (part.startsWith("__") && part.endsWith("__"))) {
      return (
        <strong key={key} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("~~") && part.endsWith("~~")) {
      return (
        <span key={key} className="line-through">
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={key}>{part.slice(1, -1)}</em>;
    }

    const link = part.match(/^\[([^\]]*)\]\(([^()\s]+)\)$/);
    if (link) {
      const [, label, href] = link;
      if (!isSafeHref(href)) return <Fragment key={key}>{label || href}</Fragment>;
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-primary underline underline-offset-2"
        >
          {label || href}
        </a>
      );
    }

    return <Fragment key={key}>{part}</Fragment>;
  });
}

/** Renders lines of a single block, treating soft line breaks as <br />. */
function renderLines(lines: string[], keyPrefix: string): ReactNode[] {
  return lines.map((line, idx) => (
    <Fragment key={`${keyPrefix}-l${idx}`}>
      {idx > 0 && <br />}
      {renderInline(line, `${keyPrefix}-l${idx}`)}
    </Fragment>
  ));
}

function renderList(items: ListItem[], start: number, indent: number, keyPrefix: string): ReactNode {
  const nodes: ReactNode[] = [];
  const ordered = items[start].ordered;
  let i = start;

  while (i < items.length && items[i].indent >= indent) {
    if (items[i].indent > indent) {
      // Deeper items were already consumed by the nested list below.
      i++;
      continue;
    }
    const current = i;
    let next = i + 1;
    while (next < items.length && items[next].indent > indent) next++;
    const nested =
      next > current + 1 ? renderList(items, current + 1, items[current + 1].indent, `${keyPrefix}-${current}n`) : null;

    nodes.push(
      <li key={`${keyPrefix}-${current}`} className="pl-1">
        {renderLines(items[current].lines, `${keyPrefix}-${current}`)}
        {nested}
      </li>,
    );
    i = next;
  }

  const className = cn("my-1 space-y-1 pl-5", ordered ? "list-decimal" : "list-disc");
  return ordered ? (
    <ol key={keyPrefix} className={className} start={items[start].number ?? 1}>
      {nodes}
    </ol>
  ) : (
    <ul key={keyPrefix} className={className}>
      {nodes}
    </ul>
  );
}

const HEADING_CLASS: Record<number, string> = {
  1: "text-base font-semibold text-foreground",
  2: "text-sm font-semibold text-foreground",
  3: "text-sm font-semibold text-foreground",
  4: "text-[0.95em] font-semibold text-foreground",
  5: "text-[0.9em] font-semibold text-foreground",
  6: "text-[0.9em] font-semibold text-muted-foreground",
};

function renderBlock(block: Block, index: number): ReactNode {
  const key = `b${index}`;

  switch (block.kind) {
    case "heading": {
      const Tag = `h${Math.min(block.level + 2, 6)}` as "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} className={cn("mt-3 first:mt-0", HEADING_CLASS[block.level])}>
          {renderInline(block.text, key)}
        </Tag>
      );
    }
    case "list":
      return renderList(block.items, 0, Math.min(...block.items.map((item) => item.indent)), key);
    case "code":
      return (
        <pre key={key} className="my-2 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
          <code>{block.lines.join("\n")}</code>
        </pre>
      );
    case "quote":
      return (
        <blockquote key={key} className="my-2 border-l-2 border-border pl-3 italic">
          {renderLines(block.lines, key)}
        </blockquote>
      );
    case "rule":
      return <hr key={key} className="my-3 border-border" />;
    case "paragraph":
    default:
      return (
        <p key={key} className="my-1 first:mt-0 last:mb-0">
          {renderLines(block.lines, key)}
        </p>
      );
  }
}

interface MarkdownContentProps {
  content: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Renders AI-generated Markdown (headings, bold, lists, links, code) as React
 * nodes. Text is never injected as HTML, so model output cannot inject markup.
 */
export function MarkdownContent({ content, className, ...rest }: MarkdownContentProps) {
  if (!content?.trim()) return null;
  const blocks = parseBlocks(content);

  return (
    <div className={cn("space-y-1 leading-relaxed", className)} {...rest}>
      {blocks.map(renderBlock)}
    </div>
  );
}

export default MarkdownContent;
