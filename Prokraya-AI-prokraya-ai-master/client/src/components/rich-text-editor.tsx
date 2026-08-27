import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Plus, X, ChevronDown } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableData {
  headers: string[];
  rows: string[][];
}

interface TextSegment { kind: "text"; id: string; html: string }
interface TableSegment { kind: "table"; id: string; data: TableData }
type Segment = TextSegment | TableSegment;

export interface RteVariable {
  label: string;
  key: string;
}

const DEFAULT_VARIABLES: RteVariable[] = [
  { label: "End Date", key: "end_date" },
  { label: "Start Date", key: "start_date" },
  { label: "Contract Amount", key: "contract_amount" },
  { label: "Contract Number", key: "contract_number" },
  { label: "Owner", key: "owner" },
  { label: "Owner Name", key: "owner_name" },
  { label: "Buyer Email", key: "buyer_email" },
  { label: "Vendor Name", key: "vendor_name" },
  { label: "Version", key: "version" },
  { label: "Status", key: "status" },
  { label: "Description", key: "description" },
];

// ─── HTML ↔ Segments ─────────────────────────────────────────────────────────

function parseHtml(html: string): Segment[] {
  const wrap = document.createElement("div");
  wrap.innerHTML = html || "";

  const segments: Segment[] = [];
  let textBuf: ChildNode[] = [];
  let idx = 0;

  const flushText = () => {
    const tmp = document.createElement("div");
    textBuf.forEach((n) => tmp.appendChild(n.cloneNode(true)));
    const content = tmp.innerHTML.trim();
    segments.push({ kind: "text", id: `t${idx++}`, html: content });
    textBuf = [];
  };

  wrap.childNodes.forEach((node) => {
    if ((node as HTMLElement).tagName === "TABLE") {
      if (textBuf.length) flushText();
      const tbl = node as HTMLTableElement;
      const headers: string[] = [];
      const rows: string[][] = [];
      tbl.querySelectorAll("thead tr th, thead tr td").forEach((th) =>
        headers.push(th.innerHTML)
      );
      tbl.querySelectorAll("tbody tr").forEach((tr) => {
        const cells: string[] = [];
        tr.querySelectorAll("td, th").forEach((td) => cells.push(td.innerHTML));
        rows.push(cells);
      });
      // If no thead, treat first tbody row as header
      if (headers.length === 0) {
        const firstRow = tbl.querySelector("tbody tr");
        if (firstRow) {
          firstRow.querySelectorAll("td, th").forEach((td) =>
            headers.push(td.innerHTML)
          );
          rows.shift();
        }
      }
      segments.push({ kind: "table", id: `tbl${idx++}`, data: { headers, rows } });
    } else {
      textBuf.push(node);
    }
  });

  if (textBuf.length) flushText();
  if (segments.length === 0) segments.push({ kind: "text", id: "t0", html: "" });
  return segments;
}

// Merge consecutive text segments; keep exactly one text sentinel around tables.
function normalizeSegments(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  let counter = 0;
  for (const seg of segs) {
    if (seg.kind === "text") {
      const last = out[out.length - 1];
      if (last && last.kind === "text") {
        // Merge into previous text segment
        const merged = [last.html, seg.html].filter(Boolean).join("");
        out[out.length - 1] = { ...last, html: merged };
      } else {
        out.push(seg);
      }
    } else {
      // Ensure a text segment exists before every table
      const last = out[out.length - 1];
      if (!last || last.kind === "table") {
        out.push({ kind: "text", id: `tn${counter++}`, html: "" });
      }
      out.push(seg);
    }
  }
  // Always end with a text segment so user can type after the last table
  if (out.length === 0 || out[out.length - 1].kind === "table") {
    out.push({ kind: "text", id: `tn${counter++}`, html: "" });
  }
  return out;
}

function serializeSegments(segments: Segment[]): string {
  return segments
    .map((seg) => {
      if (seg.kind === "text") return seg.html;
      const { headers, rows } = seg.data;
      const thRow = headers
        .map((h) => `<th style="border:1px solid #d1d5db;padding:8px 12px;text-align:left;background:#f9fafb;font-weight:600">${h}</th>`)
        .join("");
      const tbody = rows
        .map(
          (r) =>
            "<tr>" +
            r
              .map(
                (c) =>
                  `<td style="border:1px solid #d1d5db;padding:8px 12px">${c}</td>`
              )
              .join("") +
            "</tr>"
        )
        .join("");
      return (
        `<table class="rte-table" style="border-collapse:collapse;width:100%;margin:8px 0;table-layout:fixed">` +
        `<thead><tr>${thRow}</tr></thead>` +
        `<tbody>${tbody}</tbody>` +
        `</table>`
      );
    })
    .join("");
}

