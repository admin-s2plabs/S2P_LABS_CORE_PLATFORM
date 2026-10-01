import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSheet } from "@/components/form-sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { DboSupplier } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  BadgeDollarSign,
  Clock,
  Download,
  GripVertical,
  Loader2,
  PiggyBank,
  ScrollText,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import * as XLSX from "xlsx";

const CREATE_NEW_TEMPLATE_VALUE = "Create New Template";

interface TemplateOption {
  value: string;
  label: string;
}

/** Match select options when cell stores id, numeric id, or display name. */
function findTemplateOption(
  opts: TemplateOption[],
  raw: unknown
): TemplateOption | undefined {
  if (raw == null || raw === "") return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;
  const byValue = opts.find((p) => String(p.value) === s);
  if (byValue) return byValue;
  const n = Number(s);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    const byNum = opts.find((p) => Number(p.value) === n);
    if (byNum) return byNum;
  }
  const sl = s.toLowerCase();
  return opts.find((p) => String(p.label).trim().toLowerCase() === sl);
}

const INPUT_TYPE_OPTS: TemplateOption[] = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "file", label: "File" },
  { value: "select", label: "Select" },
];

const EDITABLE_BY_OPTS: TemplateOption[] = [
  { value: "Supplier", label: "Supplier" },
  { value: "Buyer", label: "Buyer" },
];

interface TemplateBuilderColumn {
  columnId: string;
  columnName: string;
  columnType: string;
  editableBy: string;
  formula: string;
  viewedBy: string;
  preDefinedColumn?: boolean;
  isError?: boolean;
  errorColumnName?: string;
  errorColumnType?: string;
  errorEditableBy?: string;
}

