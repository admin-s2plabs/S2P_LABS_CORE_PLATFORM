import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import { Mark, mergeAttributes, getMarkRange, getMarksBetween } from "@tiptap/core";
import type { Editor as TiptapEditor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TrackChangeExtension from "track-change-extension";
import { TextSelection } from "@tiptap/pm/state";
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  List, ListOrdered, CheckCheck, XCircle, GitBranch, MessageSquare, Send, ChevronDown,
  Plus, Minus, Rows3, Columns3, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ─── Variables ───────────────────────────────────────────────────────────────

const DEFAULT_VARIABLES = [
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
      ) onClose();
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
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement>;
  onPick: (key: string) => void;
  onClose: () => void;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
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
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) onClose();
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
        {DEFAULT_VARIABLES.map((v) => (
          <button
            key={v.key}
            type="button"
            className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-800 dark:hover:text-amber-300 transition-colors"
            onMouseDown={(e) => { e.preventDefault(); onPick(v.key); onClose(); }}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Comment Mark Extension ────────────────────────────────────────────────────

const CommentMark = Mark.create({
  name: "comment",
  addAttributes() {
    return {
      "data-comment-id": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) =>
          attrs["data-comment-id"] ? { "data-comment-id": attrs["data-comment-id"] } : {},
      },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "comment-mark" }), 0];
  },
  addCommands() {
    return {
      setCommentMark:
        (commentId: string) =>
        ({ commands }: any) =>
          commands.setMark("comment", { "data-comment-id": commentId }),
    } as any;
  },
});

// ─── Variable Mark Extension ───────────────────────────────────────────────────

const VariableMark = Mark.create({
  name: "variable",
  parseHTML() {
    return [{ tag: "span[data-variable]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-variable": "true", class: "variable-mark" }), 0];
  },
  addCommands() {
    return {
      setVariableMark:
        () =>
        ({ commands }: any) =>
          commands.setMark("variable"),
    } as any;
  },
});

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  height?: number;
  trackChangesMode?: boolean;
  showChangesBar?: boolean;
  reviewerName?: string;
  reviewerId?: string;
  onAcceptAll?: (cleanHtml: string) => void;
  onRejectAll?: (cleanHtml: string) => void;
  onAddComment?: (commentId: string, selectedText: string, commentText: string) => Promise<void>;
  testId?: string;
  readOnly?: boolean;
  restrictedMode?: boolean;
}

// ─── Toolbar Button ────────────────────────────────────────────────────────────

