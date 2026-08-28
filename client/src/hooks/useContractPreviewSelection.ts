import { type RefObject, useCallback, useEffect, useRef, useState } from "react";

export interface PreviewSelection {
  kind: "block" | "text";
  sectionKey: string;
  label: string;
  selectedText?: string;
}

// Anchor point (top edge, horizontal center) for the floating toolbar, in the
// parent document's viewport coordinates (position: fixed).
export interface ToolbarAnchor {
  top: number;
  left: number;
}

export type FormatCommand =
  | { type: "bold" | "italic" | "underline" }
  | { type: "fontFamily" | "fontSize" | "color"; value: string };

interface PreviewRect { top: number; left: number; width: number; height: number }

interface PreviewMessage {
  source?: string;
  type: string;
  sectionKey?: string;
  label?: string;
  selectedText?: string;
  rect?: PreviewRect;
}

const cssEscape = (s: string) => s.replace(/["\\]/g, "\\$&");

// Clause sections carry data-section-key on the outer .clause-section box, but only
// .clause-body should be treated as the editable/serializable content — the heading
// stays generated. Tier-2 fixed pages carry data-section-key on a display:contents
// wrapper whose own innerHTML *is* the editable content.
function contentRootFor(el: HTMLElement): HTMLElement {
  if (el.classList.contains("clause-section")) {
    return (el.querySelector(".clause-body") as HTMLElement) || el;
  }
  return el;
}

// display:contents wrappers render no box, so the visible outline goes on the
// enclosing .page instead; real clause boxes outline themselves.
function outlineTargetFor(el: HTMLElement): HTMLElement {
  const win = el.ownerDocument.defaultView;
  const display = win?.getComputedStyle(el).display;
  if (display === "contents") return (el.closest(".page") as HTMLElement) || el;
  return el;
}

export function useContractPreviewSelection(iframeRef: RefObject<HTMLIFrameElement | null>) {
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [toolbarPos, setToolbarPos] = useState<ToolbarAnchor | null>(null);
  const [editingSectionKey, setEditingSectionKey] = useState<string | null>(null);
  const selectionRef = useRef<PreviewSelection | null>(null);
  selectionRef.current = selection;
  const editingSectionKeyRef = useRef<string | null>(null);
  editingSectionKeyRef.current = editingSectionKey;

  const computeAnchor = useCallback((rect: PreviewRect): ToolbarAnchor | null => {
    const iframeEl = iframeRef.current;
    if (!iframeEl) return null;
    const box = iframeEl.getBoundingClientRect();
    return { top: box.top + rect.top, left: box.left + rect.left + rect.width / 2 };
  }, [iframeRef]);

  const findSectionEl = useCallback((sectionKey: string): HTMLElement | null => {
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return null;
    return doc.querySelector(`[data-section-key="${cssEscape(sectionKey)}"]`);
  }, [iframeRef]);

  // Force-commit whatever section is currently mid-edit (contentEditable) by blurring
  // its content root — reuses beginTextEdit's own onBlur commit logic verbatim. Needed
  // before any deselect (Escape, clicking outside the document) so an in-progress edit
  // isn't stranded with an uncommitted, still-editable DOM node.
  const commitActiveEdit = useCallback(() => {
    const key = editingSectionKeyRef.current;
    if (!key) return;
    const el = findSectionEl(key);
    const root = el && contentRootFor(el);
    root?.blur();
  }, [findSectionEl]);

  // Re-apply the outline + toolbar for the currently-tracked selection after the
  // iframe reloads (full document regeneration) — fires automatically on the
  // preview's "copilot:ready" message.
  const reselectAfterReload = useCallback(() => {
    const sel = selectionRef.current;
    if (!sel) return;
    const el = findSectionEl(sel.sectionKey);
    if (!el) { setSelection(null); setToolbarPos(null); return; }
    const target = outlineTargetFor(el);
    target.classList.add("copilot-selected");
    const rect = target.getBoundingClientRect();
    setToolbarPos(computeAnchor({ top: rect.top, left: rect.left, width: rect.width, height: rect.height }));
  }, [findSectionEl, computeAnchor]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const iframeEl = iframeRef.current;
      if (!iframeEl || event.source !== iframeEl.contentWindow) return;
      const data = event.data as PreviewMessage;
      if (!data || data.source !== "contract-copilot-preview") return;

      switch (data.type) {
        case "copilot:block-selected":
        case "copilot:text-selected": {
          if (!data.sectionKey || !data.rect) break;
          setSelection({
            kind: data.type === "copilot:text-selected" ? "text" : "block",
            sectionKey: data.sectionKey,
            label: data.label || data.sectionKey,
            selectedText: data.selectedText,
          });
          setToolbarPos(computeAnchor(data.rect));
          break;
        }
        case "copilot:deselected":
          commitActiveEdit();
          setSelection(null);
          setToolbarPos(null);
          break;
        case "copilot:scroll":
          setToolbarPos(null);
          break;
        case "copilot:ready":
          reselectAfterReload();
          break;
        case "copilot:selection-invalid":
        default:
          break;
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [iframeRef, computeAnchor, reselectAfterReload, commitActiveEdit]);

  const clearSelection = useCallback(() => {
    commitActiveEdit();
    setSelection(null);
    setToolbarPos(null);
    const doc = iframeRef.current?.contentDocument;
    doc?.querySelectorAll(".copilot-selected").forEach((el) => el.classList.remove("copilot-selected"));
  }, [iframeRef, commitActiveEdit]);

  const getSectionHtml = useCallback((sectionKey: string): { html: string; fingerprint?: string } | null => {
    const el = findSectionEl(sectionKey);
    if (!el) return null;
    return { html: contentRootFor(el).innerHTML, fingerprint: el.getAttribute("data-fingerprint") || undefined };
  }, [findSectionEl]);

  const setSectionHtml = useCallback((sectionKey: string, html: string) => {
    const el = findSectionEl(sectionKey);
    if (!el) return;
    contentRootFor(el).innerHTML = html;
  }, [findSectionEl]);

  const wrapRangeWithSpan = (range: Range, styleText: string, doc: Document) => {
    if (range.startContainer === range.endContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
      const span = doc.createElement("span");
      span.setAttribute("style", styleText);
      range.surroundContents(span);
      return;
    }
    const frag = range.extractContents();
    const span = doc.createElement("span");
    span.setAttribute("style", styleText);
    span.appendChild(frag);
    range.insertNode(span);
  };

  const styleTextFor = (cmd: FormatCommand): string => {
    switch (cmd.type) {
      case "bold": return "font-weight:bold";
      case "italic": return "font-style:italic";
      case "underline": return "text-decoration:underline";
      case "fontFamily": return `font-family:${cmd.value}`;
      case "fontSize": return `font-size:${cmd.value}`;
      case "color": return `color:${cmd.value}`;
    }
  };

  // Apply direct formatting to the current selection inside the iframe DOM and
  // return the serialized section HTML so the caller can persist it. Naive
  // two-state toggle for bold/italic/underline in v1 (no nested-span cleanup).
  const applyFormat = useCallback((cmd: FormatCommand): string | null => {
    const doc = iframeRef.current?.contentDocument;
    const sel = selectionRef.current;
    if (!doc || !sel) return null;
    const el = findSectionEl(sel.sectionKey);
    if (!el) return null;
    const root = contentRootFor(el);
    const styleText = styleTextFor(cmd);
    const [prop, value] = styleText.split(":");
    const camel = prop.trim().replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

    const win = doc.defaultView;
    const domSel = win?.getSelection();

    if (sel.kind === "text" && domSel && domSel.rangeCount && !domSel.isCollapsed) {
      const range = domSel.getRangeAt(0);
      wrapRangeWithSpan(range, styleText, doc);
      domSel.removeAllRanges();
    } else {
      const style = root.style as unknown as Record<string, string>;
      style[camel] = style[camel] === value.trim() ? "" : value.trim();
    }

    root.querySelectorAll("span").forEach((span) => {
      if (!span.textContent || !span.textContent.trim()) span.remove();
    });

    return root.innerHTML;
  }, [findSectionEl, iframeRef]);

  // Direct manual typing: make the current selection's section content-editable in
  // place, focus it, and commit the edited HTML back to the caller on blur. Reuses
  // the same section-root resolution as applyFormat/getSectionHtml so Tier-1/Tier-2
  // routing on the caller side needs no changes.
  const beginTextEdit = useCallback((onCommit: (html: string) => void) => {
    const sel = selectionRef.current;
    if (!sel) return;
    const el = findSectionEl(sel.sectionKey);
    if (!el) return;
    const root = contentRootFor(el);
    root.setAttribute("contenteditable", "true");
    root.focus();
    setEditingSectionKey(sel.sectionKey);
    const onBlur = () => {
      root.removeEventListener("blur", onBlur);
      root.removeAttribute("contenteditable");
      setEditingSectionKey(null);
      onCommit(root.innerHTML);
    };
    root.addEventListener("blur", onBlur);
  }, [findSectionEl]);

  return { selection, clearSelection, toolbarPos, applyFormat, getSectionHtml, setSectionHtml, editingSectionKey, beginTextEdit };
}