/** Default columns when opening Create Template (matches legacy createNewTemplateToggle). */
const DEFAULT_TEMPLATE_BUILDER_COLUMNS: TemplateBuilderColumn[] = [
  {
    columnId: "C",
    columnName: "Item Name",
    columnType: "Select",
    editableBy: "Buyer",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnId: "C",
    columnName: "Quantity",
    columnType: "Number",
    editableBy: "Buyer",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnId: "C",
    columnName: "Delivery Location",
    columnType: "Select",
    editableBy: "Buyer",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnId: "C",
    columnName: "Price",
    columnType: "Number",
    editableBy: "Supplier",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnId: "C",
    columnName: "Total",
    columnType: "Number",
    editableBy: "Supplier",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
];

const PRE_DEFINED_ROW_POOL: Omit<TemplateBuilderColumn, "columnId">[] = [
  {
    columnName: "Buyer Attachments",
    columnType: "File",
    editableBy: "Buyer",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnName: "Supplier Attachments",
    columnType: "File",
    editableBy: "Supplier",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
  {
    columnName: "Minimum Bid Difference",
    columnType: "Number",
    editableBy: "Buyer",
    formula: "",
    viewedBy: "Both",
    preDefinedColumn: true,
  },
];

interface ColumnDefRow {
  columnId: string;
  columnName: string;
  columnType: string;
  editableBy: string;
  formula?: string;
  viewedBy: string;
}

interface ColumnValueCell {
  columnId: string;
  columnValue: string | number | undefined;
  viewedBy?: string;
  editableBy?: string;
  isError?: boolean;
  isUOMError?: boolean;
  columnUOMValue?: string;
  formula?: string;
  id?: number;
  isNew?: boolean;
}

/** Per-supplier price cap for this line (legacy supplierWisePriceCap → row.suppWiseCap). */
interface SuppWiseCapEntry {
  suppId: number;
  supplierName: string;
  price: number;
  columnValue?: string;
}

interface AuctionTermsRow {
  id: number;
  module_name?: string;
  tnc_text?: string;
  status?: number;
}

interface TemplateDataRow {
  columnValues: ColumnValueCell[];
  templateId?: number;
  id?: number;
  buyerDocsMapping?: unknown;
  suppDocsMapping?: unknown;
  uom?: string;
  /** Line-level savings budget (Line Item savings mode). */
  savingsAmount?: string;
  /** Caps per supplier for this line item. */
  suppWiseCap?: SuppWiseCapEntry[];
}

interface CreateAuctionFormData {
  auctionType: "Reverse" | "Forward";
  eventName: string;
  eventNameErr: boolean;
  selectTemplate: string;
  selectTemplateErr: boolean;
  templateLoader: boolean;
  prNumber: string;
  auAuctionEventTemplateColumnDefs: ColumnDefRow[];
  auAuctionEventTemplateData: TemplateDataRow[];
  productList: TemplateOption[];
  locations: TemplateOption[];
  uomList: TemplateOption[];
  eventDuration: number;
  eventDurationErr: boolean;
  selectedEventValue: string;
  eventOpts: TemplateOption[];
  selectedDeliveryDate: string;
  deliveryDateErr: boolean;
  scheduleEvent: boolean;
  selectedScheduleDate: string;
  allotment: string;
  selectedSuppliers: { selectedValue: string; suppId: number }[];
  isBasket: boolean;
  auctionStratergy: string;
  savingsValue: "Line Item" | "Gross Item";
  /** Gross budget or line-item reference amount (legacy savingsPrice). */
  savingsPrice: string;
  /** For Line Item: compare savings against base price vs total (legacy). */
  savingsReferenceKind: "Price" | "Total Amount";
  currency: string;
  /** Event extension: if a bid arrives in the last N units, extend the event. */
  eventExtensionLast: string;
  eventExtend: string;
  eventExtensionLastUnit: string;
  eventExtensionExtendUnit: string;
}

function getColumnDefsFromTemplate(raw: Record<string, unknown>): ColumnDefRow[] {
  let defs =
    raw?.auAuctionEventTemplateColumnDefs ??
    raw?.au_auction_event_template_column_defs;
  if (defs == null && raw?.attribute1 != null) {
    const a1 = raw.attribute1;
    if (typeof a1 === "string") {
      try {
        defs = JSON.parse(a1);
      } catch {
        defs = [];
      }
    } else if (Array.isArray(a1)) {
      defs = a1;
    }
  }
  let parsed: unknown = defs;
  if (typeof defs === "string") {
    try {
      parsed = JSON.parse(defs);
    } catch {
      parsed = [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map((el: Record<string, unknown>) => ({
    columnId: String(el.columnId ?? el.column_id ?? ""),
    columnName: String(el.columnName ?? el.column_name ?? ""),
    columnType: String(el.columnType ?? el.column_type ?? "text"),
    editableBy: String(el.editableBy ?? el.editable_by ?? "Buyer"),
    formula: el.formula != null ? String(el.formula) : "",
    viewedBy: String(el.viewedBy ?? el.viewed_by ?? "Both"),
  }));
}

function buildEmptyRowFromDefs(defs: ColumnDefRow[]): ColumnValueCell[] {
  return defs.map((element, idx) => ({
    columnId: element.columnId || `C${idx + 1}`,
    columnValue: "",
    viewedBy: element.viewedBy,
    editableBy: element.editableBy,
  }));
}

function toApiAuctionType(t: CreateAuctionFormData["auctionType"]): string {
  const map: Record<string, string> = {
    Reverse: "Reverse Auction",
    Forward: "Forward Auction"
  };
  return map[t] ?? `${t} Auction`;
}

function getMinimumDeliveryDate(duration: number, unitLabel: string): Date {
  const now = new Date();
  switch (unitLabel) {
    case "Mins":
      return new Date(now.getTime() + duration * 60 * 1000);
    case "Hrs":
    case "Hours":
      return new Date(now.getTime() + duration * 60 * 60 * 1000);
    case "Days":
      return new Date(now.getTime() + duration * 24 * 60 * 60 * 1000);
    default:
      return now;
  }
}

const initialFormData: CreateAuctionFormData = {
  auctionType: "Reverse",
  eventName: "",
  eventNameErr: false,
  selectTemplate: "",
  selectTemplateErr: false,
  templateLoader: false,
  prNumber: "",
  auAuctionEventTemplateColumnDefs: [],
  auAuctionEventTemplateData: [],
  productList: [],
  locations: [],
  uomList: [],
  eventDuration: 60,
  eventDurationErr: false,
  selectedEventValue: "Mins",
  eventOpts: [
    { value: "Mins", label: "Mins" },
    { value: "Hrs", label: "Hours" },
    { value: "Days", label: "Days" },
  ],
  selectedDeliveryDate: "",
  deliveryDateErr: false,
  scheduleEvent: false,
  selectedScheduleDate: "",
  allotment: "",
  selectedSuppliers: [],
  isBasket: false,
  auctionStratergy: "",
  savingsValue: "Line Item",
  savingsPrice: "",
  savingsReferenceKind: "Price",
  currency: "INR",
  eventExtensionLast: "",
  eventExtend: "",
  eventExtensionLastUnit: "Mins",
  eventExtensionExtendUnit: "Mins",
};

export default function CreateAuctions() {
  const [open, setOpen] = useState(true);
  const [formData, setFormData] = useState<CreateAuctionFormData>(initialFormData);
  const [submitting, setSubmitting] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [suppliersSheetOpen, setSuppliersSheetOpen] = useState(false);
  const [supplierSearch, setSupplierSearch] = useState("");
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);
  const [templateBuilderName, setTemplateBuilderName] = useState("");
  const [templateBuilderNameErr, setTemplateBuilderNameErr] = useState(false);
  const [templateBuilderColumns, setTemplateBuilderColumns] = useState<TemplateBuilderColumn[]>([]);
  const [templateBuilderDropMenu, setTemplateBuilderDropMenu] = useState<
    { formLabel: string; name: string; checked: boolean }[]
  >([
    { formLabel: "Buyer Attachments", name: "Buyer Attachments", checked: false },
    { formLabel: "Supplier Attachments", name: "Supplier Attachments", checked: false },
    { formLabel: "Minimum Bid Difference", name: "Minimum Bid Difference", checked: false },
  ]);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  /** Pending draft template rows to apply once templateDetail loads. */
  const draftRowsRef = useRef<TemplateDataRow[] | null>(null);
  /** Guard to prevent re-populating from draft on subsequent renders. */
  const draftPopulated = useRef(false);
  const excelFileInputRef = useRef<HTMLInputElement>(null);
  const [uploadExcelOpen, setUploadExcelOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importedFile, setImportedFile] = useState<File | null>(null);

  const [extensionOpen, setExtensionOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [priceCapOpen, setPriceCapOpen] = useState(false);
  const [tncOpen, setTncOpen] = useState(false);
  const [selectedTncList, setSelectedTncList] = useState<{ tncId: number; selectedValue: string }[]>([]);
  const [tncDescription, setTncDescription] = useState("");
  const [tncDescriptionErr, setTncDescriptionErr] = useState(false);
  /** Working inputs for supplier price cap modal (legacy supplierWisePriceCapData). */
  const [supplierWisePriceCapData, setSupplierWisePriceCapData] = useState<
    { columnValue: string; suppId: number; supplierName: string; price: number }[]
  >([]);
  const [selectedSuppPCSupplier, setSelectedSuppPCSupplier] = useState<{
    value: number;
    label: string;
  } | null>(null);

  const { toast } = useToast();
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const draftId = useMemo(() => {
    const p = new URLSearchParams(searchString);
    const v = Number(p.get("draftId"));
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [searchString]);

  const { data: draftAuctionData } = useQuery<Record<string, unknown>>({
    queryKey: ["/api/auctionEvents/getAuctionEventDetailsById", draftId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getAuctionEventDetailsById/${draftId}`);
      if (!res.ok) throw new Error("Failed to load draft auction");
      return res.json();
    },
    enabled: draftId != null,
  });

  const { data: templatesRaw = [], isLoading: templatesLoading } = useQuery<Record<string, unknown>[]>({
    queryKey: ["/api/auctionEvents/getAllEventTemplates"],
  });

  const { data: suppliersResponse } = useQuery<{ data: DboSupplier[] }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500 }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500");
      if (!res.ok) throw new Error("Failed to load suppliers");
      return res.json();
    },
  });

  const { data: itemsResponse } = useQuery<{ items: { id: string; name: string }[] }>({
    queryKey: ["/api/items", "create-auction"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/items?page=1&limit=500");
      if (!res.ok) throw new Error("Failed to load items");
      return res.json();
    },
  });

  const { data: locationsData = [] } = useQuery<
    { id: number; location_name: string; status: string }[]
  >({
    queryKey: ["/api/locations"],
  });

  const { data: uomLookups = [] } = useQuery<
    { lookup_value?: string; lookup_key?: string }[]
  >({
    queryKey: ["/api/lookups/by-property/UOM"],
  });

  const { data: termsList = [], isLoading: termsLoading } = useQuery<AuctionTermsRow[]>({
    queryKey: ["/api/terms-conditions", "AUCTIONS", "create-auction"],
    queryFn: async (): Promise<AuctionTermsRow[]> => {
      const res = await apiRequest("GET", "/api/terms-conditions?page=1&limit=300");
      if (!res.ok) return [];
      const json = (await res.json()) as { data?: AuctionTermsRow[] };
      const rows: AuctionTermsRow[] = json.data ?? [];
      return rows.filter(
        (r: AuctionTermsRow) => String(r.module_name ?? "").toUpperCase() === "AUCTIONS"
      );
    },
  });

  const createTncMutation = useMutation({
    mutationFn: async (text: string) => {
      const res = await apiRequest("POST", "/api/terms-conditions", {
        module_name: "AUCTIONS",
        tnc_text: text.trim(),
      });
      return res.json() as Promise<{ id?: number }>;
    },
    onSuccess: async () => {
      setTncDescription("");
      setTncDescriptionErr(false);
      await queryClient.invalidateQueries({
        queryKey: ["/api/terms-conditions", "AUCTIONS", "create-auction"],
      });
      toast({ title: "Terms added", description: "Terms & conditions created successfully." });
    },
    onError: (e: unknown) => {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Could not create terms",
        variant: "destructive",
      });
    },
  });

  const { data: templateDetail, isFetching: templateDetailLoading } = useQuery({
    queryKey: ["/api/auctionEvents/getEventTemplateById", selectedTemplateId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/auctionEvents/getEventTemplateById/${selectedTemplateId}`);
      if (!res.ok) throw new Error("Failed to load template");
      return res.json() as Promise<Record<string, unknown>>;
    },
    enabled: selectedTemplateId != null && selectedTemplateId > 0,
  });

  const templatesList: TemplateOption[] = useMemo(() => {
    const list = Array.isArray(templatesRaw) ? templatesRaw : [];
    const mapped = list.map((t) => ({
      value: String((t as { id?: number }).id ?? ""),
      label: String((t as { name?: string }).name ?? ""),
    })).filter((x) => x.value && x.label);
    return [{ value: CREATE_NEW_TEMPLATE_VALUE, label: CREATE_NEW_TEMPLATE_VALUE }, ...mapped];
  }, [templatesRaw]);

  useEffect(() => {
    const products =
      itemsResponse?.items?.map((p) => ({
        value: String(p.id),
        label: p.name,
      })) ?? [];
    const locs = (locationsData || [])
      .filter((l) => l.status === "Y")
      .map((l) => ({
        value: String(l.id),
        label: l.location_name,
      }));
    const uoms = uomLookups.map((u) => ({
      value: u.lookup_value ?? u.lookup_key ?? "",
      label: u.lookup_value ?? u.lookup_key ?? "",
    })).filter((u) => u.value);
    setFormData((prev) => ({
      ...prev,
      productList: products,
      locations: locs,
      uomList: uoms.length ? uoms : [{ value: "EA", label: "EA" }],
    }));
  }, [itemsResponse, locationsData, uomLookups]);

  useEffect(() => {
    if (!templateDetail || selectedTemplateId == null || selectedTemplateId <= 0) return;
    const defs = getColumnDefsFromTemplate(templateDetail);
    const pendingDraftRows = draftRowsRef.current;
    draftRowsRef.current = null;
    const rows: TemplateDataRow[] = pendingDraftRows?.length
      ? pendingDraftRows
      : [{
          columnValues: buildEmptyRowFromDefs(defs),
          templateId: 0,
          buyerDocsMapping: null,
          suppDocsMapping: null,
        }];
    setFormData((prev) => ({
      ...prev,
      auAuctionEventTemplateColumnDefs: defs,
      auAuctionEventTemplateData: rows,
      templateLoader: false,
    }));
  }, [templateDetail, selectedTemplateId]);

  useEffect(() => {
    if (selectedTemplateId != null && selectedTemplateId > 0) {
      setFormData((prev) => ({ ...prev, templateLoader: templateDetailLoading }));
    }
  }, [selectedTemplateId, templateDetailLoading]);

  useEffect(() => {
    if (!open) {
      navigate("/app/auctions");
    }
  }, [navigate, open]);

  useEffect(() => {
    if (!draftAuctionData || draftPopulated.current) return;
    draftPopulated.current = true;

    const d = draftAuctionData as Record<string, unknown>;

    // Auction type: "Reverse Auction" → "Reverse", "Forward Auction" → "Forward"
    const auctionType: "Reverse" | "Forward" =
      String(d.auctionType ?? "").includes("Forward") ? "Forward" : "Reverse";

    // Delivery date: ISO → "YYYY-MM-DD"
    const toDateStr = (v: unknown): string => {
      if (!v) return "";
      try { return new Date(String(v)).toISOString().split("T")[0]; } catch { return ""; }
    };
    // Schedule date: ISO → "YYYY-MM-DDTHH:MM" for datetime-local input
    const toDateTimeLocalStr = (v: unknown): string => {
      if (!v) return "";
      try { return new Date(String(v)).toISOString().slice(0, 16); } catch { return ""; }
    };

    const savingsValue = (String(d.auctionSavingMeasure ?? "Line Item")) as "Line Item" | "Gross Item";
    let savingsPrice = "";
    let savingsReferenceKind: "Price" | "Total Amount" = "Price";
    if (savingsValue === "Gross Item") {
      savingsPrice = String(d.auctionSavingReference ?? "");
    } else {
      savingsReferenceKind = (String(d.auctionSavingReference ?? "Price")) as "Price" | "Total Amount";
      savingsPrice = String(d.auctionSavingReferenceValue ?? "");
    }

    // Template rows from API (auctionRows with auctionEventRowColumn)
    const apiRows = Array.isArray(d.templateRows) ? (d.templateRows as Record<string, unknown>[]) : [];
    const draftRows: TemplateDataRow[] = apiRows.map((row) => {
      const cols = Array.isArray(row.auctionEventRowColumn)
        ? (row.auctionEventRowColumn as Record<string, unknown>[])
        : [];
      return {
        columnValues: cols.map((col) => ({
          columnId: String(col.columnId ?? ""),
          columnValue: col.columnValue != null ? String(col.columnValue) : "",
          viewedBy: String(col.viewedBy ?? "Both"),
          editableBy: String(col.editableBy ?? "Buyer"),
        })),
        id: row.auRowId != null ? Number(row.auRowId) : undefined,
        templateId: 0,
        buyerDocsMapping: null,
        suppDocsMapping: null,
        savingsAmount: row.savingsAmount != null ? String(row.savingsAmount) : undefined,
        suppWiseCap: Array.isArray(row.suppWiseCap) ? (row.suppWiseCap as SuppWiseCapEntry[]) : [],
      };
    });

    // Suppliers: eventDetails.suppIds are full supplier objects
    const suppObjects = Array.isArray(d.suppIds) ? (d.suppIds as Record<string, unknown>[]) : [];
    const selectedSuppliers = suppObjects.map((s) => ({
      selectedValue: String(s.companyName ?? s.company_name ?? ""),
      suppId: Number(s.id),
    }));

    // TNCs
    const tncObjects = Array.isArray(d.tncs) ? (d.tncs as Record<string, unknown>[]) : [];
    const tncList = tncObjects.map((t) => ({
      tncId: Number(t.id),
      selectedValue: String(t.tnc_text ?? ""),
    }));

    const templateIdNum = d.templateId != null ? Number(d.templateId) : null;

    // Store draft rows in ref so template detail useEffect can pick them up
    if (draftRows.length > 0) {
      draftRowsRef.current = draftRows;
    }

    setFormData((prev) => ({
      ...prev,
      auctionType,
      eventName: String(d.name ?? ""),
      eventNameErr: false,
      prNumber: String(d.prNumber ?? ""),
      eventDuration: Number(d.auctionDuration ?? 0),
      selectedEventValue: String(d.auctionDurationUnits ?? "Mins"),
      selectedDeliveryDate: toDateStr(d.deliveryDate),
      scheduleEvent: String(d.isScheduledEvent) === "Y",
      selectedScheduleDate: toDateTimeLocalStr(d.startTime),
      allotment: String(d.allotmentType ?? ""),
      isBasket: String(d.isBasket) === "Y",
      auctionStratergy: String(d.auctionStrategy ?? ""),
      savingsValue,
      savingsPrice,
      savingsReferenceKind,
      currency: String(d.currency ?? "INR"),
      eventExtensionLast: d.ifBidInLastMinutesInMins ? String(d.ifBidInLastMinutesInMins) : "",
      eventExtend: d.acutiontTimeExtensionInMins ? String(d.acutiontTimeExtensionInMins) : "",
      eventExtensionLastUnit: String(d.ifBidInLastMinutesInMinsUnit ?? "Mins"),
      eventExtensionExtendUnit: String(d.acutiontTimeExtensionInMinsUnit ?? "Mins"),
      selectedSuppliers,
      selectTemplate: templateIdNum ? String(templateIdNum) : prev.selectTemplate,
    }));

    if (tncList.length > 0) {
      setSelectedTncList(tncList);
    }

    if (templateIdNum && templateIdNum > 0) {
      setSelectedTemplateId(templateIdNum);
    }
  }, [draftAuctionData]);

  const createAuctionMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await apiRequest("POST", "/api/auctionEvents/createAuctionEvent", payload);
      return res.json() as Promise<{ eventId?: number }>;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getLiveAuctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getScheduledAuctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getClosedAuctions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getDraftAuctions"] });
      setOpen(false);
      const eventId = data?.eventId;
      const isUpdate = draftId != null;
      toast({
        title: isUpdate ? "Auction Published" : "Auction Created",
        description: eventId
          ? `Auction #${eventId} has been ${isUpdate ? "published" : "created"} successfully.`
          : `Auction ${isUpdate ? "published" : "created"} successfully.`,
      });
      if (eventId) {
        navigate(`/app/auction-details/${eventId}`);
      } else {
        navigate("/app/auctions");
      }
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Failed to create auction";
      toast({ title: "Error", description: message, variant: "destructive" });
      setSubmitting(false);
    },
    onMutate: () => {
      setSubmitting(true);
    },
    onSettled: () => {
      setSubmitting(false);
    },
  });

  const resetTemplateBuilder = useCallback(() => {
    setTemplateBuilderName("");
    setTemplateBuilderNameErr(false);
    setTemplateBuilderColumns(DEFAULT_TEMPLATE_BUILDER_COLUMNS.map((c) => ({ ...c })));
    setTemplateBuilderDropMenu([
      { formLabel: "Buyer Attachments", name: "Buyer Attachments", checked: false },
      { formLabel: "Supplier Attachments", name: "Supplier Attachments", checked: false },
      { formLabel: "Minimum Bid Difference", name: "Minimum Bid Difference", checked: false },
    ]);
  }, []);

  const openCreateTemplateBuilder = useCallback(() => {
    resetTemplateBuilder();
    setCreateTemplateOpen(true);
  }, [resetTemplateBuilder]);

  const closeCreateTemplateBuilder = useCallback(() => {
    setCreateTemplateOpen(false);
    resetTemplateBuilder();
  }, [resetTemplateBuilder]);

  const createTemplateMutation = useMutation({
    mutationFn: async (body: { name: string; auAuctionEventTemplateColumnDefs: Record<string, unknown>[] }) => {
      const now = new Date().toISOString();
      const res = await apiRequest("POST", "/api/auctionEvents/createEventTemplate", {
        ...body,
        createdBy: "User",
        creationTime: now,
        lastModifiedBy: "User",
        lastModificationTime: now,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auctionEvents/getAllEventTemplates"] });
      toast({ title: "Template created", description: "Template Created Successfully" });
      closeCreateTemplateBuilder();
    },
    onError: (e: unknown) => {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Could not create template",
        variant: "destructive",
      });
    },
  });

  const handleBuilderInputChange = (index: number, field: keyof TemplateBuilderColumn, value: string) => {
    setTemplateBuilderColumns((prev) => {
      const next = [...prev];
      const row = { ...next[index] };
      if (field === "formula") {
        row.formula = value.toUpperCase();
      } else if (field === "columnName") {
        row.columnName = value;
      } else if (field === "columnType") {
        row.columnType = value;
      } else if (field === "editableBy") {
        row.editableBy = value;
      }
      next[index] = row;
      return next;
    });
  };

  const togglePredefinedColumn = (name: string, checked: boolean) => {
    const pool = PRE_DEFINED_ROW_POOL.find((p) => p.columnName === name);
    if (!pool) return;
    setTemplateBuilderColumns((prev) => {
      if (checked) {
        if (prev.some((c) => c.columnName === name)) return prev;
        return [...prev, { ...pool, columnId: "C" }];
      }
      return prev.filter((c) => c.columnName !== name);
    });
    setTemplateBuilderDropMenu((m) => m.map((item) => (item.name === name ? { ...item, checked } : item)));
  };

  const handleAddEmptyColumn = () => {
    setTemplateBuilderColumns((prev) => [
      ...prev,
      {
        columnId: "C",
        columnName: "",
        columnType: "",
        editableBy: "",
        formula: "",
        viewedBy: "Both",
      },
    ]);
  };

  const toggleBuilderViewedBy = (index: number, viewedBy: "Both" | "Buyer") => {
    setTemplateBuilderColumns((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], viewedBy };
      return next;
    });
  };

  const dragStart = (position: number) => {
    dragItem.current = position;
  };

  const dragEnter = (position: number) => {
    dragOverItem.current = position;
  };

  const dragEnd = () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    dragItem.current = null;
    dragOverItem.current = null;
    if (from == null || to == null || from === to) return;
    setTemplateBuilderColumns((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(from, 1);
      copy.splice(to, 0, removed);
      return copy;
    });
  };

  const saveNewTemplate = () => {
    if (!templateBuilderName.trim()) {
      setTemplateBuilderNameErr(true);
      return;
    }
    setTemplateBuilderNameErr(false);

    const hasRowErrors = templateBuilderColumns.some(
      (column) =>
        !column.columnName.trim() || !column.columnType || !column.editableBy
    );
    if (hasRowErrors) {
      setTemplateBuilderColumns((prev) =>
        prev.map((column) => {
          const nameMissing = !column.columnName.trim();
          const typeMissing = !column.columnType;
          const editableMissing = !column.editableBy;
          if (!nameMissing && !typeMissing && !editableMissing) {
            const { isError, errorColumnName, errorColumnType, errorEditableBy, ...rest } = column;
            return { ...rest };
          }
          return {
            ...column,
            isError: true,
            errorColumnName: nameMissing ? "Name is required" : undefined,
            errorColumnType: typeMissing ? "Input Field is required" : undefined,
            errorEditableBy: editableMissing ? "Editable By is required" : undefined,
          };
        })
      );
      toast({
        title: "Validation",
        description: "Please fill all column fields.",
        variant: "destructive",
      });
      return;
    }

    const totalRow = templateBuilderColumns.find((c) => c.columnName === "Total");
    if (!totalRow?.formula?.trim()) {
      toast({
        title: "Formula required",
        description: "Please enter formula in Total column.",
        variant: "destructive",
      });
      return;
    }

    const finalTemplateRows = templateBuilderColumns.map((template, i) => {
      const { preDefinedColumn, isError, errorColumnName, errorColumnType, errorEditableBy, ...t } = template;
      return {
        ...t,
        columnId: `C${i + 1}`,
      };
    });

    createTemplateMutation.mutate({
      name: templateBuilderName.trim(),
      auAuctionEventTemplateColumnDefs: finalTemplateRows,
    });
  };

  const removeTableRow = useCallback((j: number) => {
    setFormData((prev) => {
      if (prev.auAuctionEventTemplateData.length <= 1) return prev;
      return {
        ...prev,
        auAuctionEventTemplateData: prev.auAuctionEventTemplateData.filter((_, index) => index !== j),
      };
    });
  }, []);

  /** Appends a line item row (legacy: add from last row). Not used with PR import. */
  const addTableRow = useCallback(() => {
    setFormData((prev) => {
      if (prev.prNumber) return prev;
      if (!prev.auAuctionEventTemplateColumnDefs?.length) return prev;
      const dataObj = buildEmptyRowFromDefs(prev.auAuctionEventTemplateColumnDefs).map((c) => ({
        ...c,
        isNew: true,
      }));
      return {
        ...prev,
        auAuctionEventTemplateData: [
          ...prev.auAuctionEventTemplateData,
          {
            columnValues: dataObj,
            templateId: 0,
            buyerDocsMapping: null,
            suppDocsMapping: null,
          },
        ],
      };
    });
  }, []);

 const downloadTemplate = useCallback(async () => {
  const defs = formData.auAuctionEventTemplateColumnDefs ?? [];

  const buyerCols = defs.filter((col) => col.editableBy !== "Supplier");
  const headers = buyerCols.map((col) => col.columnName);

  // Insert synthetic UOM column right after Quantity
  const qtyIndex = headers.findIndex((h) => h === "Quantity");
  const finalHeaders = [...headers];
  if (qtyIndex !== -1) finalHeaders.splice(qtyIndex + 1, 0, "UOM");

  const productLabels = [...new Set((formData.productList ?? []).filter((p) => p.label).map((p) => p.label))];
  const uomLabels    = [...new Set((formData.uomList     ?? []).filter((u) => u.label).map((u) => u.label))];
  const locationLabels = [...new Set((formData.locations ?? []).filter((l) => l.label).map((l) => l.label))];

  // Helper: 1-based column index → Excel letter (A, B, … Z, AA, …)
  const colLetter = (n: number): string => {
    let r = "";
    while (n > 0) { const rem = (n - 1) % 26; r = String.fromCharCode(65 + rem) + r; n = Math.floor((n - 1) / 26); }
    return r;
  };

  const ExcelJSModule = await import("exceljs");
  const ExcelJS = (ExcelJSModule as any).default ?? ExcelJSModule;
  const wb = new ExcelJS.Workbook();

 

  // ── Template sheet ────────────────────────────────────────────────────────
  const ws = wb.addWorksheet("Template");
  const headerRow = ws.addRow(finalHeaders);
  headerRow.font = { bold: true };
  ws.columns = finalHeaders.map(() => ({ width: 22 }));

   // ── Hidden "Lists" sheet — holds dropdown source values ──────────────────
  const listWs = wb.addWorksheet("Lists");
  listWs.state = "hidden";
  const maxLen = Math.max(productLabels.length, uomLabels.length, locationLabels.length, 1);
  for (let i = 0; i < maxLen; i++) {
    listWs.addRow([productLabels[i] ?? "", uomLabels[i] ?? "", locationLabels[i] ?? ""]);
  }

  const MAX_ROWS = 1000;

  const addDropdown = (headerName: string, listCol: string, listLen: number, errTitle: string, errMsg: string) => {
    if (listLen === 0) return;
    const colIdx = finalHeaders.indexOf(headerName) + 1;
    if (colIdx < 1) return;
    const letter = colLetter(colIdx);
    ws.dataValidations.add(`${letter}2:${letter}${MAX_ROWS}`, {
      type: "list",
      allowBlank: true,
      formulae: [`Lists!$${listCol}$1:$${listCol}$${listLen}`],
      showErrorMessage: true,
      errorTitle: errTitle,
      error: errMsg,
    });
  };

  addDropdown("Item Name",        "A", productLabels.length,  "Invalid Item",     "Please select an item from the dropdown.");
  addDropdown("UOM",              "B", uomLabels.length,      "Invalid UOM",      "Please select a UOM from the dropdown.");
  addDropdown("Delivery Location","C", locationLabels.length, "Invalid Location", "Please select a location from the dropdown.");

  // ── Download ──────────────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const templateName = templatesList.find((t) => t.value === formData.selectTemplate)?.label ?? "Auction Template";
  a.download = `${templateName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}, [
  formData.auAuctionEventTemplateColumnDefs,
  formData.productList,
  formData.uomList,
  formData.locations,
  formData.selectTemplate,
  templatesList,
]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setImportFileName(file?.name ?? "");
    setImportedFile(file);
    // reset so same file can be re-selected
    e.target.value = "";
  }, []);

  const handleImportProceed = useCallback(() => {
    if (!importedFile) {
      toast({ title: "No file", description: "Please select a file to import.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          toast({ title: "Empty workbook", description: "No sheets found in the file.", variant: "destructive" });
          return;
        }
        const sheet = workbook.Sheets[sheetName];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        if (!rows.length) {
          toast({ title: "No data", description: "The sheet has no rows.", variant: "destructive" });
          return;
        }

        setFormData((prev) => {
          const defs = prev.auAuctionEventTemplateColumnDefs;
          if (!defs.length) return prev;

          const headerMap: Record<string, number> = {};
          defs.forEach((d, idx) => {
            headerMap[d.columnName.trim().toLowerCase()] = idx;
          });

          const newTemplateData: TemplateDataRow[] = rows.map((excelRow) => {
            const cells = buildEmptyRowFromDefs(defs).map((c) => ({ ...c, isNew: true }));
            Object.entries(excelRow).forEach(([header, rawValue]) => {
              const defIdx = headerMap[header.trim().toLowerCase()];
              if (defIdx == null) return;
              const def = defs[defIdx];
              let value = rawValue != null ? String(rawValue).trim() : "";

              if (def.columnName === "Item Name") {
                const found = prev.productList.find(
                  (p) => p.label.toLowerCase() === value.toLowerCase() || p.value === value
                );
                value = found ? found.value : value;
              } else if (def.columnName === "Delivery Location") {
                const found = prev.locations.find(
                  (l) => l.label.toLowerCase() === value.toLowerCase() || l.value === value
                );
                value = found ? found.value : value;
              } else if (def.columnName === "Quantity") {
                // Combine Quantity + UOM from adjacent "UOM" column
                const uomRaw = excelRow["UOM"] ?? excelRow["uom"] ?? "";
                const uomVal = String(uomRaw).trim();
                const qty = Number(value) || 0;
                if (uomVal) {
                  value = `${qty} ${uomVal}`;
                  cells[defIdx].columnUOMValue = uomVal;
                } else {
                  value = String(qty);
                }
              }

              cells[defIdx] = { ...cells[defIdx], columnValue: value };
            });
            return { columnValues: cells, templateId: 0, buyerDocsMapping: null, suppDocsMapping: null };
          });

          return { ...prev, auAuctionEventTemplateData: newTemplateData };
        });

        toast({ title: "Excel imported", description: `${rows.length} row(s) loaded successfully.` });
        setUploadExcelOpen(false);
        setImportFileName("");
        setImportedFile(null);
      } catch {
        toast({ title: "Import failed", description: "Could not parse the Excel file.", variant: "destructive" });
      }
    };
    reader.readAsArrayBuffer(importedFile);
  }, [importedFile, toast]);

  const handleExcelUpload = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!event.target) return;
      // Reset so same file can be re-uploaded
      event.target.value = "";
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            toast({ title: "Empty workbook", description: "No sheets found in the file.", variant: "destructive" });
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (!rows.length) {
            toast({ title: "No data", description: "The sheet has no rows.", variant: "destructive" });
            return;
          }

          setFormData((prev) => {
            const defs = prev.auAuctionEventTemplateColumnDefs;
            if (!defs.length) return prev;

            // Build column header → def index map (case-insensitive)
            const headerMap: Record<string, number> = {};
            defs.forEach((d, idx) => {
              headerMap[d.columnName.trim().toLowerCase()] = idx;
            });

            const newTemplateData: TemplateDataRow[] = rows.map((excelRow) => {
              const cells = buildEmptyRowFromDefs(defs).map((cell, idx) => ({ ...cell, isNew: true }));
              Object.entries(excelRow).forEach(([header, rawValue]) => {
                const defIdx = headerMap[header.trim().toLowerCase()];
                if (defIdx == null) return;
                const def = defs[defIdx];
                let value = rawValue != null ? String(rawValue).trim() : "";

                if (def.columnName === "Item Name") {
                  // Match by label then fall back to raw value (stored as id in select)
                  const found = prev.productList.find(
                    (p) => p.label.toLowerCase() === value.toLowerCase() || p.value === value
                  );
                  value = found ? found.value : value;
                } else if (def.columnName === "Delivery Location") {
                  const found = prev.locations.find(
                    (l) => l.label.toLowerCase() === value.toLowerCase() || l.value === value
                  );
                  value = found ? found.value : value;
                }

                cells[defIdx] = { ...cells[defIdx], columnValue: value };
              });
              return { columnValues: cells, templateId: 0, buyerDocsMapping: null, suppDocsMapping: null };
            });

            return { ...prev, auAuctionEventTemplateData: newTemplateData };
          });

          toast({ title: "Excel imported", description: `${rows.length} row(s) loaded.` });
        } catch {
          toast({ title: "Import failed", description: "Could not parse the Excel file.", variant: "destructive" });
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [toast]
  );

  const onchangeTableInput = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>, row: ColumnDefRow, rowIndex: number) => {
      const value = event.target.value;
      setFormData((prev) => {
        const newData = [...prev.auAuctionEventTemplateData];
        const cells = [...(newData[rowIndex].columnValues || [])];
        const ci = cells.findIndex((c) => c.columnId === row.columnId);
        if (ci < 0) return prev;
        const cell = { ...cells[ci] };
        if (row.columnName === "Quantity" && value.trim() !== "") {
          const uomPart =
            cell.columnValue?.toString().split(" ").slice(1).join(" ") || "";
          cell.columnValue = `${Math.abs(Number(value)) || value} ${uomPart}`.trim();
        } else if (row.columnName === "Quantity" && value === "") {
          const uomPart =
            cell.columnValue?.toString().split(" ").slice(1).join(" ") || "";
          cell.columnValue = uomPart ? ` ${uomPart}` : "";
        } else {
          cell.columnValue = value;
        }
        cells[ci] = cell;
        newData[rowIndex] = { ...newData[rowIndex], columnValues: cells };
        return { ...prev, auAuctionEventTemplateData: newData };
      });
    },
    []
  );

  const onchangeTableDropdown = useCallback(
    (value: string, rowIndex: number, colIndex: number, columnName: string) => {
      setFormData((prev) => {
        const newData = [...prev.auAuctionEventTemplateData];
        const cells = [...(newData[rowIndex].columnValues || [])];
        if (!cells[colIndex]) return prev;
        const cell = { ...cells[colIndex] };
        if (columnName === "Quantity") {
          const qty = String(cell.columnValue ?? "").split(" ")[0] ?? "";
          cell.columnValue = qty ? `${qty} ${value}`.trim() : value;
          cell.columnUOMValue = value;
        } else {
          cell.columnValue = value;
        }
        cells[colIndex] = cell;

        // Duplicate check: same Item Name + same Delivery Location not allowed
        if (columnName === "Item Name" || columnName === "Delivery Location") {
          const colDefs = prev.auAuctionEventTemplateColumnDefs;
          const itemIdx = colDefs.findIndex((d) => d.columnName === "Item Name");
          const locIdx = colDefs.findIndex((d) => d.columnName === "Delivery Location");

          const updatedCells = cells;
          const newItem = itemIdx >= 0 ? String(updatedCells[itemIdx]?.columnValue ?? "") : "";
          const newLoc = locIdx >= 0 ? String(updatedCells[locIdx]?.columnValue ?? "") : "";

          if (newItem && newLoc) {
            const isDuplicate = newData.some((row, idx) => {
              if (idx === rowIndex) return false;
              const rowCells = row.columnValues || [];
              const rowItem = itemIdx >= 0 ? String(rowCells[itemIdx]?.columnValue ?? "") : "";
              const rowLoc = locIdx >= 0 ? String(rowCells[locIdx]?.columnValue ?? "") : "";
              return rowItem === newItem && rowLoc === newLoc;
            });
            if (isDuplicate) {
              toast({
                title: "Duplicate record",
                description: "A row with the same Item and Delivery Location already exists.",
                variant: "destructive",
              });
              return prev;
            }
          }
        }

        newData[rowIndex] = { ...newData[rowIndex], columnValues: cells };
        return { ...prev, auAuctionEventTemplateData: newData };
      });
    },
    [toast]
  );

  const setDefaultDisplay = (row: ColumnDefRow, cell: ColumnValueCell | undefined, columnName: string): string => {
    if (!cell) return "";
    const raw = cell.columnValue;
    if (columnName === "Item Name") {
      const found = findTemplateOption(formData.productList, raw);
      if (found) return found.value;
      return raw != null ? String(raw) : "";
    }
    if (columnName === "Delivery Location") {
      const found = findTemplateOption(formData.locations, raw);
      if (found) return found.value;
      return raw != null ? String(raw) : "";
    }
    if (row.columnType?.toLowerCase() === "select") {
      return raw != null ? String(raw) : "";
    }
    return raw != null ? String(raw) : "";
  };

  const suppliers = suppliersResponse?.data ?? [];
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearch.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      (s.companyName ?? "").toLowerCase().includes(q)
    );
  }, [suppliers, supplierSearch]);

  const toggleSupplier = (s: DboSupplier) => {
    const name = s.companyName ?? "";
    const id = s.id;
    setFormData((prev) => {
      const exists = prev.selectedSuppliers.some((x) => x.suppId === id);
      if (exists) {
        return {
          ...prev,
          selectedSuppliers: prev.selectedSuppliers.filter((x) => x.suppId !== id),
        };
      }
      return {
        ...prev,
        selectedSuppliers: [...prev.selectedSuppliers, { selectedValue: name, suppId: id }],
      };
    });
  };

  const validatePublish = (): boolean => {
    const unitLabel =
      formData.eventOpts.find((o) => o.value === formData.selectedEventValue)?.label ?? "Mins";
    if (
      formData.selectedDeliveryDate &&
      new Date(formData.selectedDeliveryDate) <= getMinimumDeliveryDate(formData.eventDuration, unitLabel)
    ) {
      setFormData((prev) => ({ ...prev, deliveryDateErr: true }));
      toast({
        title: "Delivery date",
        description: "Delivery date must be after the event end date.",
        variant: "destructive",
      });
      return false;
    }
    if (!formData.eventName.trim()) {
      setFormData((prev) => ({ ...prev, eventNameErr: true }));
      return false;
    }
    if (!formData.selectTemplate || !selectedTemplateId) {
      setFormData((prev) => ({ ...prev, selectTemplateErr: true }));
      return false;
    }
    if (!formData.auctionStratergy) {
      toast({ title: "Validation", description: "Please select auction strategy.", variant: "destructive" });
      return false;
    }
    if (!formData.eventDuration) {
      setFormData((prev) => ({ ...prev, eventDurationErr: true }));
      return false;
    }
    if (!formData.selectedDeliveryDate) {
      setFormData((prev) => ({ ...prev, deliveryDateErr: true }));
      return false;
    }
    if (!formData.allotment) {
      toast({ title: "Validation", description: "Please select allotment type.", variant: "destructive" });
      return false;
    }
    if (formData.selectedSuppliers.length === 0) {
      toast({ title: "Validation", description: "Please select at least one supplier.", variant: "destructive" });
      return false;
    }
    if (!formData.auAuctionEventTemplateData?.length) {
      toast({
        title: "Validation",
        description: "Add at least one line item in the grid before publishing.",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  const itemColumnId = useMemo(() => {
    const defs = formData.auAuctionEventTemplateColumnDefs;
    const item = defs.find((d) => d.columnName.toLowerCase() === "item name") ?? defs[0];
    return item?.columnId ?? "C1";
  }, [formData.auAuctionEventTemplateColumnDefs]);

  const dataTemplateRows = useMemo(
    () => formData.auAuctionEventTemplateData,
    [formData.auAuctionEventTemplateData]
  );

  const resolveProductLabel = (columnValue: string | number | undefined) => {
    const found = findTemplateOption(formData.productList, columnValue);
    if (found) return found.label;
    return columnValue != null ? String(columnValue) : "";
  };

  const resolveLocationLabel = (columnValue: string | number | undefined) => {
    const found = findTemplateOption(formData.locations, columnValue);
    if (found) return found.label;
    return columnValue != null ? String(columnValue) : "";
  };

  const openSavingsModal = () => {
    setSavingsOpen(true);
  };

  const updateRowSavingsAmount = (absoluteRowIndex: number, value: string) => {
    setFormData((prev) => {
      const next = [...prev.auAuctionEventTemplateData];
      const row = next[absoluteRowIndex];
      if (!row) return prev;
      next[absoluteRowIndex] = { ...row, savingsAmount: value };
      return { ...prev, auAuctionEventTemplateData: next };
    });
  };

  const handlePriceCapInput = (columnValue: string, priceStr: string) => {
    if (selectedSuppPCSupplier == null) return;
    const price = Number(priceStr);
    const suppId = selectedSuppPCSupplier.value;
    const supplierName = selectedSuppPCSupplier.label;
    setSupplierWisePriceCapData((prev) => {
      const copy = [...prev];
      const idx = copy.findIndex(
        (x) => x.columnValue === columnValue && x.suppId === suppId
      );
      if (idx >= 0) {
        copy[idx] = { ...copy[idx], price: Number.isFinite(price) ? price : 0 };
        return copy;
      }
      return [
        ...copy,
        {
          columnValue,
          suppId,
          supplierName,
          price: Number.isFinite(price) ? price : 0,
        },
      ];
    });
  };

  const supplierWisePriceCapSave = () => {
    if (selectedSuppPCSupplier == null) return;
    const suppId = selectedSuppPCSupplier.value;
    const supplierName = selectedSuppPCSupplier.label;

    setFormData((prev) => {
      const nextRows = prev.auAuctionEventTemplateData.map((item) => {
        const caps = [...(item.suppWiseCap ?? [])];
        const itemCol = item.columnValues?.find((c) => c.columnId === itemColumnId);
        const colVal = itemCol?.columnValue != null ? String(itemCol.columnValue) : "";
        if (!colVal) return item;

        const draft = supplierWisePriceCapData.find(
          (d) => d.columnValue === colVal && d.suppId === suppId
        );
        if (!draft) return item;

        const without = caps.filter((c) => c.suppId !== suppId);
        without.push({
          suppId,
          supplierName,
          price: draft.price,
          columnValue: colVal,
        });
        return { ...item, suppWiseCap: without };
      });
      return { ...prev, auAuctionEventTemplateData: nextRows };
    });

    setSelectedSuppPCSupplier(null);
    toast({ title: "Price cap", description: "Supplier price cap saved for this supplier." });
  };

  const toggleTncSelect = (tncId: number, tncText: string, checked: boolean) => {
    setSelectedTncList((prev) => {
      if (checked) {
        if (prev.some((p) => p.tncId === tncId)) return prev;
        return [...prev, { tncId, selectedValue: tncText }];
      }
      return prev.filter((p) => p.tncId !== tncId);
    });
  };

  const saveEventExtension = () => {
    const a = Number(formData.eventExtensionLast);
    const b = Number(formData.eventExtend);
    if (!(a > 0) || !(b > 0)) {
      toast({
        title: "Event extension",
        description: "Values must be greater than 0.",
        variant: "destructive",
      });
      return;
    }
    setExtensionOpen(false);
  };

  const markTableErrors = (): boolean => {
    let hasErr = false;
    const defs = formData.auAuctionEventTemplateColumnDefs;
    const rows = formData.auAuctionEventTemplateData;

    const nextRows = formData.auAuctionEventTemplateData.map((row, ri) => {
      if (!rows.includes(row)) return row;
      const cells = (row.columnValues || []).map((cv, k) => {
        const def = defs[k];
        if (!def) return cv;
        let err = false;
        let uomErr = false;
        if (
          def.columnName !== "Quantity" &&
          (cv.columnValue === "" || cv.columnValue === undefined) &&
          (cv.editableBy === "Buyer" || def.editableBy === "Buyer")
        ) {
          err = true;
        }
        if (def.columnName === "Quantity" && def.editableBy === "Buyer") {
          const parts = cv.columnValue?.toString().trim().split(/\s+/) ?? [];
          if (!parts[0] || Number.isNaN(Number(parts[0]))) err = true;
          if (!parts[1]) uomErr = true;
        }
        if (err || uomErr) hasErr = true;
        return { ...cv, isError: err || undefined, isUOMError: uomErr || undefined };
      });
      return { ...row, columnValues: cells };
    });

    if (hasErr) {
      setFormData((prev) => ({ ...prev, auAuctionEventTemplateData: nextRows }));
    }
    return !hasErr;
  };

  const buildPayload = (status: "Draft" | "Scheduled" | "Active") => {
    const auctionTemplate = formData.auAuctionEventTemplateData;
    const colDefs = formData.auAuctionEventTemplateColumnDefs;

    const templateRows = auctionTemplate.map((val) => {
      const formObj = (val.columnValues || []).map((element, idx) => {
        const def = colDefs[idx];
        const isItemName = def?.columnName === "Item Name";
        const isDeliveryLocation = def?.columnName === "Delivery Location";
        const columnValue = isItemName
          ? resolveProductLabel(element.columnValue)
          : isDeliveryLocation
            ? resolveLocationLabel(element.columnValue)
            : element.columnValue;
        return {
          id: element.id,
          columnId: element.columnId,
          columnValue,
          editableBy: element.editableBy ?? "",
          formula: element.formula ?? "",
          viewedBy: element.viewedBy ?? "",
        };
      });
      const caps =
        val.suppWiseCap?.map((c) => ({
          suppId: c.suppId,
          supplierName: c.supplierName,
          price: c.price,
        })) ?? [];
      return {
        ...val,
        columnValues: formObj,
        templateId: 0,
        buyerDocsMapping: null,
        suppDocsMapping: null,
        // DB column is numeric — empty string is invalid; omit null so Postgres gets NULL
        savingsAmount:
          val.savingsAmount != null && String(val.savingsAmount).trim() !== ""
            ? val.savingsAmount
            : null,
        suppWiseCap: caps,
      };
    });

    const suppIds = formData.selectedSuppliers.map(({ suppId }) => ({ suppId }));

    const deliveryDateStr = formData.selectedDeliveryDate
      ? new Date(formData.selectedDeliveryDate + "T12:00:00").toISOString()
      : null;

    let startDateStr: string | null = null;
    if (formData.scheduleEvent && formData.selectedScheduleDate) {
      startDateStr = new Date(formData.selectedScheduleDate).toISOString();
    }

    const extLast = Number(formData.eventExtensionLast) || 0;
    const extBy = Number(formData.eventExtend) || 0;
    const auctionSavingReference =
      formData.savingsValue === "Gross Item"
        ? formData.savingsPrice
        : formData.savingsReferenceKind;
    const auctionSavingReferenceValue =
      formData.savingsValue === "Line Item" ? formData.savingsPrice : "";

    return {
      ...(draftId != null ? { id: draftId } : {}),
      status,
      allotmentType: formData.allotment,
      auctionDuration: formData.eventDuration,
      auctionDurationUnits: formData.selectedEventValue,
      auctionSavingMeasure: formData.savingsValue,
      auctionSavingReference,
      auctionSavingReferenceValue,
      auctionStrategy: formData.auctionStratergy,
      currency: formData.currency,
      ifBidInLastMinutesInMins: extLast,
      acutiontTimeExtensionInMins: extBy,
      isScheduledEvent: formData.scheduleEvent ? "Y" : "N",
      name: formData.eventName,
      startDateStr,
      deliveryDateStr,
      templateId: selectedTemplateId,
      suppIds,
      templateRows,
      tncIds: selectedTncList.map((t) => ({ tncId: t.tncId })),
      auctionType: toApiAuctionType(formData.auctionType),
      ifBidInLastMinutesInMinsUnits: formData.eventExtensionLastUnit,
      acutiontTimeExtensionInMinsUnits: formData.eventExtensionExtendUnit,
      prNumber: formData.prNumber || null,
      isBasket: formData.isBasket ? "Y" : "",
    };
  };

  const handleSubmit = (mode: "draft" | "publish") => {
    if (mode === "publish") {
      if (!validatePublish()) {
        return;
      }
      if (!markTableErrors()) {
        toast({ title: "Validation", description: "Please fill the missing fields in the table.", variant: "destructive" });
        return;
      }
      const status = formData.scheduleEvent ? "Scheduled" : "Active";
      createAuctionMutation.mutate(buildPayload(status));
    } else {
      if (!formData.eventName.trim()) {
        setFormData((prev) => ({ ...prev, eventNameErr: true }));
        toast({ title: "Validation", description: "Enter auction name to save as draft.", variant: "destructive" });
        return;
      }
      if (!selectedTemplateId) {
        setFormData((prev) => ({ ...prev, selectTemplateErr: true }));
        return;
      }
      createAuctionMutation.mutate(buildPayload("Draft"));
    }
  };

  const onTemplateChange = (value: string) => {
    if (value === CREATE_NEW_TEMPLATE_VALUE) {
      openCreateTemplateBuilder();
      return;
    }
    const id = Number(value);
    if (!Number.isFinite(id)) return;
    setSelectedTemplateId(id);
    setFormData((prev) => ({
      ...prev,
      selectTemplate: value,
      selectTemplateErr: false,
      auAuctionEventTemplateColumnDefs: [],
      auAuctionEventTemplateData: [],
    }));
  };

  const modalLoader = templatesLoading;

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[80vw] sm:max-w-[80vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Create Auction</SheetTitle>
            <SheetDescription>
              Provide required details to create an auction. Fields marked * are mandatory.
            </SheetDescription>
          </SheetHeader>

          {modalLoader ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="auction-type">Auction Type</Label>
                  <Select
                    value={formData.auctionType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        auctionType: value as CreateAuctionFormData["auctionType"],
                      }))
                    }
                  >
                    <SelectTrigger id="auction-type" className="w-full">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Reverse">Reverse Auction</SelectItem>
                      <SelectItem value="Forward">Forward Auction</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
                <div>
                  <Label htmlFor="auction-name">Auction Name *</Label>
                  <Input
                    id="auction-name"
                    value={formData.eventName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        eventName: e.target.value,
                        eventNameErr: false,
                      }))
                    }
                    placeholder="Enter auction name"
                    className={formData.eventNameErr ? "border-red-500" : ""}
                  />
                  {formData.eventNameErr && (
                    <p className="text-red-500 text-sm">Please enter auction name</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="select-template">Templates *</Label>
                  <Select value={formData.selectTemplate} onValueChange={onTemplateChange}>
                    <SelectTrigger id="select-template" className="w-full">
                      <SelectValue placeholder="Select Template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templatesList.map((template, index) => (
                        <SelectItem key={index} value={template.value}>
                          {template.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {formData.selectTemplateErr && (
                    <p className="text-red-500 text-sm">Please select a template</p>
                  )}
                </div>
                {formData.selectTemplate &&
                  !formData.templateLoader &&
                  !formData.prNumber && (
                    <div className="flex items-end">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setImportFileName("");
                          setImportedFile(null);
                          setUploadExcelOpen(true);
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Upload Excel
                      </Button>
                    </div>
                  )}
              </div>

              {formData.auAuctionEventTemplateColumnDefs.length > 0 || formData.templateLoader ? (
                <div className="overflow-auto mb-4 mt-4">
                  {formData.templateLoader ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <table className="min-w-full border text-sm">
                      <thead>
                        <tr>
                          {!formData.prNumber ? (
                            <th className="border px-2 py-2 text-left">Action</th>
                          ) : null}
                          {formData.auAuctionEventTemplateColumnDefs.map((row, i) =>
                            row.viewedBy === "Both" || row.viewedBy === "Buyer" ? (
                              <th key={i} className="border px-2 py-2 text-left">
                                {row.columnName}
                              </th>
                            ) : null
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {formData.auAuctionEventTemplateData.map((rowData, j) => (
                          <tr key={j}>
                            {!formData.prNumber ? (
                              <td className="border px-2 py-2 text-center align-top">
                                <div className="flex flex-col items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => removeTableRow(j)}
                                    className="text-destructive"
                                    aria-label="Remove row"
                                  >
                                    <Trash2 className="h-4 w-4 inline" />
                                  </button>
                                  {j === formData.auAuctionEventTemplateData.length - 1 ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      className="text-xs h-8"
                                      onClick={addTableRow}
                                    >
                                      Add row
                                    </Button>
                                  ) : null}
                                </div>
                              </td>
                            ) : null}
                            {formData.auAuctionEventTemplateColumnDefs.map((row, k) =>
                              row.viewedBy === "Both" || row.viewedBy === "Buyer" ? (
                                <td
                                  key={k}
                                  className={`border px-2 py-2 align-top ${
                                    row.columnName === "Quantity" ? "min-w-[200px]" : ""
                                  }`}
                                >
                                  <div>
                                  {row.columnType?.toLowerCase() === "select" &&
                                  (row.columnName === "Item Name" || row.columnName === "Delivery Location") ? (
                                    <Select
                                      value={
                                        (() => {
                                          const v = setDefaultDisplay(
                                            row,
                                            rowData.columnValues?.[k],
                                            row.columnName
                                          );
                                          return v === "" ? undefined : v;
                                        })()
                                      }
                                      onValueChange={(v) => {
                                        const colName =
                                          row.columnName === "Item Name" ? "Item Name" : "Delivery Location";
                                        onchangeTableDropdown(v, j, k, colName);
                                      }}
                                    >
                                      <SelectTrigger
                                        className={
                                          rowData.columnValues?.[k]?.isError ? "border-red-500 w-full" : "w-full"
                                        }
                                      >
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {(row.columnName === "Item Name"
                                          ? formData.productList
                                          : formData.locations
                                        ).map((opt, ix) => (
                                          <SelectItem key={ix} value={opt.value}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      type={
                                        row.columnType?.toLowerCase() === "number" ? "text" : "text"
                                      }
                                      className={
                                        rowData.columnValues?.[k]?.isError ? "border-red-500" : ""
                                      }
                                      value={
                                        row.columnName === "Quantity"
                                          ? String(rowData.columnValues?.[k]?.columnValue ?? "").split(" ")[0] ?? ""
                                          : String(rowData.columnValues?.[k]?.columnValue ?? "")
                                      }
                                      onChange={(e) => onchangeTableInput(e, row, j)}
                                      placeholder={row.columnName === "Quantity" ? "Quantity" : ""}
                                      disabled={row.editableBy === "Supplier"}
                                    />
                                  )}
                                  {row.columnName === "Quantity" ? (
                                    <Select
                                      value={
                                        String(rowData.columnValues?.[k]?.columnValue ?? "")
                                          .split(" ")
                                          .slice(1)
                                          .join(" ") || undefined
                                      }
                                      onValueChange={(v) => onchangeTableDropdown(v, j, k, "Quantity")}
                                      disabled={(() => {
                                        const qtyStr = String(rowData.columnValues?.[k]?.columnValue ?? "").split(" ")[0] ?? "";
                                        return !qtyStr || isNaN(Number(qtyStr)) || Number(qtyStr) <= 0;
                                      })()}
                                    >
                                      <SelectTrigger
                                        className={`w-full mt-1 ${
                                          rowData.columnValues?.[k]?.isUOMError ? "border-red-500" : ""
                                        }`}
                                      >
                                        <SelectValue placeholder="UOM" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {formData.uomList.map((uom, index) => (
                                          <SelectItem key={index} value={uom.value}>
                                            {uom.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : null}
                                  </div>
                                  {row.columnName === "Buyer Attachments" ||
                                  row.columnName === "Supplier Attachments" ? (
                                    <div className="text-center p-2">
                                      {row.editableBy === "Supplier" ? (
                                        "View"
                                      ) : (
                                        <input type="file" className="text-xs" />
                                      )}
                                    </div>
                                  ) : null}
                                </td>
                              ) : null
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}

              <div className="flex items-center gap-2 mb-2 mt-4">
                <Checkbox
                  id="isBasket"
                  checked={formData.isBasket}
                  onCheckedChange={(c) => {
                    const checked = c === true;
                    setFormData((prev) => ({
                      ...prev,
                      isBasket: checked,
                      auctionStratergy: checked ? "Rank Auction" : prev.auctionStratergy,
                      allotment: checked ? "Partial Based" : prev.allotment,
                    }));
                  }}
                />
                <Label htmlFor="isBasket">Serial Auction</Label>
              </div>

              <div className="mb-5">
                <h5 className="text-lg font-semibold">
                  Auction strategy <span className="text-red-500">*</span>
                </h5>
                <div className="flex flex-wrap gap-4 mb-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="auction-stratergy"
                      checked={formData.auctionStratergy === "Rank Auction"}
                      onChange={() =>
                        setFormData((prev) => ({ ...prev, auctionStratergy: "Rank Auction" }))
                      }
                    />
                    <span>Rank Auction</span>
                  </label>
                  {!formData.isBasket && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="auction-stratergy"
                        checked={formData.auctionStratergy === "Price Auction"}
                        onChange={() =>
                          setFormData((prev) => ({ ...prev, auctionStratergy: "Price Auction" }))
                        }
                      />
                      <span>Price Auction</span>
                    </label>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <div>
                  <Label htmlFor="eventDuration">
                    Auction Duration{formData.isBasket ? " (per product)" : ""} *
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="eventDuration"
                      type="number"
                      min={1}
                      value={formData.eventDuration}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        if (value < 0) return;
                        setFormData((prev) => ({
                          ...prev,
                          eventDuration: value,
                          eventDurationErr: false,
                        }))
                      }}
                      className={formData.eventDurationErr ? "border-red-500" : ""}
                    />
                    <Select
                      value={formData.selectedEventValue}
                      onValueChange={(value) =>
                        setFormData((prev) => ({ ...prev, selectedEventValue: value }))
                      }
                    >
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Unit" />
                      </SelectTrigger>
                      <SelectContent>
                        {formData.eventOpts.map((opt, index) => (
                          <SelectItem key={index} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {formData.eventDurationErr && (
                    <p className="text-red-500 text-sm">Enter auction duration</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="selectedDeliveryDate">Delivery Date *</Label>
                  <Input
                    id="selectedDeliveryDate"
                    type="date"
                    value={formData.selectedDeliveryDate}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        selectedDeliveryDate: e.target.value,
                        deliveryDateErr: false,
                      }))
                    }
                    min={new Date().toISOString().split("T")[0]}
                    className={formData.deliveryDateErr ? "border-red-500" : ""}
                  />
                  {formData.deliveryDateErr && (
                    <p className="text-red-500 text-sm">Enter a valid delivery date</p>
                  )}
                </div>
              </div>

              {!formData.isBasket ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      id="scheduleEvent"
                      checked={formData.scheduleEvent}
                      onCheckedChange={(c) =>
                        setFormData((prev) => ({
                          ...prev,
                          scheduleEvent: c === true,
                          selectedScheduleDate: "",
                        }))
                      }
                    />
                    <Label htmlFor="scheduleEvent">Schedule event</Label>
                  </div>
                  {formData.scheduleEvent && (
                    <div className="mb-3">
                      <Input
                        type="datetime-local"
                        value={formData.selectedScheduleDate}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            selectedScheduleDate: e.target.value,
                          }))
                        }
                        min={new Date().toISOString().slice(0, 16)}
                      />
                    </div>
                  )}
                </>
              ) : null}

              {(!formData.isBasket || formData.selectedSuppliers.length >= 2) && (
                <>
                  <h5 className="mt-4 text-lg font-semibold">
                    Allotment <span className="text-red-500">*</span>
                  </h5>
                  <div className="flex flex-wrap gap-4 mb-4">
                    {!formData.isBasket && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="allotment"
                          checked={formData.allotment === "Lot Based"}
                          onChange={() =>
                            setFormData((prev) => ({ ...prev, allotment: "Lot Based" }))
                          }
                        />
                        <span>Lot Based</span>
                      </label>
                    )}
                    {formData.auAuctionEventTemplateData?.length >= 2 && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="allotment"
                          checked={formData.allotment === "Partial Based"}
                          onChange={() =>
                            setFormData((prev) => ({ ...prev, allotment: "Partial Based" }))
                          }
                        />
                        <span>Partial Based</span>
                      </label>
                    )}
                  </div>
                </>
              )}

              <div className="mb-5">
                <div className="border p-3 rounded-md">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 flex flex-wrap gap-1 min-h-[36px]">
                      {formData.selectedSuppliers.length > 0 ? (
                        formData.selectedSuppliers.map((item) => (
                          <span
                            key={item.suppId}
                            className="inline-flex items-center gap-1 bg-secondary px-2 py-1 rounded text-sm"
                          >
                            {item.selectedValue}
                            <button
                              type="button"
                              className="text-destructive text-xs"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  selectedSuppliers: prev.selectedSuppliers.filter(
                                    (s) => s.suppId !== item.suppId
                                  ),
                                }))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          {formData.auctionType === "Reverse" ? "Suppliers" : "Buyers"} *
                        </span>
                      )}
                    </div>
                    <Button type="button" variant="secondary" onClick={() => setSuppliersSheetOpen(true)}>
                      Select {formData.auctionType === "Reverse" ? "suppliers" : "buyers"}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setExtensionOpen(true)}
                >
                  <Clock className="h-4 w-4 mr-1 inline" />
                  Event extension
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={openSavingsModal}>
                  <PiggyBank className="h-4 w-4 mr-1 inline" />
                  Savings
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSupplierWisePriceCapData([]);
                    setSelectedSuppPCSupplier(null);
                    setPriceCapOpen(true);
                  }}
                  disabled={formData.selectedSuppliers.length === 0}
                >
                  <BadgeDollarSign className="h-4 w-4 mr-1 inline" />
                  Supplier price cap
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setTncOpen(true)}>
                  <ScrollText className="h-4 w-4 mr-1 inline" />
                  Terms &amp; conditions
                </Button>
              </div>
            </div>
          )}

          <SheetFooter className="mt-6 gap-2 sm:gap-0">
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => handleSubmit("draft")}
              disabled={submitting || modalLoader}
            >
              Save as draft
            </Button>
            <Button onClick={() => handleSubmit("publish")} disabled={submitting || modalLoader}>
              Publish
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Sheet open={suppliersSheetOpen} onOpenChange={setSuppliersSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Select suppliers</SheetTitle>
            <SheetDescription>Search and tick suppliers to invite to this auction.</SheetDescription>
          </SheetHeader>
          <Input
            className="mt-4"
            placeholder="Search..."
            value={supplierSearch}
            onChange={(e) => setSupplierSearch(e.target.value)}
          />
          <div className="mt-4 space-y-2 max-h-[60vh] overflow-y-auto">
            {filteredSuppliers.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
              >
                <Checkbox
                  checked={formData.selectedSuppliers.some((x) => x.suppId === s.id)}
                  onCheckedChange={() => toggleSupplier(s)}
                />
                <span className="text-sm">{s.companyName}</span>
              </label>
            ))}
            {filteredSuppliers.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No suppliers found.</p>
            )}
          </div>
          <SheetFooter className="mt-4">
            <Button type="button" onClick={() => setSuppliersSheetOpen(false)}>
              Done
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <FormSheet
        open={extensionOpen}
        onOpenChange={setExtensionOpen}
        title="Event extension"
        description="If a supplier bids in the last window below, extend the auction by the second window (legacy auctions.js)."
        onSubmit={saveEventExtension}
        submitLabel="Confirm"
        widthClassName="sm:max-w-md"
      >
        <p className="text-sm text-muted-foreground mb-4">
          If a supplier bids in the last window below, extend the auction by the second window
          (legacy auctions.js).
        </p>
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">If the supplier bids in last</span>
            <Input
              className="w-20 h-9"
              type="number"
              min={1}
              value={formData.eventExtensionLast}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, eventExtensionLast: e.target.value }))
              }
            />
            <Select
              value={formData.eventExtensionLastUnit}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, eventExtensionLastUnit: v }))
              }
            >
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formData.eventOpts.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm">Then extend by</span>
            <Input
              className="w-20 h-9"
              type="number"
              min={1}
              value={formData.eventExtend}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, eventExtend: e.target.value }))
              }
            />
            <Select
              value={formData.eventExtensionExtendUnit}
              onValueChange={(v) =>
                setFormData((prev) => ({ ...prev, eventExtensionExtendUnit: v }))
              }
            >
              <SelectTrigger className="w-[120px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {formData.eventOpts.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </FormSheet>

      <FormSheet
        open={savingsOpen}
        onOpenChange={setSavingsOpen}
        title="Savings"
        description="Choose how savings are measured (base price per line vs gross), and optional reference budget."
        onSubmit={() => setSavingsOpen(false)}
        submitLabel="Done"
        widthClassName="sm:max-w-lg"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Choose how savings are measured (base price per line vs gross), and optional reference budget.
        </p>
        <div className="space-y-4">
            <RadioGroup
              value={formData.savingsValue}
              onValueChange={(v) =>
                setFormData((prev) => ({
                  ...prev,
                  savingsValue: v as CreateAuctionFormData["savingsValue"],
                }))
              }
              className="flex flex-col gap-2"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Line Item" id="sav-line" />
                <Label htmlFor="sav-line" className="font-normal cursor-pointer">
                  Base price (line item)
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="Gross Item" id="sav-gross" />
                <Label htmlFor="sav-gross" className="font-normal cursor-pointer">
                  Gross price
                </Label>
              </div>
            </RadioGroup>

            {formData.savingsValue === "Line Item" && (
              <>
                <div className="space-y-2">
                  <Label className="text-sm">Compare savings against</Label>
                  <RadioGroup
                    value={formData.savingsReferenceKind}
                    onValueChange={(v) =>
                      setFormData((prev) => ({
                        ...prev,
                        savingsReferenceKind: v as CreateAuctionFormData["savingsReferenceKind"],
                      }))
                    }
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="Price" id="ref-price" />
                      <Label htmlFor="ref-price" className="font-normal cursor-pointer">
                        Price
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="Total Amount" id="ref-total" />
                      <Label htmlFor="ref-total" className="font-normal cursor-pointer">
                        Total amount
                      </Label>
                    </div>
                  </RadioGroup>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enter a budget per line (item) where applicable.
                </p>
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-2">Product</th>
                        <th className="text-left p-2 w-32">Budget</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dataTemplateRows.map((row, idx) => {
                        const itemCell = row.columnValues?.find((c) => c.columnId === itemColumnId);
                        const label = resolveProductLabel(itemCell?.columnValue);
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{label || "—"}</td>
                            <td className="p-2">
                              <Input
                                className="h-8"
                                type="text"
                                inputMode="decimal"
                                value={row.savingsAmount ?? ""}
                                onChange={(e) => updateRowSavingsAmount(idx, e.target.value)}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {formData.savingsValue === "Gross Item" && (
              <div>
                <Label htmlFor="savings-gross">Total budget (inclusive of additional cost)</Label>
                <Input
                  id="savings-gross"
                  value={formData.savingsPrice}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, savingsPrice: e.target.value }))
                  }
                  placeholder="Amount"
                />
              </div>
            )}
        </div>
      </FormSheet>

      <FormSheet
        open={priceCapOpen}
        onOpenChange={setPriceCapOpen}
        title="Supplier wise price cap"
        description="Pick a supplier, enter a max price per line item (C1), then add to attach caps to that supplier."
        onSubmit={supplierWisePriceCapSave}
        submitLabel="Add price cap"
        submitDisabled={!selectedSuppPCSupplier}
        widthClassName="sm:max-w-lg"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Pick a supplier, enter a max price per line item (C1), then add to attach caps to that supplier.
        </p>
        <div className="space-y-4">
            <div>
              <Label>Supplier</Label>
              <Select
                value={selectedSuppPCSupplier ? String(selectedSuppPCSupplier.value) : ""}
                onValueChange={(v) => {
                  const s = formData.selectedSuppliers.find((x) => String(x.suppId) === v);
                  if (!s) {
                    setSelectedSuppPCSupplier(null);
                    return;
                  }
                  setSelectedSuppPCSupplier({ value: s.suppId, label: s.selectedValue });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {formData.selectedSuppliers.map((s) => (
                    <SelectItem key={s.suppId} value={String(s.suppId)}>
                      {s.selectedValue}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedSuppPCSupplier && (
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50">
                      <th className="text-left p-2">Item</th>
                      <th className="text-left p-2 w-28">Price cap</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dataTemplateRows.map((row, idx) => {
                      const itemCell = row.columnValues?.find((c) => c.columnId === itemColumnId);
                      const colVal =
                        itemCell?.columnValue != null ? String(itemCell.columnValue) : "";
                      if (!colVal) {
                        return (
                          <tr key={idx} className="border-t">
                            <td className="p-2 text-muted-foreground" colSpan={2}>
                              Row {idx + 1}: set item first
                            </td>
                          </tr>
                        );
                      }
                      const draft = supplierWisePriceCapData.find(
                        (d) =>
                          d.columnValue === colVal &&
                          d.suppId === selectedSuppPCSupplier.value
                      );
                      const label = resolveProductLabel(itemCell?.columnValue);
                      return (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{label}</td>
                          <td className="p-2">
                            <Input
                              className="h-8"
                              type="number"
                              min={0}
                              step="0.01"
                              value={draft != null ? String(draft.price) : ""}
                              onChange={(e) =>
                                handlePriceCapInput(colVal, e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      </FormSheet>

      <Dialog open={tncOpen} onOpenChange={setTncOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terms &amp; conditions</DialogTitle>
            <DialogDescription>
              Select existing T&amp;C for module AUCTIONS or add new text. Confirm when done.
            </DialogDescription>
          </DialogHeader>
          {termsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div>
                <h5 className="text-sm font-medium mb-2">Recent terms</h5>
                <ScrollArea className="h-[220px] border rounded-md p-2">
                  {termsList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No terms for AUCTIONS yet.</p>
                  ) : (
                    termsList.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-start gap-2 py-2 border-b last:border-0 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedTncList.some((s) => s.tncId === t.id)}
                          onCheckedChange={(c) =>
                            toggleTncSelect(t.id, String(t.tnc_text ?? ""), c === true)
                          }
                        />
                        <span className="text-sm leading-snug">{t.tnc_text}</span>
                      </label>
                    ))
                  )}
                </ScrollArea>
              </div>
              <div>
                <h5 className="text-sm font-medium mb-2">Selected</h5>
                <ScrollArea className="h-[220px] border rounded-md p-2">
                  {selectedTncList.length === 0 ? (
                    <p className="text-sm text-muted-foreground">None selected.</p>
                  ) : (
                    <ol className="list-decimal list-inside text-sm space-y-1">
                      {selectedTncList.map((t) => (
                        <li key={t.tncId}>{t.selectedValue}</li>
                      ))}
                    </ol>
                  )}
                </ScrollArea>
                <div className="mt-3 space-y-2">
                  <Label htmlFor="new-tnc">Add your own</Label>
                  <Textarea
                    id="new-tnc"
                    rows={3}
                    placeholder="Terms text..."
                    value={tncDescription}
                    onChange={(e) => {
                      setTncDescription(e.target.value);
                      setTncDescriptionErr(false);
                    }}
                    className={tncDescriptionErr ? "border-red-500" : ""}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={createTncMutation.isPending || !tncDescription.trim()}
                    onClick={() => {
                      if (!tncDescription.trim()) {
                        setTncDescriptionErr(true);
                        return;
                      }
                      createTncMutation.mutate(tncDescription);
                    }}
                  >
                    {createTncMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Add"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" onClick={() => setTncOpen(false)}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormSheet
        open={createTemplateOpen}
        onOpenChange={(next) => {
          if (!next) closeCreateTemplateBuilder();
        }}
        title="Create template"
        description="Define column layout for auction line items. The Total column requires a formula. Drag rows to reorder."
        onSubmit={saveNewTemplate}
        submitLabel="Save template"
        isSubmitting={createTemplateMutation.isPending}
        widthClassName="max-w-5xl"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Define column layout for auction line items. The Total column requires a formula. Drag rows to reorder.
        </p>
          {createTemplateMutation.isPending ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="template-builder-name">Template name *</Label>
                  <Input
                    id="template-builder-name"
                    value={templateBuilderName}
                    onChange={(e) => {
                      setTemplateBuilderName(e.target.value);
                      setTemplateBuilderNameErr(false);
                    }}
                    className={templateBuilderNameErr ? "border-red-500" : ""}
                    placeholder="Template name"
                  />
                  {templateBuilderNameErr && (
                    <p className="text-sm text-red-500 mt-1">Please enter template name</p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="default">
                      Add pre-defined column
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="p-2 space-y-2">
                      {templateBuilderDropMenu.map((menu) => (
                        <div key={menu.name} className="flex items-center gap-2">
                          <Checkbox
                            id={`predef-${menu.name}`}
                            checked={menu.checked}
                            onCheckedChange={(c) => togglePredefinedColumn(menu.name, c === true)}
                          />
                          <Label htmlFor={`predef-${menu.name}`} className="text-sm font-normal cursor-pointer">
                            {menu.formLabel}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button type="button" variant="secondary" onClick={handleAddEmptyColumn}>
                  Add column
                </Button>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-2 w-10" />
                      <th className="text-left p-2">Column Id</th>
                      <th className="text-left p-2 min-w-[180px]">Name</th>
                      <th className="text-left p-2">Input field</th>
                      <th className="text-left p-2">Editable by</th>
                      <th className="text-left p-2 min-w-[120px]">Calculations</th>
                      <th className="text-left p-2">Visibility</th>
                    </tr>
                  </thead>
                  <tbody>
                    {templateBuilderColumns.map((item, i) => (
                      <tr
                        key={`${item.columnName}-${i}`}
                        draggable
                        onDragStart={() => dragStart(i)}
                        onDragEnter={() => dragEnter(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDragEnd={dragEnd}
                        className="border-b"
                      >
                        <td className="p-2 align-top">
                          <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        </td>
                        <td className="p-2 align-top whitespace-nowrap">
                          {item.columnId}
                          {i + 1}
                        </td>
                        <td className="p-2 align-top">
                          {!item.preDefinedColumn ? (
                            <Input
                              name="columnName"
                              value={item.columnName}
                              onChange={(e) => handleBuilderInputChange(i, "columnName", e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            <span>{item.columnName}</span>
                          )}
                          {item.isError && item.errorColumnName ? (
                            <p className="text-xs text-red-500 mt-0.5">{item.errorColumnName}</p>
                          ) : null}
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={item.columnType || undefined}
                            onValueChange={(v) => handleBuilderInputChange(i, "columnType", v)}
                            disabled={item.preDefinedColumn === true}
                          >
                            <SelectTrigger className={`h-8 w-[130px] ${item.isError && item.errorColumnType ? "border-red-500" : ""}`}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {INPUT_TYPE_OPTS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {item.isError && item.errorColumnType ? (
                            <p className="text-xs text-red-500 mt-0.5">{item.errorColumnType}</p>
                          ) : null}
                        </td>
                        <td className="p-2 align-top">
                          <Select
                            value={item.editableBy || undefined}
                            onValueChange={(v) => handleBuilderInputChange(i, "editableBy", v)}
                          >
                            <SelectTrigger className={`h-8 w-[120px] ${item.isError && item.errorEditableBy ? "border-red-500" : ""}`}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              {EDITABLE_BY_OPTS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {item.isError && item.errorEditableBy ? (
                            <p className="text-xs text-red-500 mt-0.5">{item.errorEditableBy}</p>
                          ) : null}
                        </td>
                        <td className="p-2 align-top">
                          {item.columnName === "Total" ? (
                            <Input
                              name="formula"
                              value={item.formula}
                              onChange={(e) => handleBuilderInputChange(i, "formula", e.target.value)}
                              className="h-8"
                              placeholder="e.g. C3*C4"
                            />
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2 align-top">
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              type="button"
                              size="sm"
                              variant={item.viewedBy === "Both" ? "default" : "outline"}
                              className="h-7 text-xs"
                              onClick={() => toggleBuilderViewedBy(i, "Both")}
                            >
                              Both
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={item.viewedBy === "Buyer" ? "default" : "outline"}
                              className="h-7 text-xs"
                              onClick={() => toggleBuilderViewedBy(i, "Buyer")}
                            >
                              Buyer
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
      </FormSheet>

      {/* Upload Excel Dialog */}
      <FormSheet
        open={uploadExcelOpen}
        onOpenChange={(o) => { setUploadExcelOpen(o); if (!o) { setImportFileName(""); setImportedFile(null); } }}
        title="Import Excel"
        description="Follow the steps below to import line items from an Excel file."
        onSubmit={handleImportProceed}
        submitLabel="Proceed"
        submitDisabled={!importedFile}
        widthClassName="sm:max-w-md"
      >
          <p className="text-sm text-muted-foreground mb-4">
            Follow the steps below to import line items from an Excel file.
          </p>
          <div className="space-y-4 text-sm">
            <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
              <li>Download the template for this auction template.</li>
              <li>
                Open the downloaded file, fill in the data, and save it.{" "}
                <span className="text-xs italic">Note: maximum 500 rows.</span>
              </li>
              <li>Select the updated file below and click <strong>Proceed</strong>.</li>
            </ol>

            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-1" />
                Download template
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Select file to import</Label>
              <div className="flex items-center gap-2">
                <Input
                  readOnly
                  value={importFileName}
                  placeholder="No file selected"
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => excelFileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  Browse
                </Button>
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleFileSelect}
                />
              </div>
            </div>
          </div>
      </FormSheet>
    </>
  );
}