function ToolBtn({
  active,
  title,
  onClick,
  children,
  disabled,
}: {
  active?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={title}
            disabled={disabled}
            onMouseDown={(e) => { e.preventDefault(); onClick(); }}
            className={cn(
              "inline-flex items-center justify-center h-7 w-7 rounded text-sm transition-colors",
              active
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              disabled && "opacity-40 cursor-not-allowed pointer-events-none",
            )}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">{title}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── TiptapClauseEditor ────────────────────────────────────────────────────────

export default function TiptapClauseEditor({
  value,
  onChange,
  placeholder = "Start writing clause content here…",
  height = 300,
  trackChangesMode = false,
  showChangesBar = false,
  reviewerName = "",
  reviewerId = "",
  onAcceptAll,
  onRejectAll,
  onAddComment,
  testId,
  readOnly = false,
  restrictedMode = false,
}: Props) {

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const syncingRef = useRef(false);
  const isStableRef = useRef(false);

  const reviewerIdRef = useRef(reviewerId);
  reviewerIdRef.current = reviewerId;
  const reviewerNameRef = useRef(reviewerName);
  reviewerNameRef.current = reviewerName;
  const trackChangesRef2 = useRef(trackChangesMode);
  trackChangesRef2.current = trackChangesMode;
  const onAddCommentRef = useRef(onAddComment);
  onAddCommentRef.current = onAddComment;

  // ── Comment form state ──
  const [hasSelection, setHasSelection] = useState(false);
  const [commentFormOpen, setCommentFormOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const pendingSelectionRef = useRef<{ from: number; to: number } | null>(null);

  // ── Per-change popup (individual Accept / Reject) ──
  const containerRef = useRef<HTMLDivElement>(null);
  const showChangesBarRef = useRef(showChangesBar);
  showChangesBarRef.current = showChangesBar;
  const [changePopup, setChangePopup] = useState<{ visible: boolean; top: number; left: number; type: "insertion" | "deletion" | null; cursorPos: number; markFrom: number; markTo: number }>({ visible: false, top: 0, left: 0, type: null, cursorPos: 0, markFrom: 0, markTo: 0 });
  const changePopupRef = useRef(changePopup);
  changePopupRef.current = changePopup;

  // ── Hover tooltip: shows which reviewer made an insertion/deletion ──
  const [hoverTip, setHoverTip] = useState<{ visible: boolean; top: number; left: number; label: string }>({ visible: false, top: 0, left: 0, label: "" });
  const hoveredElRef = useRef<Element | null>(null);

  const handleTrackChangeHover = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest?.("insert, delete");
    if (!target) {
      if (hoveredElRef.current) {
        hoveredElRef.current = null;
        setHoverTip((p) => (p.visible ? { ...p, visible: false } : p));
      }
      return;
    }
    if (target === hoveredElRef.current) return;
    hoveredElRef.current = target;

    const nickname = target.getAttribute("data-op-user-nickname") || target.getAttribute("data-op-user-id") || "Unknown reviewer";
    const isInsertion = target.tagName.toLowerCase() === "insert";
    const dateAttr = target.getAttribute("data-op-date");
    let dateLabel = "";
    if (dateAttr) {
      const ts = Number(dateAttr);
      if (!Number.isNaN(ts) && ts > 0) dateLabel = ` · ${new Date(ts).toLocaleString()}`;
    }
    const label = `${isInsertion ? "Added" : "Deleted"} by ${nickname}${dateLabel}`;

    const containerEl = containerRef.current;
    if (!containerEl) return;
    const rect = containerEl.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const top = targetRect.top - rect.top - 26;
    const left = Math.max(0, Math.min(targetRect.left - rect.left, rect.width - 220));
    setHoverTip({ visible: true, top, left, label });
  }, []);

  const handleTrackChangeHoverLeave = useCallback(() => {
    hoveredElRef.current = null;
    setHoverTip((p) => (p.visible ? { ...p, visible: false } : p));
  }, []);

  // ── Insert Table / Variable state ──
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showVarDrop, setShowVarDrop] = useState(false);
  const [isInTable, setIsInTable] = useState(false);
  const insertTableBtnRef = useRef<HTMLButtonElement>(null);
  const insertVarBtnRef = useRef<HTMLButtonElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      CommentMark,
      VariableMark,
      TrackChangeExtension.configure({
        enabled: trackChangesMode,
        dataOpUserId: reviewerId,
        dataOpUserNickname: reviewerName || reviewerId,
      }),
    ],
    content: value || "",
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: "tiptap-editor-content focus:outline-none",
        style: `min-height: ${height}px; padding: 12px 16px;`,
        "data-placeholder": placeholder,
        ...(testId ? { "data-testid": testId } : {}),
      },
      handleKeyDown: (view, event) => {
        if (!trackChangesRef2.current) return false;
        const isDelete = event.key === "Delete";
        const isBackspace = event.key === "Backspace";
        if (!isDelete && !isBackspace) return false;

        const { state, dispatch } = view;
        const { from, to, empty } = state.selection;
        const schema = state.schema;
        const deletionMarkType = schema.marks.deletion;
        const insertionMarkType = schema.marks.insertion;
        if (!deletionMarkType) return false;

        const minuteTime = Date.now() - (Date.now() % 60000);
        const deletionMark = deletionMarkType.create({
          "data-op-user-id": reviewerIdRef.current,
          "data-op-user-nickname": reviewerNameRef.current || reviewerIdRef.current,
          "data-op-date": minuteTime,
        });

        const markSelection = (selFrom: number, selTo: number) => {
          const tr = state.tr;
          let offset = 0;
          state.doc.nodesBetween(selFrom, selTo, (node, nodePos) => {
            if (!node.isText) return true;
            const nFrom = Math.max(nodePos, selFrom);
            const nTo = Math.min(nodePos + node.nodeSize, selTo);
            const hasInsertion = node.marks.some((m) => m.type === insertionMarkType);
            if (hasInsertion) {
              tr.delete(nFrom - offset, nTo - offset);
              offset += nTo - nFrom;
            } else {
              tr.addMark(nFrom - offset, nTo - offset, deletionMark);
            }
            return true;
          });
          tr.setSelection(TextSelection.create(tr.doc, selFrom));
          tr.setMeta("trackManualChanged", true);
          dispatch(tr);
        };

        if (!empty) {
          markSelection(from, to);
          return true;
        }

        if (isDelete) {
          const docSize = state.doc.content.size;
          let pos = from;
          while (pos < docSize - 1) {
            const nodeAfter = state.doc.resolve(pos).nodeAfter;
            if (!nodeAfter || !nodeAfter.marks.some((m) => m.type === deletionMarkType)) break;
            pos += nodeAfter.nodeSize;
          }
          if (pos >= docSize - 1) return true;
          const nodeAfter = state.doc.resolve(pos).nodeAfter;
          if (!nodeAfter) return true;
          const charEnd = pos + 1;
          const hasInsertion = nodeAfter.marks.some((m) => m.type === insertionMarkType);
          const tr = state.tr;
          if (hasInsertion) {
            tr.delete(pos, charEnd);
            tr.setSelection(TextSelection.create(tr.doc, pos));
          } else {
            tr.addMark(pos, charEnd, deletionMark);
            tr.setSelection(TextSelection.create(tr.doc, charEnd));
          }
          tr.setMeta("trackManualChanged", true);
          dispatch(tr);
          return true;
        }

        let pos = from;
        while (pos > 1) {
          const nodeBefore = state.doc.resolve(pos).nodeBefore;
          if (!nodeBefore || !nodeBefore.marks.some((m) => m.type === deletionMarkType)) break;
          pos -= nodeBefore.nodeSize;
        }
        if (pos <= 1) return true;
        const nodeBefore = state.doc.resolve(pos).nodeBefore;
        if (!nodeBefore || !nodeBefore.isText) return false;
        const charStart = pos - 1;
        const hasInsertion = nodeBefore.marks.some((m) => m.type === insertionMarkType);
        const tr = state.tr;
        if (hasInsertion) {
          tr.delete(charStart, pos);
          tr.setSelection(TextSelection.create(tr.doc, charStart));
        } else {
          tr.addMark(charStart, pos, deletionMark);
          tr.setSelection(TextSelection.create(tr.doc, charStart));
        }
        tr.setMeta("trackManualChanged", true);
        dispatch(tr);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      if (syncingRef.current || !isStableRef.current) return;
      onChangeRef.current(editor.getHTML());
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from !== to) {
        setHasSelection(true);
        pendingSelectionRef.current = { from, to };
      } else {
        setHasSelection(false);
      }
      setIsInTable(editor.isActive("table"));

      // Detect if cursor is on an insertion or deletion mark → show per-change popup
      if (showChangesBarRef.current) {
        const schema = editor.state.schema;
        const insertionMarkType = schema.marks.insertion;
        const deletionMarkType = schema.marks.deletion;
        if (insertionMarkType || deletionMarkType) {
          const pos = from;
          const resolved = editor.state.doc.resolve(pos);
          const nodeBefore = resolved.nodeBefore;
          const nodeAfter = resolved.nodeAfter;
          const hasInsertion = nodeBefore?.marks.some(m => m.type === insertionMarkType) || nodeAfter?.marks.some(m => m.type === insertionMarkType);
          const hasDeletion = nodeBefore?.marks.some(m => m.type === deletionMarkType) || nodeAfter?.marks.some(m => m.type === deletionMarkType);
          if (hasInsertion || hasDeletion) {
            try {
              // Find the full range of this mark so we can pass a proper selection
              // to acceptChange/rejectChange (getMarksBetween path, not cursor path)
              const markType = hasInsertion ? insertionMarkType : deletionMarkType;
              let markRange = getMarkRange(resolved, markType);
              if (!markRange && nodeAfter?.marks.some(m => m.type === markType)) {
                // cursor is right at the START of the mark; step inside by 1
                markRange = getMarkRange(editor.state.doc.resolve(pos + 1), markType);
              }
              const markFrom = markRange?.from ?? pos;
              const markTo = markRange?.to ?? pos;

              const coords = editor.view.coordsAtPos(pos);
              const containerEl = containerRef.current;
              if (containerEl) {
                const rect = containerEl.getBoundingClientRect();
                const top = coords.top - rect.top - 38;
                const left = Math.max(0, Math.min(coords.left - rect.left, rect.width - 160));
                setChangePopup({ visible: true, top, left, type: hasInsertion ? "insertion" : "deletion", cursorPos: pos, markFrom, markTo });
                return;
              }
            } catch { /* ignore */ }
          }
        }
        setChangePopup(p => p.visible ? { ...p, visible: false } : p);
      }
    },
  });

  const trackChangesRef = useRef(trackChangesMode);
  trackChangesRef.current = trackChangesMode;
  useEffect(() => {
    if (!editor || syncingRef.current) return;
    const current = editor.getHTML();
    if (current !== value && value !== undefined) {
      syncingRef.current = true;
      editor.commands.setTrackChangeStatus(false);
      editor.commands.setContent(value || "", false);
      if (trackChangesRef.current) editor.commands.setTrackChangeStatus(true);
      syncingRef.current = false;
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delay accepting onChange until all async init events have settled (TrackChange ext fires async)
  useEffect(() => {
    const timer = setTimeout(() => { isStableRef.current = true; }, 200);
    return () => { clearTimeout(timer); isStableRef.current = false; };
  }, []); // mount only

  useEffect(() => {
    if (!editor) return;
    editor.commands.setTrackChangeStatus(trackChangesMode);
  }, [trackChangesMode, editor]);

  useEffect(() => {
    if (!editor) return;
    editor.commands.updateOpUserOption(reviewerId, reviewerName || reviewerId);
  }, [reviewerId, reviewerName, editor]);

  // Keep editor editable state in sync with readOnly prop changes
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [readOnly, editor]);

  /**
   * Apply accept/reject to a range of tracked changes using editor.view.dispatch()
   * instead of the library's built-in commands. The library uses editor.view.updateState()
   * which bypasses Tiptap's dispatchTransaction, leaving internal state inconsistent and
   * causing "Applying a mismatched transaction" errors on subsequent operations.
   * Using dispatch() goes through the proper pipeline and keeps state in sync.
   */
  const applyTrackOp = useCallback((
    editorInst: TiptapEditor,
    opType: "accept" | "reject",
    rangeFrom?: number,
    rangeTo?: number
  ) => {
    const { state } = editorInst;
    const { doc, schema } = state;
    const from = rangeFrom ?? 0;
    const to = rangeTo ?? doc.content.size;
    let markRanges = getMarksBetween(from, to, doc).filter(
      mr => mr.mark.type.name === "insertion" || mr.mark.type.name === "deletion"
    );
    if (!markRanges.length) return;
    const tr = state.tr;
    tr.setMeta("trackManualChanged", true);
    let offset = 0;
    markRanges.forEach(mr => {
      const isAcceptInsert = opType === "accept" && mr.mark.type.name === "insertion";
      const isRejectDelete = opType === "reject" && mr.mark.type.name === "deletion";
      if (isAcceptInsert || isRejectDelete) {
        // Keep text, remove the mark
        tr.removeMark(mr.from - offset, mr.to - offset, schema.marks.insertion);
        tr.removeMark(mr.from - offset, mr.to - offset, schema.marks.deletion);
      } else {
        // Delete the text entirely
        tr.deleteRange(mr.from - offset, mr.to - offset);
        offset += mr.to - mr.from;
      }
    });
    if (tr.steps.length) {
      editorInst.view.dispatch(tr);
    }
  }, []);

  const handleAcceptAll = useCallback(() => {
    if (!editor) return;
    applyTrackOp(editor, "accept");
    const clean = editor.getHTML();
    onChangeRef.current(clean);
    onAcceptAll?.(clean);
  }, [editor, applyTrackOp, onAcceptAll]);

  const handleRejectAll = useCallback(() => {
    if (!editor) return;
    applyTrackOp(editor, "reject");
    const clean = editor.getHTML();
    onChangeRef.current(clean);
    onRejectAll?.(clean);
  }, [editor, applyTrackOp, onRejectAll]);

  const handleAcceptChange = useCallback(() => {
    if (!editor) return;
    const { markFrom, markTo } = changePopupRef.current;
    setChangePopup(p => ({ ...p, visible: false }));
    requestAnimationFrame(() => {
      applyTrackOp(editor, "accept", markFrom, markTo);
      const clean = editor.getHTML();
      onChangeRef.current(clean);
      // Persist to DB via the same callback Accept All uses
      onAcceptAll?.(clean);
    });
  }, [editor, applyTrackOp, onAcceptAll]);

  const handleRejectChange = useCallback(() => {
    if (!editor) return;
    const { markFrom, markTo } = changePopupRef.current;
    setChangePopup(p => ({ ...p, visible: false }));
    requestAnimationFrame(() => {
      applyTrackOp(editor, "reject", markFrom, markTo);
      const clean = editor.getHTML();
      onChangeRef.current(clean);
      // Persist to DB via the same callback Reject All uses
      onRejectAll?.(clean);
    });
  }, [editor, applyTrackOp, onRejectAll]);

  const handleInsertTable = useCallback((rows: number, cols: number) => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run();
  }, [editor]);

  const handleInsertVariable = useCallback((key: string) => {
    if (!editor) return;
    const text = `{{ ${key} }}`;
    // Insert as HTML so parseHTML picks up the variable mark, then unset for subsequent typing
    editor.chain()
      .focus()
      .insertContent(`<span data-variable="true">${text}</span>`)
      .unsetMark("variable")
      .run();
  }, [editor]);

  const handleAddCommentClick = useCallback(() => {
    if (!editor || !hasSelection) return;
    const { from, to } = editor.state.selection;
    pendingSelectionRef.current = { from, to };
    setCommentFormOpen(true);
    setCommentText("");
  }, [editor, hasSelection]);

  const handleSubmitComment = useCallback(async () => {
    if (!editor || !commentText.trim() || !onAddCommentRef.current) return;
    setSubmittingComment(true);
    try {
      const sel = pendingSelectionRef.current;
      if (!sel) return;
      const selectedText = editor.state.doc.textBetween(sel.from, sel.to, " ");
      const commentId = crypto.randomUUID();
      // Restore selection and apply mark
      editor.chain()
        .focus()
        .setTextSelection({ from: sel.from, to: sel.to })
        .run();
      // apply the comment mark via commands (avoid TS typing issue on chained commands)
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      await editor.commands.setCommentMark(commentId);
      // Fire callback to parent to save in DB
      await onAddCommentRef.current(commentId, selectedText, commentText.trim());
    } finally {
      setSubmittingComment(false);
      setCommentFormOpen(false);
      setCommentText("");
      setHasSelection(false);
      pendingSelectionRef.current = null;
    }
  }, [editor, commentText]);

  const isEditable = !readOnly;
  const showCommentButton = trackChangesMode && !!onAddComment;

  return (
    <div
      ref={containerRef}
      className={cn(
        "tiptap-clause-editor border rounded-md overflow-hidden bg-background",
        "border-border",
        trackChangesMode && "border-amber-400 dark:border-amber-500",
        showChangesBar && "border-blue-400 dark:border-blue-500",
      )}
      style={{ minHeight: `${height + 44}px`, display: "flex", flexDirection: "column", position: "relative" }}
      onMouseMove={handleTrackChangeHover}
      onMouseLeave={handleTrackChangeHoverLeave}
    >
      {/* ── Hover tooltip: reviewer name for insertion/deletion under cursor ── */}
      {hoverTip.visible && !(showChangesBar && changePopup.visible) && (
        <div
          style={{ position: "absolute", top: hoverTip.top, left: hoverTip.left, zIndex: 50 }}
          className="pointer-events-none bg-popover border border-border rounded-md shadow-lg px-2 py-1 text-[11px] text-foreground whitespace-nowrap"
        >
          {hoverTip.label}
        </div>
      )}
      {/* ── Per-change floating Accept / Reject popup ── */}
      {showChangesBar && changePopup.visible && (
        <div
          style={{ position: "absolute", top: changePopup.top, left: changePopup.left, zIndex: 50 }}
          className="flex items-center gap-1 bg-popover border border-border rounded-md shadow-lg px-2 py-1 text-[11px]"
          onMouseDown={(e) => e.preventDefault()}
        >
          <span className="text-muted-foreground mr-0.5">
            {changePopup.type === "insertion" ? "Insertion" : "Deletion"}:
          </span>
          <button
            onClick={handleAcceptChange}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/70 font-medium"
            data-testid="button-accept-single-change"
          >
            <CheckCheck className="h-3 w-3" /> Accept
          </button>
          <button
            onClick={handleRejectChange}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/70 font-medium"
            data-testid="button-reject-single-change"
          >
            <XCircle className="h-3 w-3" /> Reject
          </button>
        </div>
      )}
      {/* ── Toolbar ── */}
      <div className={cn(
        "flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b flex-shrink-0",
        trackChangesMode
          ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
          : showChangesBar
          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
          : "bg-muted/40 border-border",
      )}>
        {isEditable && (
          <>
            <ToolBtn
              title="Bold"
              active={editor?.isActive("bold")}
              onClick={() => editor?.chain().focus().toggleBold().run()}
            >
              <Bold className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              title="Italic"
              active={editor?.isActive("italic")}
              onClick={() => editor?.chain().focus().toggleItalic().run()}
            >
              <Italic className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              title="Underline"
              active={editor?.isActive("underline")}
              onClick={() => editor?.chain().focus().toggleUnderline().run()}
            >
              <UnderlineIcon className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              title="Strikethrough"
              active={editor?.isActive("strike")}
              onClick={() => editor?.chain().focus().toggleStrike().run()}
            >
              <Strikethrough className="h-3.5 w-3.5" />
            </ToolBtn>
            <div className="w-px h-4 bg-border mx-0.5" />
            <ToolBtn
              title="Bullet List"
              active={editor?.isActive("bulletList")}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}
            >
              <List className="h-3.5 w-3.5" />
            </ToolBtn>
            <ToolBtn
              title="Numbered List"
              active={editor?.isActive("orderedList")}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered className="h-3.5 w-3.5" />
            </ToolBtn>
            {!restrictedMode && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                <button
                  ref={insertTableBtnRef}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowTablePicker((v) => !v); setShowVarDrop(false); }}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border border-border hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-insert-table"
                >
                  Insert Table
                </button>
                <button
                  ref={insertVarBtnRef}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); setShowVarDrop((v) => !v); setShowTablePicker(false); }}
                  className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded border border-border hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-insert-variable"
                >
                  Insert Variable
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>
                {showTablePicker && (
                  <TableGridPicker
                    anchorRef={insertTableBtnRef}
                    onPick={(r, c) => { handleInsertTable(r, c); setShowTablePicker(false); }}
                    onClose={() => setShowTablePicker(false)}
                  />
                )}
                {showVarDrop && (
                  <VariableDropdown
                    anchorRef={insertVarBtnRef}
                    onPick={(key) => { handleInsertVariable(key); setShowVarDrop(false); }}
                    onClose={() => setShowVarDrop(false)}
                  />
                )}
              </>
            )}

            {/* Table context toolbar — shown only when cursor is inside a table (not in restricted mode) */}
            {!restrictedMode && isInTable && (
              <>
                <div className="w-px h-4 bg-border mx-0.5" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mr-0.5">Table:</span>
                <button
                  type="button"
                  title="Add row above"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowBefore().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-table-add-row-above"
                >
                  <Rows3 className="h-3 w-3" />
                  <Plus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Row ↑</span>
                </button>
                <button
                  type="button"
                  title="Add row below"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addRowAfter().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-table-add-row-below"
                >
                  <Rows3 className="h-3 w-3" />
                  <Plus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Row ↓</span>
                </button>
                <button
                  type="button"
                  title="Delete row"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteRow().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground transition-colors"
                  data-testid="button-table-delete-row"
                >
                  <Rows3 className="h-3 w-3" />
                  <Minus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Row</span>
                </button>
                <div className="w-px h-3 bg-border mx-0.5" />
                <button
                  type="button"
                  title="Add column before"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnBefore().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-table-add-col-before"
                >
                  <Columns3 className="h-3 w-3" />
                  <Plus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Col ←</span>
                </button>
                <button
                  type="button"
                  title="Add column after"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().addColumnAfter().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-accent hover:text-accent-foreground text-muted-foreground transition-colors"
                  data-testid="button-table-add-col-after"
                >
                  <Columns3 className="h-3 w-3" />
                  <Plus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Col →</span>
                </button>
                <button
                  type="button"
                  title="Delete column"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteColumn().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground transition-colors"
                  data-testid="button-table-delete-col"
                >
                  <Columns3 className="h-3 w-3" />
                  <Minus className="h-2.5 w-2.5" />
                  <span className="text-[10px]">Col</span>
                </button>
                <div className="w-px h-3 bg-border mx-0.5" />
                <button
                  type="button"
                  title="Delete entire table"
                  onMouseDown={(e) => { e.preventDefault(); editor?.chain().focus().deleteTable().run(); }}
                  className="flex items-center gap-0.5 text-xs px-1.5 py-1 rounded hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-600 dark:hover:text-red-400 text-muted-foreground transition-colors"
                  data-testid="button-table-delete"
                >
                  <Trash2 className="h-3 w-3" />
                  <span className="text-[10px]">Table</span>
                </button>
              </>
            )}
          </>
        )}

        {/* Track Changes badge */}
        {trackChangesMode && (
          <Badge
            variant="outline"
            className="ml-1 text-[10px] px-1.5 py-0 h-5 border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 font-medium gap-1"
          >
            <GitBranch className="h-2.5 w-2.5" />
            Track Changes: ON
          </Badge>
        )}

        {/* Add Comment button — only in reviewer mode */}
        {showCommentButton && (
          <>
            <div className="w-px h-4 bg-border mx-0.5" />
            <ToolBtn
              title={hasSelection ? "Add Comment on selected text" : "Select text first to add a comment"}
              onClick={handleAddCommentClick}
              disabled={!hasSelection}
              active={commentFormOpen}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </ToolBtn>
          </>
        )}

        {/* Accept / Reject All */}
        {showChangesBar && (
          <>
            <span className="text-xs text-blue-600 dark:text-blue-400 font-medium mr-2">
              Review suggested changes:
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 border-green-400 text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/30 gap-1"
              onMouseDown={(e) => { e.preventDefault(); handleAcceptAll(); }}
              data-testid="button-accept-all-changes"
            >
              <CheckCheck className="h-3 w-3" />
              Accept All
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] px-2 border-red-400 text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 gap-1"
              onMouseDown={(e) => { e.preventDefault(); handleRejectAll(); }}
              data-testid="button-reject-all-changes"
            >
              <XCircle className="h-3 w-3" />
              Reject All
            </Button>
          </>
        )}

        {readOnly && !showChangesBar && !trackChangesMode && (
          <span className="text-[10px] text-muted-foreground ml-1">Read-only</span>
        )}
      </div>

      {/* ── Comment Form (inline, below toolbar) ── */}
      {commentFormOpen && (
        <div className="border-b px-3 py-2.5 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-800 flex-shrink-0">
          <div className="text-[11px] font-semibold text-yellow-800 dark:text-yellow-300 mb-1.5 flex items-center gap-1.5">
            <MessageSquare className="h-3 w-3" />
            Add Comment
          </div>
          <textarea
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmitComment();
              if (e.key === "Escape") { setCommentFormOpen(false); setCommentText(""); }
            }}
            placeholder="Type your comment… (Ctrl+Enter to submit)"
            rows={2}
            autoFocus
            data-testid="textarea-comment-input"
            className="w-full text-xs border border-yellow-300 dark:border-yellow-700 rounded px-2 py-1.5 resize-none bg-white dark:bg-yellow-950/30 focus:outline-none focus:ring-1 focus:ring-amber-400 placeholder:text-muted-foreground/60"
          />
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={handleSubmitComment}
              disabled={!commentText.trim() || submittingComment}
              data-testid="button-submit-comment"
              className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-40 font-medium"
            >
              <Send className="h-3 w-3" />
              {submittingComment ? "Adding…" : "Add"}
            </button>
            <button
              onClick={() => { setCommentFormOpen(false); setCommentText(""); }}
              className="text-[11px] px-2.5 py-1 rounded border hover:bg-accent text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ── Editor Body ── */}
      <EditorContent
        editor={editor}
        className={cn(
          "flex-1",
          "[&_.tiptap-editor-content]:text-sm [&_.tiptap-editor-content]:focus-visible:outline-none",
          "[&_.tiptap-editor-content_p:first-child]:mt-0 [&_.tiptap-editor-content_p]:my-1",
          "[&_.tiptap-editor-content_ul]:list-disc [&_.tiptap-editor-content_ul]:pl-5",
          "[&_.tiptap-editor-content_ol]:list-decimal [&_.tiptap-editor-content_ol]:pl-5",
          "[&_.tiptap-editor-content_li]:my-0.5",
          "[&_.tiptap-editor-content_strong]:font-semibold [&_.tiptap-editor-content_em]:italic",
          "[&_.tiptap-editor-content_u]:underline [&_.tiptap-editor-content_s]:line-through",
          // Track changes
          "[&_.tiptap-editor-content_insert]:text-green-700 [&_.tiptap-editor-content_insert]:underline [&_.tiptap-editor-content_insert]:decoration-green-500",
          "[&_.tiptap-editor-content_delete]:text-red-600 [&_.tiptap-editor-content_delete]:line-through [&_.tiptap-editor-content_delete]:decoration-red-500",
          "dark:[&_.tiptap-editor-content_insert]:text-green-400 dark:[&_.tiptap-editor-content_delete]:text-red-400",
          // Comment mark
          "[&_.tiptap-editor-content_.comment-mark]:bg-amber-100 [&_.tiptap-editor-content_.comment-mark]:dark:bg-amber-900/40",
          "[&_.tiptap-editor-content_.comment-mark]:border-b-2 [&_.tiptap-editor-content_.comment-mark]:border-amber-400",
          "[&_.tiptap-editor-content_.comment-mark]:cursor-default",
          // Variable mark
          "[&_.tiptap-editor-content_.variable-mark]:bg-violet-100 [&_.tiptap-editor-content_.variable-mark]:dark:bg-violet-900/40",
          "[&_.tiptap-editor-content_.variable-mark]:text-violet-700 [&_.tiptap-editor-content_.variable-mark]:dark:text-violet-300",
          "[&_.tiptap-editor-content_.variable-mark]:rounded [&_.tiptap-editor-content_.variable-mark]:px-1 [&_.tiptap-editor-content_.variable-mark]:py-0.5",
          "[&_.tiptap-editor-content_.variable-mark]:text-xs [&_.tiptap-editor-content_.variable-mark]:font-mono [&_.tiptap-editor-content_.variable-mark]:font-medium",
          "[&_.tiptap-editor-content_.variable-mark]:border [&_.tiptap-editor-content_.variable-mark]:border-violet-300 [&_.tiptap-editor-content_.variable-mark]:dark:border-violet-700",
          // Tables
          "[&_.tiptap-editor-content_table]:border-collapse [&_.tiptap-editor-content_table]:w-full [&_.tiptap-editor-content_table]:my-2 [&_.tiptap-editor-content_table]:table-fixed",
          "[&_.tiptap-editor-content_th]:border [&_.tiptap-editor-content_th]:border-gray-300 [&_.tiptap-editor-content_th]:dark:border-gray-600 [&_.tiptap-editor-content_th]:px-3 [&_.tiptap-editor-content_th]:py-2 [&_.tiptap-editor-content_th]:text-left [&_.tiptap-editor-content_th]:text-xs [&_.tiptap-editor-content_th]:font-semibold [&_.tiptap-editor-content_th]:bg-gray-50 [&_.tiptap-editor-content_th]:dark:bg-gray-800",
          "[&_.tiptap-editor-content_td]:border [&_.tiptap-editor-content_td]:border-gray-300 [&_.tiptap-editor-content_td]:dark:border-gray-600 [&_.tiptap-editor-content_td]:px-3 [&_.tiptap-editor-content_td]:py-2 [&_.tiptap-editor-content_td]:text-sm [&_.tiptap-editor-content_td]:align-top",
          "[&_.tiptap-editor-content_.selectedCell]:bg-blue-50 [&_.tiptap-editor-content_.selectedCell]:dark:bg-blue-950/30",
        )}
      />

      {/* Placeholder when empty */}
      {editor && editor.isEmpty && (
        <div
          className="absolute pointer-events-none text-sm text-muted-foreground/50 px-4 py-3"
          style={{ top: 44 }}
        >
          {placeholder}
        </div>
      )}
    </div>
  );
}
