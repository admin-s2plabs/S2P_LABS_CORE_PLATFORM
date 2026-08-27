export type RfiQuestionType = "text" | "single_select" | "multi_select" | "number" | "date" | "file_upload";

export interface RfiLibraryQuestion {
  id: string;
  attributeKey: string;
  text: string;
  type: RfiQuestionType;
  options?: string[];
  category: string;
}

export interface RfiQuestion {
  id: number;
  campaignId: number;
  libraryId: string | null;
  attributeKey: string;
  text: string;
  type: RfiQuestionType;
  options: string[] | null;
  required: boolean;
  source: "library" | "custom";
  displayOrder: number;
}

export interface RfiSupplier {
  id: number;
  campaignId: number;
  supplierId: string;
  supplierName: string;
  supplierEmail: string | null;
  supplierContact: string | null;
  status: "invited" | "responded";
  isShortlisted: boolean;
  creationTime: string;
}

export type RfiAnswerValue = string | number | { name: string; size: number; type: string; url: string } | null;

export interface RfiResponse {
  id: number;
  campaignId: number;
  supplierId: string;
  questionId: number;
  value: RfiAnswerValue;
  submittedBy: string;
  submittedTime: string;
}

export interface RfiCampaignDetail {
  campaign: {
    id: number;
    campaignCode: string;
    title: string;
    description: string;
    status: "draft" | "published" | "closed";
    deadline: string;
    sourcePrNumber: string | null;
    createdBy: string;
    creationTime: string;
    publishedTime: string | null;
    closedTime: string | null;
    supplierCount: number;
    respondedCount: number;
  };
  suppliers: RfiSupplier[];
  questions: RfiQuestion[];
  responses: RfiResponse[];
  activity: { id: string; type: string; text: string; at: string }[];
}

export function isFileAnswer(value: RfiAnswerValue): value is { name: string; size: number; type: string; url: string } {
  return !!value && typeof value === "object" && "url" in value;
}

export interface RfiSupplierCampaignListItem {
  id: number;
  campaignCode: string;
  title: string;
  description: string;
  status: "published" | "closed";
  deadline: string;
  myStatus: "invited" | "responded";
  invitedTime: string;
}

export interface RfiSupplierCampaignView {
  campaign: {
    id: number;
    campaignCode: string;
    title: string;
    description: string;
    status: "published" | "closed";
    deadline: string;
  };
  myStatus: "invited" | "responded";
  questions: RfiQuestion[];
  responses: RfiResponse[];
}