// Build the HTML for a variable chip (stored in html_content)
function buildVarHtml(key: string): string {
  return `<span class="rte-var" data-var="${key}">{{ ${key} }}</span>&nbsp;`;
}

// ─── TableGridPicker ──────────────────────────────────────────────────────────

function TableGridPicker({
  anchorRef,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement>;
  onPick: (r: number, c: number) => void;
  onClose: () => void;
}) {
  const MAX_R = 6, MAX_C = 6;
  const [hover, setHover] = useState<[number, number]>([0, 0]);
  const pickerRef = useRef<HTMLDivElement>(null);

  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={pickerRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3"
    >
      <p className="text-xs text-center font-medium mb-2 text-gray-600 dark:text-gray-400">
        {hover[0] > 0 && hover[1] > 0 ? `${hover[0]} × ${hover[1]}` : "Select size"}
      </p>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX_C}, 1fr)` }}>
        {Array.from({ length: MAX_R }, (_, r) =>
          Array.from({ length: MAX_C }, (_, c) => (
            <div
              key={`${r}-${c}`}
              className={`w-7 h-7 rounded-sm border-2 cursor-pointer transition-colors ${
                r < hover[0] && c < hover[1]
                  ? "bg-blue-500 border-blue-600"
                  : "bg-gray-50 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-blue-100 hover:border-blue-400"
              }`}
              onMouseEnter={() => setHover([r + 1, c + 1])}
              onMouseLeave={() => setHover([0, 0])}
              onMouseDown={(e) => { e.preventDefault(); onPick(r + 1, c + 1); onClose(); }}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── VariableDropdown ─────────────────────────────────────────────────────────

function VariableDropdown({
  anchorRef,
  variables,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement>;
  variables: RteVariable[];
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      // Align right edge of dropdown to right edge of button, or left edge if space allows
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
  }, [anchorRef]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={dropRef}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: 200 }}
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl py-1 overflow-hidden"
    >
      <p className="px-3 py-1.5 text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
        Variables
      </p>
      <div className="overflow-y-auto" style={{ maxHeight: 220 }}>
        {variables.map((v) => (
          <button
            key={v.key}
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(v.key);
              onClose();
            }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── EditableTable ────────────────────────────────────────────────────────────

function EditableTable({
  data,
  onChange,
  onDelete,
}: {
  data: TableData;
  onChange: (d: TableData) => void;
  onDelete: () => void;
}) {
  const addRow = () =>
    onChange({ ...data, rows: [...data.rows, Array(data.headers.length).fill("")] });

  const addCol = () =>
    onChange({
      headers: [...data.headers, `Column ${data.headers.length + 1}`],
      rows: data.rows.map((r) => [...r, ""]),
    });

  const delCol = (ci: number) =>
    onChange({
      headers: data.headers.filter((_, i) => i !== ci),
      rows: data.rows.map((r) => r.filter((_, i) => i !== ci)),
    });

  const delRow = (ri: number) =>
    onChange({ ...data, rows: data.rows.filter((_, i) => i !== ri) });

  const setHeader = (ci: number, val: string) => {
    const headers = [...data.headers];
    headers[ci] = val;
    onChange({ ...data, headers });
  };

  const setCell = (ri: number, ci: number, val: string) => {
    const rows = data.rows.map((r) => [...r]);
    rows[ri][ci] = val;
    onChange({ ...data, rows });
  };

  const cellCls =
    "border border-gray-300 dark:border-gray-600 px-3 py-2 min-h-[36px] text-sm outline-none focus:bg-blue-50 dark:focus:bg-blue-900/20 w-full";

  return (
    <div className="my-3 rounded border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> Row
        </button>
        <button
          type="button"
          onClick={addCol}
          className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <Plus className="w-3 h-3" /> Column
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
        >
          <Trash2 className="w-3 h-3" /> Delete
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr>
              {data.headers.map((h, ci) => (
                <th key={ci} className="border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 p-0 relative">
                  <div className="flex items-center">
                    <input
                      type="text"
                      value={h}
                      onChange={(e) => setHeader(ci, e.target.value)}
                      className="flex-1 px-3 py-2 text-sm font-semibold bg-transparent outline-none min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => delCol(ci)}
                      className="p-1 mr-1 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors flex-shrink-0"
                      title="Delete column"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) => (
                  <td key={ci} className="border border-gray-300 dark:border-gray-600 p-0">
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className={cellCls}
                      dangerouslySetInnerHTML={{ __html: cell }}
                      onBlur={(e) => setCell(ri, ci, e.currentTarget.innerHTML)}
                    />
                  </td>
                ))}
                <td className="border-0 w-8 pl-1">
                  <button
                    type="button"
                    onClick={() => delRow(ri)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded transition-colors"
                    title="Delete row"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TextBlock ────────────────────────────────────────────────────────────────

function TextBlock({
  html,
  placeholder,
  onUpdate,
  onFocus,
  divRef,
}: {
  html: string;
  placeholder?: string;
  onUpdate: (html: string) => void;
  onFocus: () => void;
  divRef: (el: HTMLDivElement | null) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const isFocused = useRef(false);

  // On mount: set initial content
  useEffect(() => {
    if (elRef.current) {
      elRef.current.innerHTML = html;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync external html changes (e.g. AI rewrites) when the block is not being typed in
  useEffect(() => {
    if (elRef.current && !isFocused.current && elRef.current.innerHTML !== html) {
      elRef.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      ref={(el) => { (elRef as any).current = el; divRef(el); }}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      className="rte-text-block min-h-[40px] px-3 py-2 outline-none text-sm"
      onFocus={() => { isFocused.current = true; onFocus(); }}
      onBlur={() => { isFocused.current = false; }}
      onInput={() => {
        if (elRef.current) onUpdate(elRef.current.innerHTML);
      }}
    />
  );
}

// ─── Toolbar ──────────────────────────────────────────────────────────────────

const FORMATS: { cmd: string; val?: string; icon: string; title: string }[] = [
  { cmd: "bold", icon: "B", title: "Bold" },
  { cmd: "italic", icon: "I", title: "Italic" },
  { cmd: "underline", icon: "U", title: "Underline" },
  { cmd: "strikeThrough", icon: "S", title: "Strikethrough" },
  { cmd: "insertUnorderedList", icon: "•≡", title: "Bullet list" },
  { cmd: "insertOrderedList", icon: "1≡", title: "Ordered list" },
];

// ─── RichTextEditor ───────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: number;
  testId?: string;
  variables?: RteVariable[];
}

export default function RichTextEditor({ value, onChange, placeholder, height = 300, testId, variables }: Props) {
  const [segments, setSegments] = useState<Segment[]>(() => normalizeSegments(parseHtml(value)));
  const [showPicker, setShowPicker] = useState(false);
  const [showVarDrop, setShowVarDrop] = useState(false);
  const activeId = useRef<string | null>(null);
  const divRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const suppressSync = useRef(false);
  const insertTableBtnRef = useRef<HTMLButtonElement>(null);
  const insertVarBtnRef = useRef<HTMLButtonElement>(null);

  const varList = variables && variables.length > 0 ? variables : DEFAULT_VARIABLES;

  // Sync incoming value when editor not focused
  useEffect(() => {
    if (!suppressSync.current) {
      setSegments(normalizeSegments(parseHtml(value)));
    }
  }, [value]);

  const emitChange = useCallback((segs: Segment[]) => {
    suppressSync.current = true;
    onChange(serializeSegments(segs));
    setTimeout(() => { suppressSync.current = false; }, 100);
  }, [onChange]);

  const updateText = (id: string, html: string) => {
    setSegments((prev) => {
      const next = prev.map((s) => (s.id === id && s.kind === "text" ? { ...s, html } : s));
      setTimeout(() => emitChange(next));
      return next;
    });
  };

  const updateTable = (id: string, data: TableData) => {
    setSegments((prev) => {
      const next = prev.map((s) => (s.id === id && s.kind === "table" ? { ...s, data } : s));
      setTimeout(() => emitChange(next));
      return next;
    });
  };

  const deleteTable = (id: string) => {
    setSegments((prev) => {
      const filtered = prev.filter((s) => s.id !== id);
      const next = normalizeSegments(filtered);
      setTimeout(() => emitChange(next));
      return next;
    });
  };

  const insertTable = (rows: number, cols: number) => {
    const newId = `tbl${Date.now()}`;
    const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
    const tableRows = Array.from({ length: rows }, () => Array(cols).fill(""));
    const newTable: TableSegment = { kind: "table", id: newId, data: { headers, rows: tableRows } };

    setSegments((prev) => {
      const activeIdx = activeId.current ? prev.findIndex((s) => s.id === activeId.current) : -1;
      let draft: Segment[];
      if (activeIdx >= 0) {
        draft = [...prev.slice(0, activeIdx + 1), newTable, ...prev.slice(activeIdx + 1)];
      } else {
        draft = [...prev, newTable];
      }
      const next = normalizeSegments(draft);
      setTimeout(() => {
        emitChange(next);
        const tblIdx = next.findIndex((s) => s.id === newId);
        const afterSeg = tblIdx >= 0 ? next[tblIdx + 1] : undefined;
        if (afterSeg?.kind === "text") {
          divRefs.current.get(afterSeg.id)?.focus();
        }
      }, 0);
      return next;
    });
  };

  const insertVariable = (key: string) => {
    // execCommand keeps the cursor in the contentEditable because we used
    // onMouseDown + preventDefault on the dropdown button, so selection is intact.
    const varHtml = buildVarHtml(key);
    document.execCommand("insertHTML", false, varHtml);

    // Sync the updated innerHTML back into segments
    const id = activeId.current;
    if (id) {
      const el = divRefs.current.get(id);
      if (el) {
        const html = el.innerHTML;
        updateText(id, html);
      }
    }
  };

  const execFormat = (cmd: string) => {
    document.execCommand(cmd, false);
    const id = activeId.current;
    if (id) {
      const el = divRefs.current.get(id);
      if (el) updateText(id, el.innerHTML);
    }
  };

  return (
    <div
      className="rte-root border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden"
      data-testid={testId}
      style={{ minHeight: `${height}px`, display: "flex", flexDirection: "column" }}
    >
      {/* Toolbar */}
      <div className="rte-toolbar flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
        {FORMATS.map((f) => (
          <button
            key={f.cmd}
            type="button"
            title={f.title}
            onMouseDown={(e) => { e.preventDefault(); execFormat(f.cmd); }}
            className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors min-w-[28px]"
          >
            {f.icon}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          ref={insertTableBtnRef}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setShowPicker((v) => !v); setShowVarDrop(false); }}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Insert Table
        </button>
        <button
          ref={insertVarBtnRef}
          type="button"
          onMouseDown={(e) => { e.preventDefault(); setShowVarDrop((v) => !v); setShowPicker(false); }}
          className="flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
        >
          Insert Variable
          <ChevronDown className="w-3 h-3 opacity-70" />
        </button>
        {showPicker && (
          <TableGridPicker
            anchorRef={insertTableBtnRef}
            onPick={(r, c) => { insertTable(r, c); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />
        )}
        {showVarDrop && (
          <VariableDropdown
            anchorRef={insertVarBtnRef}
            variables={varList}
            onPick={(key) => { insertVariable(key); setShowVarDrop(false); }}
            onClose={() => setShowVarDrop(false)}
          />
        )}
      </div>

      {/* Content */}
      <div
        className="rte-content flex-1 overflow-y-auto"
        style={{ minHeight: `${height - 44}px` }}
      >
        {segments.map((seg) =>
          seg.kind === "text" ? (
            <TextBlock
              key={seg.id}
              html={seg.html}
              placeholder={placeholder}
              onUpdate={(html) => updateText(seg.id, html)}
              onFocus={() => { activeId.current = seg.id; }}
              divRef={(el) => {
                if (el) divRefs.current.set(seg.id, el);
                else divRefs.current.delete(seg.id);
              }}
            />
          ) : (
            <div key={seg.id} className="px-3">
              <EditableTable
                data={seg.data}
                onChange={(d) => updateTable(seg.id, d)}
                onDelete={() => deleteTable(seg.id)}
              />
            </div>
          )
        )}
      </div>
    </div>
  );
}
