import * as repo from "./rfi.repository";
import {
  RFI_QUESTION_LIBRARY,
  RFI_QUESTION_TYPES,
  getLibraryQuestion,
  type RfiQuestionType,
} from "./rfi-question-library";

function httpError(status: number, message: string) {
  return { status, message };
}

function toAttributeKey(text: string): string {
  const slug = (text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return `custom.${slug || "untitled"}`;
}

function parseOptions(raw: unknown): string[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}

function mapCampaignRow(row: any) {
  return {
    id: row.id,
    campaignCode: row.campaign_code,
    title: row.title,
    description: row.description,
    status: row.status,
    deadline: row.deadline,
    sourcePrNumber: row.source_pr_number,
    createdBy: row.created_by,
    creationTime: row.creation_time,
    lastModifiedBy: row.last_modified_by,
    lastModificationTime: row.last_modification_time,
    publishedTime: row.published_time,
    closedTime: row.closed_time,
    supplierCount: row.supplier_count ?? 0,
    respondedCount: row.responded_count ?? 0,
  };
}

function mapSupplierRow(row: any) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierEmail: row.supplier_email,
    supplierContact: row.supplier_contact,
    status: row.status,
    isShortlisted: row.is_shortlisted ?? false,
    creationTime: row.creation_time,
  };
}

function mapQuestionRow(row: any) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    libraryId: row.library_id,
    attributeKey: row.attribute_key,
    text: row.question_text,
    type: row.question_type as RfiQuestionType,
    options: parseOptions(row.options),
    required: row.required,
    source: row.source,
    displayOrder: row.display_order,
  };
}

function mapResponseRow(row: any) {
  let value: any = row.answer_value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") value = parsed;
    } catch {
      // plain string answer — leave as-is
    }
  }
  return {
    id: row.id,
    campaignId: row.campaign_id,
    supplierId: row.supplier_id,
    questionId: row.question_id,
    value,
    submittedBy: row.submitted_by,
    submittedTime: row.submitted_time,
  };
}

export function listQuestionTypes() {
  return RFI_QUESTION_TYPES;
}

export function listQuestionLibrary() {
  return RFI_QUESTION_LIBRARY;
}

export async function listCampaigns() {
  const rows = await repo.listCampaigns();
  const campaigns = rows.map(mapCampaignRow);
  const stats = {
    total: campaigns.length,
    draft: campaigns.filter((c) => c.status === "draft").length,
    published: campaigns.filter((c) => c.status === "published").length,
    closed: campaigns.filter((c) => c.status === "closed").length,
    awaiting: campaigns
      .filter((c) => c.status === "published")
      .reduce((sum, c) => sum + Math.max(0, c.supplierCount - c.respondedCount), 0),
  };
  return { campaigns, stats };
}

export async function createCampaign(
  body: { title?: string; description?: string; deadline?: string; sourcePrNumber?: string | null },
  createdBy: string,
) {
  const title = (body.title || "").trim();
  const description = (body.description || "").trim();
  const deadline = body.deadline;
  if (!title || !description || !deadline) {
    throw httpError(400, "Title, description and response deadline are required");
  }
  const row = await repo.insertCampaign({
    title,
    description,
    deadline,
    sourcePrNumber: body.sourcePrNumber?.trim() || null,
    createdBy,
  });
  const campaignCode = `RFI-${String(row.id).padStart(5, "0")}`;
  await repo.setCampaignCode(row.id, campaignCode);
  return getCampaignDetail(row.id);
}

export async function updateCampaign(
  id: number,
  body: { title?: string; description?: string; deadline?: string },
  lastModifiedBy: string,
) {
  const existing = await repo.getCampaignRow(id);
  if (!existing) throw httpError(404, "Campaign not found");
  if (existing.status !== "draft") {
    throw httpError(409, "Only draft campaigns can be edited");
  }
  const title = (body.title || "").trim();
  const description = (body.description || "").trim();
  const deadline = body.deadline;
  if (!title || !description || !deadline) {
    throw httpError(400, "Title, description and response deadline are required");
  }
  const row = await repo.updateCampaignRow(id, { title, description, deadline, lastModifiedBy });
  if (!row) throw httpError(404, "Campaign not found");
  return mapCampaignRow(row);
}

