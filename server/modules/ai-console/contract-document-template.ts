/**
 * Contract document HTML — same structure as the canonical contract preview
 * (`GET /api/contracts/:id/preview` in contracts.controller.ts): full A4 paginated
 * document with Title page → Table of Contents → Glossary → Introduction →
 * Signatory → JS-paginated clause sections → Appendix A (Scope of Work).
 *
 * Driven by the in-progress Co-Pilot draft instead of a saved contract, so:
 *   - signing is disabled (a Draft is not signable) — no sign widgets/overlay
 *   - no inline comments / track-changes (none exist on a draft)
 *   - clauses come from the draft's special clauses, free-form terms, and the
 *     payment / delivery / inspection / obligations the user has entered
 *
 * Returned as a complete standalone HTML document — render it in an <iframe>.
 */

type Draft = Record<string, any>;

export interface SectionOverrideMap {
  [sectionKey: string]: { html: string; base_fingerprint: string };
}

// Small deterministic hash (djb2) used to fingerprint Tier-2 (template-generated)
// section HTML, so a user's saved override can be dropped once the underlying
// data changes enough that the override no longer applies cleanly.
export function fingerprint(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// Tier-2 sections (payment/delivery tables, title/glossary/intro/signatory/SOW) are
// template-generated rather than stored as HTML fields. Resolve the section's generated
// HTML against a matching saved override (same fingerprint of the underlying generated
// content) — if the data changed since the override was made, the fingerprint no longer
// matches and the freshly generated content wins. Used both when building a fresh draft
// and when an already-saved contract is loaded into the Co-Pilot for live editing (see
// POST /api/contracts/copilot/from-contract in contract-copilot.controller.ts) — this
// template renders both cases identically.
export function resolveSectionOverride(
  overrides: SectionOverrideMap,
  sectionKey: string,
  generatedHtml: string,
): { html: string; fp: string } {
  const fp = fingerprint(generatedHtml);
  const ov = overrides?.[sectionKey];
  return { html: ov && ov.base_fingerprint === fp ? ov.html : generatedHtml, fp };
}

function escHtml(s: any): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Wrap a Tier-2 fixed-page section with the selection attrs (interactive mode only).
// display:contents keeps the wrapper invisible to layout (so it's safe to drop into
// flex pages like the title page) while the DOM node is still there for click
// delegation (`.closest('[data-section-key]')`) and HTML serialization.
export function wrapInteractiveSection(
  sectionKey: string,
  label: string,
  html: string,
  fp: string,
  interactive: boolean,
): string {
  if (!interactive) return html;
  return `<div data-section-key="${sectionKey}" data-section-label="${escHtml(label)}" data-fingerprint="${fp}" style="display:contents">${html}</div>`;
}

// Click/highlight-to-select + postMessage bridge for the interactive (WYSIWYG) preview.
// Fully generic — references nothing from contractData — so the same script serves both
// a fresh draft and an existing contract loaded into the Co-Pilot for live editing.
export function interactiveSelectionScript(): string {
  return `
<script>
(function(){
  function post(payload) {
    try { window.parent.postMessage(Object.assign({ source: 'contract-copilot-preview' }, payload), '*'); } catch (e) {}
  }
  function labelFor(el) {
    return el.getAttribute('data-section-label') || el.getAttribute('data-section-key') || '';
  }
  // display:contents wrappers (Tier-2 fixed pages) render no box of their own,
  // so outline the enclosing .page instead; real clause boxes outline themselves.
  function outlineTarget(el) {
    return window.getComputedStyle(el).display === 'contents' ? (el.closest('.page') || el) : el;
  }

  var selectedBox = null;
  function clearSelection() {
    if (selectedBox) { selectedBox.classList.remove('copilot-selected'); selectedBox = null; }
  }
  function selectEl(el) {
    clearSelection();
    selectedBox = outlineTarget(el);
    selectedBox.classList.add('copilot-selected');
  }

  document.addEventListener('click', function(e) {
    if (e.target.closest('.toolbar')) return;
    var sel = document.getSelection();
    if (sel && !sel.isCollapsed && sel.toString().trim()) return; // let mouseup's text-selected stand
    var el = e.target.closest('[data-section-key]');
    if (!el) { clearSelection(); post({ type: 'copilot:deselected' }); return; }
    selectEl(el);
    var rect = outlineTarget(el).getBoundingClientRect();
    post({
      type: 'copilot:block-selected',
      sectionKey: el.getAttribute('data-section-key'),
      label: labelFor(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  });

  document.addEventListener('mouseup', function(e) {
    if (e.target.closest('.toolbar')) return;
    var sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    var text = sel.toString();
    if (!text.trim()) return;
    var range = sel.getRangeAt(0);
    var startEl = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    var endEl = range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement;
    var startSection = startEl && startEl.closest('[data-section-key]');
    var endSection = endEl && endEl.closest('[data-section-key]');
    if (!startSection || startSection !== endSection) { post({ type: 'copilot:selection-invalid' }); return; }
    selectEl(startSection);
    var rect = range.getBoundingClientRect();
    post({
      type: 'copilot:text-selected',
      sectionKey: startSection.getAttribute('data-section-key'),
      label: labelFor(startSection),
      selectedText: text,
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { clearSelection(); post({ type: 'copilot:deselected' }); }
  });

  window.addEventListener('scroll', function() { post({ type: 'copilot:scroll' }); }, true);

  function ready() { post({ type: 'copilot:ready' }); }
  // Registered after the pagination script's own fonts.ready callback (the clause-section
  // pagination script tag is emitted earlier in the document), so build() has already
  // cloned clause sections into #clause-pages by the time this runs.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { setTimeout(ready, 30); });
  } else {
    setTimeout(ready, 150);
  }
})();
</script>`;
}

export function buildContractDocumentHtml(contractData: Draft, opts?: { interactive?: boolean }): string {
  const contract = contractData || {};
  const interactive = !!opts?.interactive;
  const overrides: SectionOverrideMap = contract._content_overrides || {};

  const resolveOverride = (sectionKey: string, generatedHtml: string): { html: string; fp: string } =>
    resolveSectionOverride(overrides, sectionKey, generatedHtml);
  const tier2 = (sectionKey: string, label: string, generatedInner: string): string => {
    const { html, fp } = resolveOverride(sectionKey, generatedInner);
    return wrapInteractiveSection(sectionKey, label, html, fp, interactive);
  };

  const esc = (s: any) => escHtml(s);
  const num = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };

  const getOrdinal = (d: number) => {
    if (d >= 11 && d <= 13) return `${d}th`;
    switch (d % 10) { case 1: return `${d}st`; case 2: return `${d}nd`; case 3: return `${d}rd`; default: return `${d}th`; }
  };
  const monthNames = ["JANUARY","FEBRUARY","MARCH","APRIL","MAY","JUNE","JULY","AUGUST","SEPTEMBER","OCTOBER","NOVEMBER","DECEMBER"];
  const formatDate = (d: any) => {
    if (!d) return "N/A";
    const dt = new Date(d);
    if (isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  };
  const getAgreementDate = (d: any) => {
    const dt = d ? new Date(d) : new Date();
    return { day: getOrdinal(dt.getDate()), month: monthNames[dt.getMonth()], year: dt.getFullYear() };
  };

  // ── Parties / refs ──
  const firstPartyName = contract.buyer_organization || contract.org_name || "Aqaar – Ajman Properties Corporation";
  const secondPartyName = contract.supplier_name || contract.vendor_name || "Vendor";
  const contractTitle = contract.title || "Contract Document";
  const refNo = contract.contr_ref_no || (contract.id ? String(contract.id) : "DRAFT");
  const version = contract.version || "1.0";

  const firstPartyAddr = "";
  const suppContactName = contract.supplier_contact || "Authorized Representative";
  const suppDesignationStr = contract.supplier_designation || "";
  const suppAddr = contract.supplier_address || contract.supplier_site || "";

  // ── Signatory (a draft is not signable: static blocks, no sign widgets) ──
  const orgSigner = "Authorised Representative";
  const orgDesignation = "";
  const suppSigner = suppContactName;
  const suppSignerDesig = suppDesignationStr;
  const hasAuthSignatory = false;
  const authSignatoryName = "", authSignatoryDesig = "";
  const vendorPortalUserName = "", vendorPortalUserDesig = "";

  const agDate = getAgreementDate(contract.start_date);

  // ── Build clauses from the draft ──
  const wrapText = (body: string) => {
    const s = String(body || "");
    if (/<[a-z][\s\S]*>/i.test(s)) return s; // already HTML
    if (!s.trim()) return "<p><em>No content provided.</em></p>";
    return s.split(/\n{2,}/).map(p => `<p>${esc(p).replace(/\n/g, "<br/>")}</p>`).join("");
  };
  const paymentTable = (rows: any[]) => `
    <table><thead><tr><th>Description</th><th>Type</th><th>%</th><th>Amount</th></tr></thead>
    <tbody>${rows.map((p: any) => `<tr><td>${esc(p.name || p.description || "")}</td><td>${esc(p.payment_type || "")}</td><td>${esc(p.pcnt_milestone ?? "")}</td><td>${esc(p.amt_milestone ?? "")}</td></tr>`).join("")}</tbody></table>`;
  const deliveryTable = (rows: any[]) => `
    <table><thead><tr><th>Milestone</th><th>Details</th><th>Type</th><th>Date</th><th>%</th><th>Amount</th></tr></thead>
    <tbody>${rows.map((m: any) => `<tr><td>${esc(m.name || m.deliverable_name || "")}</td><td>${esc(m.details || "")}</td><td>${esc(m.schedule_type || "")}</td><td>${esc(m.schedule_date ? formatDate(m.schedule_date) : "")}</td><td>${esc(m.pcnt_milestone ?? "")}</td><td>${esc(m.amt_milestone ?? "")}</td></tr>`).join("")}</tbody></table>`;

  const clauses: Array<{ id: string; terms_name: string; term_details: string; sectionKey: string; fingerprint?: string }> = [];
  let ci = 1;
  // Editing an already-saved contract (loaded via /copilot/from-contract): clauses are
  // the raw cm_contracts_terms rows, keyed by their real DB row id (`clause:${id}`) so
  // an edit can be written straight back with a plain UPDATE — no special_clause/term/
  // inspection/failure split needed since that split only exists to shape a brand-new
  // INSERT in /copilot/save.
  const loadedClauses: Array<{ id: string; terms_name: string; term_details: string }> | undefined = contract._loaded_clauses;
  if (loadedClauses) {
    for (const c of loadedClauses) {
      clauses.push({ id: `c${ci++}`, terms_name: c.terms_name || "Clause", term_details: wrapText(c.term_details || ""), sectionKey: `clause:${c.id}` });
    }
  } else {
    for (const cl of (contract.special_clauses || [])) {
      clauses.push({ id: `c${ci++}`, terms_name: cl.type || cl.name || "Special Clause", term_details: wrapText(cl.content || cl.text || ""), sectionKey: `special_clause:${cl.id}` });
    }
    for (const t of (contract.terms || [])) {
      if (!t.name && !t.content) continue;
      clauses.push({ id: `c${ci++}`, terms_name: t.name || "Term", term_details: wrapText(t.content || ""), sectionKey: `term:${t.id || "i" + ci}` });
    }
    if (contract.inspection_criteria && String(contract.inspection_criteria).trim()) {
      clauses.push({ id: `c${ci++}`, terms_name: "Inspection & Acceptance Criteria", term_details: wrapText(contract.inspection_criteria), sectionKey: "inspection" });
    }
  }
  const payments = contract.payment_terms || [];
  if (payments.length) {
    const { html, fp } = resolveOverride("payment_table", paymentTable(payments));
    clauses.push({ id: `c${ci++}`, terms_name: "Payment Terms", term_details: html, sectionKey: "payment_table", fingerprint: fp });
  }
  const delivery = contract.delivery_milestones || [];
  if (delivery.length && contract.include_delivery !== false) {
    const { html, fp } = resolveOverride("delivery_table", deliveryTable(delivery));
    clauses.push({ id: `c${ci++}`, terms_name: "Delivery Schedule", term_details: html, sectionKey: "delivery_table", fingerprint: fp });
  }
  if (!loadedClauses && contract.failure_obligations && String(contract.failure_obligations).trim()) {
    clauses.push({ id: `c${ci++}`, terms_name: "Vendor Failure Obligations", term_details: wrapText(contract.failure_obligations), sectionKey: "failure" });
  }

  // ── Scope of Work (Appendix A) ──
  const sowRows = (contract.scope_of_work || []).map((s: any) => {
    const total = s.total_cost != null && s.total_cost !== "" ? num(s.total_cost) : (num(s.quantity) * num(s.unit_cost) || null);
    return {
      type: s.type || s.item_name || s.name || "",
      description: s.description || "",
      quantity: s.quantity ?? "",
      uom: s.uom || "",
      unit_cost: s.unit_cost != null && s.unit_cost !== "" ? num(s.unit_cost) : null,
      total_cost: total,
      deliverydate: s.deliverydate || s.schedule_date || null,
    };
  });
  const hasSow = sowRows.length > 0;

  const tocRows = [
    ...clauses.map((c: any, i: number) =>
      `<tr data-toc-idx="${i}"><td class="toc-num">${i + 1}.</td><td class="toc-title">${esc(c.terms_name)}</td><td class="toc-dots"></td><td class="toc-page" data-toc-page>—</td></tr>`
    ),
    ...(hasSow ? [`<tr data-toc-sow><td class="toc-num"></td><td class="toc-title"><strong>Appendix A &ndash; Scope of Work</strong></td><td class="toc-dots"></td><td class="toc-page" data-toc-page>—</td></tr>`] : []),
  ].join("");

  const glossaryItems: Array<[string, string]> = [
    ["AED", "means UAE currency abbreviation."],
    ["Agreement", "and similar expressions mean this Vendor Portal Implementation Agreement including all its Appendixes and all instruments supplementing, amending, or confirming this Agreement. All references to Articles or Sections mean and refer to the specified Article or Section of this Agreement except where a different agreement is explicitly identified."],
    ["First Party", " means the entity preparing and submitting the Proposal."],
    ["Second Party", "means the entity for whom the Proposal is prepared"],
    ["Ajman", "means the Emirate of Ajman, a city in the United Arab Emirates."],
    ["AQAAR", "refers to Ajman Properties Corporation, Ajman, United Arab Emirates."],
    ["Change Order", "means any written documentation between the First Party and Second Party evidencing their agreement to change aspects of this Agreement."],
    ["Technical Proposal", "means the Proposal prepared by First Party for Second Party describing the technical solution, scope of work, and implementation methodology"],
    ["Commercial Proposal", "means the Proposal prepared by First Party for Second Party setting out the pricing, payment terms, and other commercial conditions"],
    ["Force Majeure", "means any event or circumstances beyond the reasonable control of and without the fault or negligence of the Party claiming the existence of such event, which shall include, without limitation, failure or interruption of the production, delivery or acceptance of electricity due to: an act of god; war (declared or undeclared); sabotage; riot; insurrection; civil unrest or disturbance; military or guerrilla action; terrorism; economic sanction or embargo; widespread civil strike, work stoppage, slow-down, or lock-out; explosion; fire; earthquake; abnormal weather condition or actions of the elements; hurricane; flood; lightning; wind and drought."],
    ["ITD", "means Information Technology Department."],
    ["SLA", "means Service Level Agreement."],
    ["UAE", "means United Arab Emirates."],
  ];
  const glossaryHtml = glossaryItems.map(([term, def]) =>
    `<div class="glossary-item"><span class="gloss-term">&quot;${esc(term)}&quot;</span> ${def}</div>`
  ).join("\n");

  // ── Footer helpers ──
  const footerRefParts = refNo.split("-");
  const footerRef = footerRefParts.length > 1
    ? [...footerRefParts.slice(0, -1), "F", footerRefParts[footerRefParts.length - 1]].join("-")
    : refNo;
  const revisionDisplay = (version || "0").toString().includes(".") ? (version || "0") : `${version || "0"}.0`;
  const todayD = new Date();
  const todayFormatted = `${String(todayD.getDate()).padStart(2, "0")}/${String(todayD.getMonth() + 1).padStart(2, "0")}/${todayD.getFullYear()}`;
  const totalPages = 5 + clauses.length + (hasSow ? 1 : 0);
  const confidentialityText = "This document is the property of First Party. It must not be reproduced in whole or in part or otherwise disclosed without prior written consent.";
  const pageFooter = (n: number) => `
<div class="page-footer">
  <div class="footer-top">
    <span>${esc(footerRef)}</span>
    <span>Revision ${esc(revisionDisplay)}; Dated: ${todayFormatted}</span>
    <span>Page ${n} of ${totalPages}</span>
  </div>
  <div class="footer-bottom">${confidentialityText}</div>
</div>`;

  // ── {{variable}} substitution inside clause bodies ──
  const contractVariableMap: Record<string, string> = {
    status: contract.status || "Draft",
    version: String(contract.version || ""),
    contr_ref_no: refNo, ref_no: refNo, contract_ref_no: refNo,
    title: contract.title || "", description: contract.description || "",
    start_date: contract.start_date ? formatDate(contract.start_date) : "",
    end_date: contract.end_date ? formatDate(contract.end_date) : "",
    creation_date: contract.creation_date ? formatDate(contract.creation_date) : "",
    org_name: firstPartyName, organization: firstPartyName,
    first_party: firstPartyName, second_party: secondPartyName,
    supplier_name: secondPartyName, vendor_name: secondPartyName,
    owner_name: contract.owner_name || "", owner: contract.owner_name || "",
    department: contract.department_name || "", department_name: contract.department_name || "",
    currency: contract.currency || "", contract_amount: String(contract.contract_amount || ""), amount: String(contract.contract_amount || ""),
    project_name: contract.project_name || "", project_ref_no: contract.project_ref_no || "",
    org_signer_name: orgSigner, org_signer_designation: orgDesignation,
    supp_signer_name: suppSigner, supp_signer_designation: suppSignerDesig,
  };
  const replaceVariables = (html: string): string =>
    html.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
      const k = key.trim().toLowerCase();
      return contractVariableMap[k] !== undefined ? contractVariableMap[k] : _match;
    });

  const clauseSectionsInner = clauses.map((c: any, i: number) => {
    const rawHtml = c.term_details || "<p><em>No content provided.</em></p>";
    const resolvedHtml = replaceVariables(rawHtml);
    const htmlContent = resolvedHtml
      .replace(/<insert(\s[^>]*)?>/gi, '<span class="tc-insert"$1>')
      .replace(/<\/insert>/gi, '</span>')
      .replace(/<delete(\s[^>]*)?>/gi, '<span class="tc-delete"$1>')
      .replace(/<\/delete>/gi, '</span>');
    const selAttrs = interactive
      ? ` data-section-key="${c.sectionKey}" data-section-label="${esc(c.terms_name)}"${c.fingerprint ? ` data-fingerprint="${c.fingerprint}"` : ""}`
      : "";
    return `<div class="clause-section" data-clause-id="${c.id}" data-clause-idx="${i}"${selAttrs}><h2 class="clause-heading">${i + 1}. ${esc(c.terms_name)}</h2><div class="clause-body">${htmlContent}</div></div>`;
  }).join("");

  const clauseFooterData = JSON.stringify({
    footerRef: footerRef,
    rev: revisionDisplay,
    dated: todayFormatted,
    totalPages: totalPages,
    startPage: 6,
    confidentiality: confidentialityText,
    hasSow: hasSow,
    fixedPages: 5,
  });

  const clauseSections = clauses.length === 0 ? "" : `
<!-- ══════════════ CLAUSE SECTIONS (JS-paginated) ══════════════ -->
<!-- Hidden off-screen container used only for height measurement -->
<div id="clause-measure" style="position:fixed;left:-99999px;top:0;width:170mm;visibility:hidden;pointer-events:none;font-family:'Times New Roman',Times,serif;font-size:11pt;line-height:1.65;">
  ${clauseSectionsInner}
</div>
<!-- Pages injected here by buildClausePages() -->
<div id="clause-pages"></div>
<script>
(function(){
  var D = ${clauseFooterData};

  function makeFooter(n) {
    return '<div class="page-footer">' +
      '<div class="footer-top">' +
      '<span>' + D.footerRef + '</span>' +
      '<span>Revision ' + D.rev + '; Dated: ' + D.dated + '</span>' +
      '<span>Page ' + n + ' of ' + D.totalPages + '</span>' +
      '</div>' +
      '<div class="footer-bottom">' + D.confidentiality + '</div>' +
      '</div>';
  }

  function build() {
    var mEl = document.getElementById('clause-measure');
    var pEl = document.getElementById('clause-pages');
    if (!mEl || !pEl) return;

    var sections = Array.from(mEl.querySelectorAll('.clause-section'));
    if (!sections.length) { mEl.remove(); return; }

    var MM = 3.7795275591;
    var availH = (297 - 22 - 22) * MM - 80;

    var pages = [], grp = [], acc = 0;
    sections.forEach(function(el) {
      var h = el.offsetHeight + 36;
      if (acc + h > availH && grp.length) { pages.push(grp); grp = []; acc = 0; }
      grp.push(el); acc += h;
    });
    if (grp.length) pages.push(grp);

    var actualTotalPages = D.fixedPages + pages.length + (D.hasSow ? 1 : 0);

    if (actualTotalPages !== D.totalPages) {
      document.querySelectorAll('.page-footer .footer-top span:last-child').forEach(function(span) {
        span.textContent = span.textContent.replace(/of \\d+/, 'of ' + actualTotalPages);
      });
    }

    var clausePageMap = {};
    pages.forEach(function(bucket, pi) {
      var pageNum = D.startPage + pi;
      bucket.forEach(function(el) {
        var idx = el.getAttribute('data-clause-idx');
        if (idx !== null) clausePageMap[idx] = pageNum;
      });
    });

    document.querySelectorAll('[data-toc-idx]').forEach(function(row) {
      var idx = row.getAttribute('data-toc-idx');
      var cell = row.querySelector('[data-toc-page]');
      if (cell && clausePageMap[idx] !== undefined) {
        cell.textContent = clausePageMap[idx];
      }
    });

    var sowRow = document.querySelector('[data-toc-sow]');
    if (sowRow) {
      var sowCell = sowRow.querySelector('[data-toc-page]');
      if (sowCell) sowCell.textContent = D.fixedPages + pages.length + 1;
    }

    pages.forEach(function(bucket, pi) {
      var page = document.createElement('div');
      page.className = 'page page-break-before';

      var wrap = document.createElement('div');
      wrap.className = 'clause-page-content';
      bucket.forEach(function(el) { wrap.appendChild(el.cloneNode(true)); });
      page.appendChild(wrap);

      var ft = document.createElement('div');
      ft.innerHTML = makeFooter(D.startPage + pi);
      if (ft.firstElementChild) page.appendChild(ft.firstElementChild);

      pEl.appendChild(page);
    });

    mEl.remove();
  }

  function init() {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(build);
    } else {
      setTimeout(build, 120);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
</script>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${esc(contractTitle)} &mdash; Contract Preview</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 22mm 20mm 26mm 20mm; }
  body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #1a1a1a; background: #f3f4f6; line-height: 1.55; overflow-x: hidden; }

  .toolbar { position: fixed; top: 0; left: 0; right: 0; z-index: 999; background: #f8fafc; color: #475569; border-bottom: 1px solid #e2e8f0; padding: 6px 16px; display: flex; align-items: center; gap: 8px; font-family: sans-serif; font-size: 12px; }
  .toolbar .doc-label { color: #64748b; font-size: 11px; font-weight: 500; }
  .toolbar button { background: #fff; color: #475569; border: 1px solid #cbd5e1; border-radius: 5px; padding: 4px 10px; font-size: 11px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: color .15s, border-color .15s, background .15s; }
  .toolbar button:hover { color: #1e293b; border-color: #94a3b8; background: #f1f5f9; }
  @media print { .toolbar { display: none !important; } body { background: #fff; } }

  .pages { margin-top: 38px; padding: 20px 0; overflow-x: hidden; }
  @media print { .pages { margin-top: 0; padding: 0; } }

  .page { width: min(210mm, calc(100vw - 24px)); min-height: 290mm; margin: 0 auto 28px; padding: 22mm 20mm 22mm; background: #fff; box-shadow: 0 2px 14px rgba(0,0,0,.13); position: relative; box-sizing: border-box; display: flex; flex-direction: column; }
  @media (max-width: 700px) { .page { padding: 14mm 12mm; } }
  @media print { .page { box-shadow: none; margin: 0; padding: 18mm 18mm 18mm; width: 100%; min-height: 250mm; } }
  .page-break-before { break-before: page; page-break-before: always; }

  .clause-page-content { flex: 1; }
  .clause-section { margin-bottom: 28px; break-inside: avoid; page-break-inside: avoid; overflow: hidden; max-width: 100%; }
  .clause-section:not(:last-child) { padding-bottom: 20px; border-bottom: 1px solid #e5e7eb; }

  .title-page { display: flex; flex-direction: column; align-items: center; min-height: 250mm; }
  .title-page .logo-wrap { margin: 0 auto 20px; width: 80px; height: 80px; border-radius: 50%; background: #e2e8f0; display: flex; align-items: center; justify-content: center; }
  .title-page .logo-wrap svg { width: 44px; height: 44px; color: #475569; }
  .title-page .org-name { font-size: 13pt; font-weight: bold; color: #1e293b; text-align: center; margin-bottom: 6px; }
  .title-page .sep-heavy { width: 100%; border: none; border-top: 2.5px solid #1e293b; margin: 10px 0 4px; }
  .title-page .sep-light { width: 100%; border: none; border-top: 1px solid #94a3b8; margin: 4px 0 10px; }
  .title-page .spacer { flex: 1; min-height: 40px; }
  .title-page .vendor-name { font-size: 18pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; text-align: center; margin-bottom: 8px; }
  .title-page .contract-title { font-size: 13pt; font-weight: bold; text-transform: uppercase; color: #374151; text-align: center; margin-bottom: 24px; }
  .title-page .doc-sep { width: 100%; border: none; border-top: 1.5px solid #1e293b; margin: 10px 0 14px; }
  .title-page .doc-info { font-size: 10pt; color: #4b5563; text-align: center; }

  .section-title { font-size: 14pt; font-weight: bold; text-align: center; letter-spacing: .3px; margin-bottom: 6px; }
  .section-rule { border: none; border-top: 1.5px solid #1e293b; margin-bottom: 18px; }

  .toc-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  .toc-table td { padding: 5px 4px; font-size: 11pt; vertical-align: bottom; }
  .toc-num { width: 30px; white-space: nowrap; color: #374151; }
  .toc-title { font-weight: bold; }
  .toc-dots { border-bottom: 1px dotted #94a3b8; min-width: 80px; }
  .toc-page { text-align: right; white-space: nowrap; width: 44px; font-weight: bold; color: #1e40af; }

  .glossary-item { margin-bottom: 7px; text-align: justify; line-height: 1.6; border: 1px solid #1a1a1a; padding: 6px 8px; }
  .gloss-term { font-weight: bold; }

  .legal-body { font-size: 11pt; line-height: 1.7; text-align: justify; }
  .legal-body p { margin-bottom: 10px; }
  .legal-body .party-name { font-weight: bold; }
  .legal-body .indent { margin-left: 28px; margin-bottom: 10px; }
  .legal-body .center-bold { text-align: center; font-weight: bold; font-size: 12pt; margin: 14px 0; }
  .legal-body .clause-item { margin-bottom: 8px; line-height: 1.6; }
  .preamble-heading { font-size: 12pt; font-weight: bold; margin: 12px 0 6px; }

  .sign-section { margin-top: 0; }
  .sign-title { font-size: 14pt; font-weight: bold; text-align: center; margin-bottom: 6px; }
  .sign-rule { border: none; border-top: 1.5px solid #1e293b; margin-bottom: 20px; }
  .sign-party-label { font-size: 11pt; font-weight: bold; margin-bottom: 6px; }
  .sign-content { margin-left: 28px; margin-bottom: 16px; font-size: 11pt; line-height: 1.7; }
  .sign-line-right { text-align: right; font-size: 11pt; letter-spacing: 1px; margin-top: 24px; }
  .sign-above { text-align: right; font-size: 10pt; color: #6b7280; margin-top: 2px; }
  .sign-statement { text-align: right; font-size: 10.5pt; line-height: 1.6; margin-top: 8px; }
  .blank-lines { text-align: center; margin-top: 36px; }
  .blank-lines p { margin-bottom: 14px; font-size: 12pt; letter-spacing: 2px; color: #374151; }

  .clause-heading { font-size: 13pt; font-weight: bold; margin-bottom: 12px; color: #1e293b; border-left: 4px solid #3b82f6; padding-left: 10px; padding-top: 2px; padding-bottom: 2px; }
  .clause-body { font-size: 11pt; line-height: 1.65; text-align: justify; word-break: break-word; overflow-wrap: break-word; }
  .clause-body p { margin-bottom: 8px; }
  .clause-body ul, .clause-body ol { padding-left: 22px; margin-bottom: 8px; }
  .clause-body li { margin-bottom: 4px; }
  .clause-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
  .clause-body table td, .clause-body table th { border: 1px solid #d1d5db; padding: 6px 10px; font-size: 10.5pt; }
  .clause-body table th { background: #f1f5f9; font-weight: bold; }
  .clause-body strong, .clause-body b { font-weight: bold; }
  .clause-body em, .clause-body i { font-style: italic; }

  .page-footer { margin-top: auto; padding-top: 12px; border-top: 1px solid #374151; font-family: Arial, Helvetica, sans-serif; font-size: 7.5pt; color: #374151; flex-shrink: 0; }
  .clauses-page .page-footer { margin-top: 24px; }
  .page-footer .footer-top { display: flex; justify-content: space-between; margin-bottom: 3px; }
  .page-footer .footer-bottom { text-align: center; font-style: italic; color: #4b5563; }

  .tc-insert { display:inline; color:#166534; text-decoration:underline; text-decoration-color:#16a34a; background:#dcfce7; border-radius:2px; padding:0 2px; font-weight:500; }
  .tc-delete { display:inline; color:#991b1b; text-decoration:line-through; text-decoration-color:#dc2626; background:#fee2e2; border-radius:2px; padding:0 2px; }
  .comment-mark { background:#fef9c3; border-bottom:2px solid #eab308; border-radius:1px; }
${interactive ? `
  [data-section-key] { cursor: text; }
  [data-section-key]:hover { outline: 1px dashed #c4b5fd; outline-offset: 3px; }
  .copilot-selected { outline: 2px solid #8b5cf6 !important; outline-offset: 3px; border-radius: 2px; }
  @media print { [data-section-key], .copilot-selected { outline: none !important; cursor: auto; } }
` : ""}
</style>
</head>
<body>

<div class="toolbar">
  <span class="doc-label">${esc(contractTitle)}</span>
  <span style="margin-left:auto;opacity:.5;font-size:11px;">Ref: ${esc(refNo)}</span>
  <button onclick="window.print()" title="Print or Save as PDF">
    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Print / PDF
  </button>
</div>

<div class="pages">

<!-- ══════════════ PAGE 1: TITLE PAGE ══════════════ -->
<div class="page title-page">
  ${tier2("title", "Title Page", `
  <div class="logo-wrap">
    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
  </div>
  <p class="org-name">${esc(firstPartyName)}</p>
  <hr class="sep-heavy"/>
  <hr class="sep-light"/>
  <div class="spacer" style="flex:0.2;min-height:16px;max-height:24mm;"></div>
  <p class="vendor-name">${esc(secondPartyName)}</p>
  <p class="contract-title">${esc(contractTitle)}</p>
  <hr class="doc-sep"/>
  <p class="doc-info">
    Document Ref: ${esc(refNo)} &nbsp;&bull;&nbsp; Version ${esc(version)} &nbsp;&bull;&nbsp; ${formatDate(contract.start_date || new Date())}
  </p>
  <div class="spacer"></div>
  `)}
  ${pageFooter(1)}
</div>

<!-- ══════════════ PAGE 2: TABLE OF CONTENTS ══════════════ -->
<div class="page page-break-before">
  <p class="section-title">Table of Contents</p>
  <hr class="section-rule"/>
  <table class="toc-table">
    <tbody>
      ${tocRows}
    </tbody>
  </table>
  ${pageFooter(2)}
</div>

<!-- ══════════════ PAGE 3: GLOSSARY ══════════════ -->
<div class="page page-break-before">
  ${tier2("glossary", "Glossary", `
  <p class="section-title">GLOSSARY</p>
  <hr class="section-rule"/>
  <p style="font-size:11pt;margin-bottom:14px;font-weight:bold;">Definitions:</p>
  <p style="font-size:11pt;margin-bottom:16px;text-align:justify;">
    Throughout this Agreement, except as otherwise expressly provided, the following words and expressions shall have <strong>the following meanings</strong>:
  </p>
  ${glossaryHtml}
  `)}
  ${pageFooter(3)}
</div>

<!-- ══════════════ PAGE 4: INTRODUCTION ══════════════ -->
<div class="page page-break-before">
  ${tier2("intro", "Introduction", `
  <div class="legal-body">
    <p><strong>THIS AGREEMENT,</strong> is made on ${agDate.day} of ${agDate.month} ${agDate.year} by and between</p>

    <p class="indent">
      <span class="party-name">${esc(firstPartyName)}</span>
      ${firstPartyAddr ? ` a company incorporated under the UAE Laws and having its registered office at ${esc(firstPartyAddr)}` : ""}
    </p>

    <p class="indent">(Hereinafter referred to as the <strong>First Party</strong> and/or Aqaar)</p>

    <p class="center-bold">And</p>

    <p class="indent">
      <span class="party-name">${esc(secondPartyName)}</span>
      ${suppAddr ? ` Address: ${esc(suppAddr)}` : ""}
      ${suppContactName !== "Authorized Representative" ? ` represented by the authorised representative Mr. ${esc(suppContactName)}${suppDesignationStr ? ` (${esc(suppDesignationStr)})` : ""}` : ""}
    </p>

    <p>
      The First Party engages the Second Party to
      <strong>${esc(contract.title || "")}</strong>${contract.description ? `, <strong>${esc(contract.description)}</strong>` : ""},
      in accordance with the specifications outlined in this Agreement.
      The Second Party agrees to deliver these services within the stipulated Agreement Period.
    </p>

    <p><strong>(Together referred to as &ldquo;the Parties&rdquo; and individually as &ldquo;First Party&rdquo; and &ldquo;Second Party&rdquo;).</strong></p>

    <p>Now, therefore, the Parties agree as follows:</p>

    <p class="clause-item">
      <strong>A.</strong>&ensp;The First Party hereby engages the Second Party, and the Second Party agrees, to provide
      <strong>annual maintenance, support, and licensing services</strong>
      for the Document Management System (DMS) licensed by the First Party, in accordance with the terms, conditions, and specifications set forth in this Agreement.
    </p>

    <p class="clause-item">
      <strong>B.</strong>&ensp;The Second Party shall deliver the Services to the First Party in strict accordance with the provisions of this Agreement, including but not limited to system maintenance, updates, technical support, and license compliance, during the Agreement Period specified herein.
    </p>

    <p><strong>Therefore</strong> the parties herein in their full capacities have mutually agreed on the following terms and conditions:</p>

    <p class="preamble-heading">Preamble</p>
    <p>The preamble shall be considered to be an integral part of this Agreement and shall be read with it as one unit.</p>
  </div>
  `)}
  ${pageFooter(4)}
</div>

<!-- ══════════════ PAGE 5: SIGNATORY ══════════════ -->
<div class="page page-break-before">
  ${tier2("signatory", "Signatory", `
  <div class="sign-section">
    <p class="sign-title">SIGNATORY</p>
    <hr class="sign-rule"/>

    <p class="sign-party-label">Second Party:</p>
    <div class="sign-content">
      ${(() => {
        const name2 = hasAuthSignatory ? authSignatoryName
          : (vendorPortalUserName || suppSigner || "Authorized Representative");
        const desig2 = hasAuthSignatory ? authSignatoryDesig
          : (vendorPortalUserDesig || suppSignerDesig || "");
        return `<p>Name: <strong>${esc(name2)}</strong></p>
      ${desig2 ? `<p>Designation: <strong>${esc(desig2)}</strong></p>` : ""}
      <p>as authorised representative for the Second Party</p>`;
      })()}
    </div>

    <p class="sign-line-right">________________________________________</p>
    <p class="sign-above">(Sign above)</p>
    <div class="sign-statement">
      <p>By executing this Agreement <strong>${esc(secondPartyName)}</strong></p>
      <p><strong>LLC &ndash; Second Party</strong> warrants that he/she is duly</p>
      <p>authorised to execute this Agreement on behalf of</p>
      <p>the Second Party</p>
    </div>

    <div style="margin-top:32px;"></div>

    <p class="sign-party-label">First Party:</p>
    <div class="sign-content">
      <p>Name: <strong>${esc(orgSigner)}</strong></p>
      ${orgDesignation ? `<p>Designation: <strong>${esc(orgDesignation)}</strong></p>` : ""}
      <p>as authorised representative for the First Party</p>
    </div>

    <p class="sign-line-right">________________________________________</p>
    <p class="sign-above">(Sign above)</p>
    <div class="sign-statement">
      <p>By executing this Agreement <strong>${esc(firstPartyName)}</strong></p>
      <p><strong>&ndash; First Party</strong> warrants that he/she is</p>
      <p>duly authorised to execute this Agreement on</p>
      <p>behalf of the First Party</p>
    </div>

    <div class="blank-lines">
      <p>____________________________________________________________</p>
      <p>____________________________________________________________</p>
      <p>____________________________________________________________</p>
    </div>
  </div>
  `)}
  ${pageFooter(5)}
</div>

<!-- ══════════════ CLAUSE SECTIONS ══════════════ -->
${clauseSections}

${hasSow ? `
<!-- ══════════════ APPENDIX A: SCOPE OF WORK ══════════════ -->
<div class="page page-break-before">
  ${tier2("sow", "Scope of Work (Appendix A)", `
  <p class="section-title">APPENDIX A &ndash; SCOPE OF WORK</p>
  <hr class="section-rule"/>
  <p style="font-size:11pt;margin-bottom:14px;font-weight:bold;">Scope of Work Details:</p>
  <table style="width:100%;border-collapse:collapse;font-size:10pt;font-family:'Times New Roman',Times,serif;">
    <thead>
      <tr style="background:#e8e8e8;">
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:left;">Type</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:left;">Item Description</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Qty</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Unit</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Unit Cost</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Total Cost</th>
        <th style="border:1px solid #aaa;padding:6px 8px;text-align:center;">Delivery Date</th>
      </tr>
    </thead>
    <tbody>
      ${sowRows.map((s: any) => `
      <tr>
        <td style="border:1px solid #ccc;padding:5px 8px;">${esc(s.type || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;">${esc(s.description || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${esc(s.quantity || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${esc(s.uom || "")}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${s.unit_cost != null ? Number(s.unit_cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:right;">${s.total_cost != null ? Number(s.total_cost).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
        <td style="border:1px solid #ccc;padding:5px 8px;text-align:center;">${s.deliverydate ? formatDate(s.deliverydate) : ""}</td>
      </tr>`).join("")}
    </tbody>
    ${(() => {
      const grandTotal = sowRows.reduce((sum: number, s: any) => sum + (s.total_cost ? Number(s.total_cost) : 0), 0);
      return grandTotal > 0 ? `
      <tfoot>
        <tr style="background:#f5f5f5;font-weight:bold;">
          <td colspan="5" style="border:1px solid #aaa;padding:6px 8px;text-align:right;">Grand Total</td>
          <td style="border:1px solid #aaa;padding:6px 8px;text-align:right;">${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td style="border:1px solid #aaa;padding:6px 8px;"></td>
        </tr>
      </tfoot>` : "";
    })()}
  </table>
  `)}
  ${pageFooter(5 + clauses.length + 1)}
</div>` : ""}

</div><!-- /pages -->

${interactive ? interactiveSelectionScript() : ""}

</body>
</html>`;

  return html;
}