export async function deleteCampaign(id: number) {
  const row = await repo.deleteCampaignRow(id);
  if (!row) throw httpError(404, "Campaign not found");
  return { id: row.id };
}

export async function getCampaignDetail(id: number) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");

  const [supplierRows, questionRows, responseRows] = await Promise.all([
    repo.listCampaignSuppliers(id),
    repo.listQuestions(id),
    repo.listResponses(id),
  ]);

  const campaign = mapCampaignRow(campaignRow);
  const suppliers = supplierRows.map(mapSupplierRow);
  const questions = questionRows.map(mapQuestionRow);
  const responses = responseRows.map(mapResponseRow);

  const activity: { id: string; type: string; text: string; at: string }[] = [];
  if (campaign.publishedTime) {
    activity.push({
      id: `A-published-${campaign.id}`,
      type: "published",
      text: `Campaign published — ${suppliers.length} supplier(s) invited to respond`,
      at: campaign.publishedTime,
    });
  }
  const respondedSuppliers = new Map<string, string>();
  for (const r of responses) {
    if (!respondedSuppliers.has(r.supplierId) || r.submittedTime > respondedSuppliers.get(r.supplierId)!) {
      respondedSuppliers.set(r.supplierId, r.submittedTime);
    }
  }
  for (const [supplierId, at] of respondedSuppliers) {
    const supplier = suppliers.find((s) => s.supplierId === supplierId);
    activity.push({
      id: `A-response-${supplierId}`,
      type: "response",
      text: `Response received from ${supplier?.supplierName || supplierId}`,
      at,
    });
  }
  if (campaign.closedTime) {
    activity.push({ id: `A-closed-${campaign.id}`, type: "closed", text: "Campaign closed", at: campaign.closedTime });
  }
  activity.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return { campaign, suppliers, questions, responses, activity };
}

export async function publishCampaign(id: number, user: string) {
  const [suppliers, questions] = await Promise.all([
    repo.listCampaignSuppliers(id),
    repo.listQuestions(id),
  ]);
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");
  if (campaignRow.status !== "draft") throw httpError(409, "Only draft campaigns can be published");
  if (!suppliers.length) throw httpError(400, "Invite at least one supplier before publishing");
  if (!questions.length) throw httpError(400, "Add at least one question before publishing");
  const row = await repo.setCampaignStatus(id, "published", user);
  return mapCampaignRow(row);
}

export async function closeCampaign(id: number, user: string) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");
  if (campaignRow.status !== "published") throw httpError(409, "Only published campaigns can be closed");
  const row = await repo.setCampaignStatus(id, "closed", user);
  return mapCampaignRow(row);
}

export async function inviteSuppliers(
  id: number,
  suppliers: repo.InviteSupplierInput[],
  createdBy: string,
) {
  if (!Array.isArray(suppliers) || !suppliers.length) {
    throw httpError(400, "At least one supplier is required");
  }
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");
  const inserted = await repo.insertCampaignSuppliers(id, suppliers, createdBy);
  return inserted.map(mapSupplierRow);
}

export async function removeSupplier(id: number, supplierId: string) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");
  await repo.deleteCampaignSupplier(id, supplierId);
  return { supplierId };
}

export async function setSupplierShortlist(id: number, supplierId: string, isShortlisted: boolean) {
  const row = await repo.setSupplierShortlist(id, supplierId, isShortlisted);
  if (!row) throw httpError(404, "Supplier is not part of this campaign");
  return mapSupplierRow(row);
}

export async function addQuestion(
  id: number,
  body: {
    libraryId?: string;
    text?: string;
    type?: string;
    options?: string[];
    required?: boolean;
  },
  createdBy: string,
) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");

  if (body.libraryId) {
    const libQuestion = getLibraryQuestion(body.libraryId);
    if (!libQuestion) throw httpError(404, "Library question not found");
    const row = await repo.insertQuestion({
      campaignId: id,
      libraryId: libQuestion.id,
      attributeKey: libQuestion.attributeKey,
      questionText: libQuestion.text,
      questionType: libQuestion.type,
      options: libQuestion.options ?? null,
      required: true,
      source: "library",
      createdBy,
    });
    return mapQuestionRow(row);
  }

  const text = (body.text || "").trim();
  const type = body.type || "text";
  if (!text) throw httpError(400, "Question text is required");
  const row = await repo.insertQuestion({
    campaignId: id,
    libraryId: null,
    attributeKey: toAttributeKey(text),
    questionText: text,
    questionType: type,
    options: ["single_select", "multi_select"].includes(type)
      ? body.options && body.options.length
        ? body.options
        : ["Option 1", "Option 2", "Option 3"]
      : null,
    required: !!body.required,
    source: "custom",
    createdBy,
  });
  return mapQuestionRow(row);
}

export async function updateQuestion(
  questionId: number,
  body: { text?: string; type?: string; options?: string[]; required?: boolean },
) {
  const existing = await repo.getQuestionRow(questionId);
  if (!existing) throw httpError(404, "Question not found");
  const isSelectType = (t?: string) => t === "single_select" || t === "multi_select";
  const row = await repo.updateQuestionRow(questionId, {
    questionText: body.text?.trim(),
    questionType: body.type,
    options:
      body.type !== undefined
        ? isSelectType(body.type)
          ? body.options && body.options.length
            ? body.options
            : parseOptions(existing.options) ?? ["Option 1", "Option 2", "Option 3"]
          : null
        : body.options !== undefined
          ? body.options
          : undefined,
    required: body.required,
  });
  if (!row) throw httpError(404, "Question not found");
  return mapQuestionRow(row);
}

export async function deleteQuestion(questionId: number) {
  const row = await repo.deleteQuestionRow(questionId);
  if (!row) throw httpError(404, "Question not found");
  return { id: row.id };
}

/** Throws 403 if the supplier isn't part of this campaign; returns their invite row otherwise. */
export async function assertSupplierInvited(campaignId: number, supplierId: string) {
  const suppliers = await repo.listCampaignSuppliers(campaignId);
  const row = suppliers.find((s) => String(s.supplier_id) === String(supplierId));
  if (!row) throw httpError(403, "You are not invited to this campaign");
  return row;
}

export async function listCampaignsForSupplier(supplierId: string) {
  const rows = await repo.listCampaignsForSupplier(supplierId);
  return rows.map((row) => ({
    id: row.id,
    campaignCode: row.campaign_code,
    title: row.title,
    description: row.description,
    status: row.status,
    deadline: row.deadline,
    myStatus: row.supplier_status,
    invitedTime: row.invited_time,
  }));
}

export async function getSupplierCampaignView(id: number, supplierId: string) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow || campaignRow.status === "draft") throw httpError(404, "Campaign not found");
  const supplierRow = await assertSupplierInvited(id, supplierId);

  const [questionRows, responseRows] = await Promise.all([
    repo.listQuestions(id),
    repo.listResponsesForSupplier(id, supplierId),
  ]);

  return {
    campaign: {
      id: campaignRow.id,
      campaignCode: campaignRow.campaign_code,
      title: campaignRow.title,
      description: campaignRow.description,
      status: campaignRow.status,
      deadline: campaignRow.deadline,
    },
    myStatus: supplierRow.status,
    questions: questionRows.map(mapQuestionRow),
    responses: responseRows.map(mapResponseRow),
  };
}

export async function recordResponse(
  id: number,
  supplierId: string,
  answers: Record<string, unknown>,
  submittedBy: string,
) {
  const campaignRow = await repo.getCampaignRow(id);
  if (!campaignRow) throw httpError(404, "Campaign not found");
  if (campaignRow.status !== "published") {
    throw httpError(409, "This campaign is not open for responses");
  }
  const suppliers = await repo.listCampaignSuppliers(id);
  if (!suppliers.some((s) => String(s.supplier_id) === String(supplierId))) {
    throw httpError(403, "You are not invited to this campaign");
  }
  if (!answers || typeof answers !== "object") {
    throw httpError(400, "Answers are required");
  }

  for (const [questionIdStr, value] of Object.entries(answers)) {
    const questionId = Number(questionIdStr);
    if (!Number.isFinite(questionId)) continue;
    if (value === undefined || value === null || value === "") continue;
    const answerValue = typeof value === "string" ? value : JSON.stringify(value);
    await repo.upsertResponse({
      campaignId: id,
      supplierId,
      questionId,
      answerValue,
      submittedBy,
    });
  }

  await repo.markSupplierResponded(id, supplierId);
  const responseRows = await repo.listResponses(id);
  return responseRows.filter((r) => r.supplier_id === supplierId).map(mapResponseRow);
}
