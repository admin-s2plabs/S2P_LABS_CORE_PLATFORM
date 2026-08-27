import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  ChevronsUpDown,
  File,
  FileImage,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import TermsConditions from "../common/terms-conditions";

interface Organization {
  id: number;
  organization_name: string;
  currency: string;
}

interface LookupItem {
  value: string;
  label: string;
  id?: number;
}

interface DboSupplier {
  id: number;
  companyName?: string;
  status?: string;
}

interface Department {
  id: number;
  value: string;
}

interface Budget {
  id: number;
  budget_name?: string;
  name?: string;
}

interface InvoiceLine {
  id: string;
  item_id: string;
  item_name: string;
  category_code: string;
  category: string;
  entry_mode: "master" | "freetext";
  delivery_date: string;
  order_qty: string;
  order_unit: string;
  unit_cost: string;
  line_cost: string;
  tax_rate_code: string;
  tax_amount: string;
  inclusiveTaxAmt?: string;
}

interface DocumentItem {
  id: string;
  name: string;
  file?: File;
  previewUrl?: string | null;
}

const ALLOWED_FILE_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
};
const MAX_FILE_SIZE_MB = 5;
const DANGEROUS_EXTS = [".exe", ".bat", ".cmd", ".sh", ".ps1", ".msi", ".vbs", ".js", ".jar", ".php", ".html", ".htm", ".svg", ".xml", ".dll", ".scr"];

const INVOICE_TYPES = [
  { value: "Standard", label: "Standard" },
  { value: "Credit", label: "Credit" },
  { value: "Debit", label: "Debit" },
  { value: "Prepayment", label: "Prepayment" },
];

function generateLineId() {
  return `line_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

function generateDocId() {
  return `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export default function CreateNonPoInvoice() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const authData = typeof window !== "undefined" ? localStorage.getItem("prokraya-auth") : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const userOrgIds: string[] = authParsed?.orgIds
    ? authParsed.orgIds.split(",").map((id: string) => id.trim())
    : [];
  const userRole: string = authParsed?.userRole || "";
  const isSuperadmin = userRole === "ROLE_SUPERADMIN" || userRole === "ROLE_SYSADMIN";

  const [form, setForm] = useState({
    supplier_id: "",
    supplier_name: "",
    department_name: "",
    invoice_number: "",
    invoice_date: new Date().toISOString().split("T")[0],
    invoice_type: "Standard",
    invoice_curr_code: "",
    description: "",
    reason_for_non_po: "",
    budget_id: "",
    budget_name: "",
    payment_terms_name: "",
    payment_terms_id: "",
    orgId: "",
    tax_included: "No",
  });

  const [vendorSearch, setVendorSearch] = useState("");
  const [vendorDropdownOpen, setVendorDropdownOpen] = useState(false);
  const [invoiceNumDuplicate, setInvoiceNumDuplicate] = useState<{ duplicate: boolean; invoice?: { id: number; invoice_number: string; supplier_name: string; invoice_status: string } } | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lineSheetOpen, setLineSheetOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<InvoiceLine | null>(null);
  const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");
  const [lineForm, setLineForm] = useState<InvoiceLine>({
    id: "",
    item_id: "",
    item_name: "",
    category_code: "",
    category: "",
    entry_mode: "master",
    delivery_date: "",
    order_qty: "",
    order_unit: "",
    unit_cost: "",
    line_cost: "",
    tax_rate_code: "",
    tax_amount: "",
    inclusiveTaxAmt: "",
  });
  const [itemPopoverOpen, setItemPopoverOpen] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const { data: suppliersData } = useQuery<{ data: DboSupplier[]; total: number }>({
    queryKey: ["/api/dbo/suppliers", { page: 1, limit: 500, status: "Active,Changes In Draft" }],
    queryFn: () => apiRequest("GET", "/api/dbo/suppliers?page=1&limit=500&status=Active%2CChanges%20In%20Draft").then(r => r.json()),
  });
  const vendors = suppliersData?.data || [];

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const { data: currencies = [] } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: paymentTerms = [] } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups/payment-terms"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const initializeBaseValues = useRef(false);

  useEffect(() => {
    if (initializeBaseValues.current) return;
    if (!orgDetails?.currency || !currencies.length || !paymentTerms.length || !orgDetails?.default_paymentterms) return;
    initializeBaseValues.current = true;
    const defaultCurrency = currencies.find(
      (t) => t.value === orgDetails.currency
    );
    if (defaultCurrency) {
      setForm((prev: any) => ({
        ...prev,
        invoice_curr_code: defaultCurrency.value,
      }));
    }
    const defaultTerm = paymentTerms.find(
      (t) => t.value === orgDetails.default_paymentterms
    );
    if (defaultTerm) {
      setForm((prev: any) => ({
        ...prev,
        payment_terms_name: defaultTerm.label,
        payment_terms_id: defaultTerm.value,
      }));
    }
  }, [currencies, paymentTerms, orgDetails]);

  const { data: budgetLinesData } = useQuery<
    {
      id: number;
      segment_dtl_code: string;
      segment_dtl_name: string;
      amount: string;
      consumed_amount: string;
      reserved_amount: string;
      business_entity: string;
      budget_mst_id: number;
      budget_name: string;
      budget_curr: string;
      dept_id: string;
    }[]
  >({
    queryKey: ["/api/budgets/approved-lines"],
  });

  const budgetLines = budgetLinesData || [];

  const { data: categoriesData } = useQuery<{ id: string; code: string; name: string; level: string }[]>({
    queryKey: ["/api/categories"],
  });
  const categories = categoriesData || [];

  const { data: itemsData } = useQuery<{ id: string; itemCode: string; name: string; categoryCode: string; categoryName: string; unitOfMeasure: string; standardPrice: number | null }[]>({
    queryKey: ["/api/items"],
  });

  const items = itemsData || [];
  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: lineSheetOpen,
  });
  const uomOptions = uomData || [];

  const { data: taxCodesData } = useQuery<{ id: number; tax_code_id: string; tax_code: string; tax_code_desc: string; tax_rate: number; tax_type: string }[]>({
    queryKey: ["/api/tax-codes"],
  });
  const taxCodes = taxCodesData || [];
  const defaultTaxCode = taxCodes.find((t) => t.tax_code === orgDetails.default_tax);

  const filteredVendors = vendors.filter((v) => {
    const name = v.companyName || "";
    return name.toLowerCase().includes(vendorSearch.toLowerCase());
  });

  const updateForm = (field: string, value: any) => {
    if (field === "tax_included" && form.tax_included !== value && lines.length > 0) {
      toast({
        title: "Warning!!",
        description: `There are few lines already added with Tax Type ${value === "Yes" ? "Exclusive" : "Inclusive"}`,
        variant: "destructive",
      });
      // Force React state update to reset the controlled Select component to the previous value
      setForm((prev) => ({ ...prev }));
      return;
    }
    setForm((prev) => ({ ...prev, [field]: value }));
    if (field === "invoice_number") {
      setInvoiceNumDuplicate(null);
    }
  };

  const checkInvoiceNumberDuplicate = async (invoiceNumber: string) => {
    if (!invoiceNumber.trim()) {
      setInvoiceNumDuplicate(null);
      return;
    }
    setCheckingDuplicate(true);
    try {
      const res = await apiRequest("GET", `/api/invoices/check-duplicate?invoice_number=${encodeURIComponent(invoiceNumber.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setInvoiceNumDuplicate(data);
      }
    } catch {
      setInvoiceNumDuplicate(null);
    } finally {
      setCheckingDuplicate(false);
    }
  };

  const emptyLineForm: InvoiceLine = {
    id: "",
    item_id: "",
    item_name: "",
    category_code: "",
    category: "",
    entry_mode: "master",
    delivery_date: "",
    order_qty: "",
    order_unit: "",
    unit_cost: "",
    line_cost: "",
    tax_rate_code: orgDetails.default_tax || "",
    tax_amount: "",
    inclusiveTaxAmt: "",
  };

  const openAddLine = () => {
    setEditingLine(null);
    setLineForm({ ...emptyLineForm, id: generateLineId(), tax_rate_code: defaultTaxCode?.tax_rate.toString() || "" });
    setLineSheetOpen(true);
  };

  const openEditLine = (line: InvoiceLine) => {
    setEditingLine(line);
    const lineTotal = (parseFloat(line.line_cost) || 0) + (parseFloat(line.tax_amount) || 0);
    setLineForm({
      ...line,
      inclusiveTaxAmt: line.inclusiveTaxAmt || (lineTotal > 0 ? lineTotal.toFixed(2) : ""),
    });
    setLineSheetOpen(true);
  };

  const updateLineForm = (field: string, value: string) => {
    setLineForm((prev) => {
      const updated = { ...prev, [field]: value };
      const isInclusive = form.tax_included === "Yes";

      if (isInclusive) {
        if (field === "order_qty" || field === "inclusiveTaxAmt" || field === "tax_rate_code") {
          const qty = parseFloat(updated.order_qty) || 0;
          const lineTotal = parseFloat(updated.inclusiveTaxAmt || "") || 0;
          const taxRate = parseFloat(updated.tax_rate_code) || 0;

          const taxAmount = (lineTotal * taxRate) / 100;
          const netAmount = Math.max(0, lineTotal - taxAmount);
          const unitCost = qty > 0 ? netAmount / qty : 0;

          updated.tax_amount = taxAmount.toFixed(2);
          updated.line_cost = netAmount.toFixed(2);
          updated.unit_cost = unitCost.toFixed(2);
        }
      } else {
        if (field === "order_qty" || field === "unit_cost" || field === "tax_rate_code") {
          const qty = parseFloat(updated.order_qty) || 0;
          const cost = parseFloat(updated.unit_cost) || 0;
          const lineCost = qty * cost;
          updated.line_cost = lineCost.toFixed(2);
          if (updated.tax_rate_code) {
            const taxRate = parseFloat(updated.tax_rate_code) || 0;
            updated.tax_amount = (lineCost * (taxRate / 100)).toFixed(2);
          }
        }
      }
      return updated;
    });
  };

  const saveLine = () => {
    if (!lineForm.item_id) {
      toast({ title: "Validation Error", description: "Please select an item from the catalog.", variant: "destructive" });
      return;
    }
    if (!lineForm.order_unit) {
      toast({ title: "Validation Error", description: "Unit of Measure is required.", variant: "destructive" });
      return;
    }
    if (!lineForm.order_qty || parseFloat(lineForm.order_qty) <= 0) {
      toast({ title: "Validation Error", description: "Order Qty is required.", variant: "destructive" });
      return;
    }
    if (form.tax_included === "Yes") {
      if (!lineForm.inclusiveTaxAmt || parseFloat(lineForm.inclusiveTaxAmt) <= 0) {
        toast({ title: "Validation Error", description: "Line Total is required.", variant: "destructive" });
        return;
      }
    } else {
      if (!lineForm.unit_cost || parseFloat(lineForm.unit_cost) <= 0) {
        toast({ title: "Validation Error", description: "Unit Cost is required.", variant: "destructive" });
        return;
      }
    }
    const lineToSave = { ...lineForm, entry_mode: "master" as const };
    if (editingLine) {
      setLines((prev) => prev.map((l) => (l.id === editingLine.id ? lineToSave : l)));
    } else {
      setLines((prev) => [...prev, lineToSave]);
    }
    setLineSheetOpen(false);
    setEditingLine(null);
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((line) => line.id !== id));
  };

  useEffect(() => {
    if (!selectedFile) return;

    const processFile = async () => {
      let preview: string | null = null;

      if (selectedFile.type.startsWith("image/")) {
        preview = await new Promise<string | null>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(selectedFile);
        });
      } else if (selectedFile.type === "application/pdf") {
        try {
          const pdfjsLib = await import("pdfjs-dist");
          pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
            "pdfjs-dist/build/pdf.worker.mjs",
            import.meta.url
          ).toString();
          const arrayBuffer = await selectedFile.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          const scale = 280 / viewport.width;
          const scaledViewport = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaledViewport.width;
          canvas.height = scaledViewport.height;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport: scaledViewport, canvas }).promise;
            preview = canvas.toDataURL("image/png");
          }
        } catch (err) {
          console.error("PDF preview error:", err);
        }
      }

      addDocumentToList(selectedFile, preview);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    processFile();
  }, [selectedFile]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name || "";
    if (fileName.includes("\0") || fileName.includes("..")) {
      toast({ title: "Invalid filename detected", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const ext = fileName.lastIndexOf(".") >= 0 ? fileName.substring(fileName.lastIndexOf(".")).toLowerCase() : "";
    if (!ext) {
      toast({ title: "File must have a valid extension", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (DANGEROUS_EXTS.includes(ext)) {
      toast({ title: "This file type is not allowed", variant: "destructive" });
      e.target.value = "";
      return;
    }

    const isAllowed = Object.entries(ALLOWED_FILE_TYPES).some(
      ([mime, exts]) => exts.includes(ext) || file.type === mime
    );
    if (!isAllowed) {
      toast({ title: "Unsupported file type. Allowed: PDF, JPG, PNG, DOC, DOCX", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size === 0) {
      toast({ title: "File is empty (0KB). Please upload a valid document.", variant: "destructive" });
      e.target.value = "";
      return;
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({ title: `File too large. Max ${MAX_FILE_SIZE_MB}MB allowed.`, variant: "destructive" });
      e.target.value = "";
      return;
    }

    setSelectedFile(file);
  }

  const addDocumentToList = (file: File, preview: string | null) => {
    setDocuments((prev) => [...prev, {
      id: generateDocId(),
      name: file.name,
      file: file,
      previewUrl: preview,
    }]);
  };

  const removeDocument = (id: string) => {
    setDocuments((prev) => prev.filter((doc) => doc.id !== id));
  };

  const totalAmount = lines.reduce((sum, line) => {
    const lineCost = parseFloat(line.line_cost) || 0;
    const taxAmount = parseFloat(line.tax_amount) || 0;
    return sum + lineCost + taxAmount;
  }, 0);

  const submitMutation = useMutation({
    mutationFn: async ({ submissionType }: { submissionType: "Draft" | "Submit" }) => {
      const invoiceData = {
        invoice_number: form.invoice_number,
        invoice_type: form.invoice_type,
        invoice_curr_code: form.invoice_curr_code,
        invoice_date: form.invoice_date,
        supplier_id: form.supplier_id,
        supplier_name: form.supplier_name,
        description: form.description,
        department_name: form.department_name,
        reason_for_non_po: form.reason_for_non_po,
        payment_terms_name: form.payment_terms_name,
        payment_terms_id: form.payment_terms_id,
        budget_segment: form.budget_id,
        budget_name: form.budget_name,
        org_id: form.orgId ? parseInt(form.orgId, 10) : null,
        submissionType,
        tax_included: form.tax_included || "No",
      };

      const invLines = lines.map((line) => {
        const taxCode = taxCodes.find((t) => Number(t.tax_rate) === Number(line.tax_rate_code));
        return {
          item_id: line.item_id,
          item_name: line.item_name,
          category: line.category,
          order_qty: line.order_qty,
          unit_cost: line.unit_cost,
          order_unit: line.order_unit,
          tax_rate: taxCode ? String(taxCode.tax_rate) : "0",
          tax_rate_code: line.tax_rate_code,
          tax_amount: line.tax_amount,
          tax_rate_id: taxCode ? taxCode.id : null,
          delivery_date:line.delivery_date,
        };
      });

      const formData = new FormData();
      formData.append("invoiceData", JSON.stringify(invoiceData));
      formData.append("invLines", JSON.stringify(invLines));

      const docPreviews: (string | null)[] = [];
      for (const doc of documents) {
        if (doc.file) {
          formData.append("invDocFiles", doc.file);
          docPreviews.push(doc.previewUrl || null);
        }
      }
      formData.append("docPreviews", JSON.stringify(docPreviews));

      const res = await apiRequest("POST", "/api/invoices/non-po", formData);

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to submit invoice" }));
        throw new Error(errData.error || "Failed to submit invoice");
      }

      return res.json();
    },
    onSuccess: (result, variables) => {
      toast({
        title: variables.submissionType === "Draft"
          ? "NON-PO Invoice saved as draft"
          : "NON-PO Invoice submitted for approval",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setLocation(`/app/invoices/${result.invoiceId}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to submit invoice",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const selectedBudgetLine = budgetLines?.find((bl) => String(bl.id) === form.budget_id);
  const availableBudget = selectedBudgetLine
    ? (parseFloat(selectedBudgetLine.amount) || 0) -
    (parseFloat(selectedBudgetLine.consumed_amount) || 0) -
    (parseFloat(selectedBudgetLine.reserved_amount) || 0)
    : null;
  const budgetExceeded = availableBudget !== null && lines.length > 0 && totalAmount > availableBudget;

  const isFormValid =
    form.supplier_name &&
    form.department_name &&
    form.orgId &&
    form.invoice_number &&
    form.invoice_date &&
    form.invoice_type &&
    form.invoice_curr_code &&
    form.description &&
    form.reason_for_non_po &&
    form.budget_id &&
    form.budget_name &&
    form.payment_terms_id;
  const canSubmit = isFormValid && agreedToTerms && lines.length > 0 && !invoiceNumDuplicate?.duplicate && documents?.length > 0 && !budgetExceeded;
  const canSaveDraft = Boolean(form.supplier_name && form.department_name && form.orgId && form.invoice_number && !invoiceNumDuplicate?.duplicate) && agreedToTerms;
  const activeSubmissionType = (submitMutation.variables as { submissionType?: "Draft" | "Submit" } | undefined)?.submissionType;
  const isSubmitPending = submitMutation.isPending && activeSubmissionType === "Submit";
  const isDraftPending = submitMutation.isPending && activeSubmissionType === "Draft";

  const filteredBudgets = budgetLines?.filter((item) => {
    if (!form.orgId && !form.department_name) {
      return false;
    }
    const matchOrg =
      !form.orgId ||
      item.business_entity
        ?.split(",")
        .map((id) => id.trim())
        .includes(String(form.orgId));
    const selectedDept = departments.find(
      (d) => d.value === form.department_name
    );
    const matchDept =
      !form.department_name ||
      item.dept_id
        ?.split(",")
        .map((id) => id.trim())
        .includes(String(selectedDept?.id));
    return matchOrg && matchDept;
  });
  const uniqueBudgets = Array.from(
    new Map(
      filteredBudgets?.map((item) => [item.id, item])
    ).values()
  );

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Link href="/app/invoices">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-lg font-semibold" data-testid="text-page-title">
              Create NON-PO Invoice
            </h1>
            <p className="text-sm text-muted-foreground">
              Please enter all fields for creating NON-PO Invoice.
            </p>
          </div>
        </div>
        <Badge variant="secondary">NON-PO</Badge>
      </div>

      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Invoice Details
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 relative">
                  <Label className="text-xs">
                    Vendor <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={vendorDropdownOpen ? vendorSearch : form.supplier_name || vendorSearch}
                      onChange={(e) => {
                        setVendorSearch(e.target.value);
                        setVendorDropdownOpen(true);
                        if (!e.target.value) {
                          updateForm("supplier_id", "");
                          updateForm("supplier_name", "");
                        }
                      }}
                      onFocus={() => setVendorDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setVendorDropdownOpen(false), 200)}
                      placeholder="Search by Name..."
                      className="pl-8"
                      data-testid="input-vendor-search"
                    />
                    {vendorDropdownOpen && (
                      <div className="absolute z-50 top-full left-0 w-full mt-1 border rounded-md bg-background shadow-md max-h-48 overflow-y-auto">
                        {filteredVendors.length === 0 ? (
                          <p className="text-sm text-muted-foreground p-2">No vendors found</p>
                        ) : (
                          filteredVendors.map((vendor) => {
                            const name = vendor.companyName || "";
                            return (
                              <button
                                key={"vendor" + vendor.id}
                                className="w-full text-left px-3 py-2 text-sm hover-elevate cursor-pointer"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => {
                                  updateForm("supplier_id", String(vendor.id));
                                  updateForm("supplier_name", name);
                                  setVendorDropdownOpen(false);
                                  setVendorSearch("");
                                }}
                                data-testid={`vendor-option-${vendor.id}`}
                              >
                                {name}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Department <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.department_name}
                    onValueChange={(v) => updateForm("department_name", v)}
                  >
                    <SelectTrigger data-testid="select-department">
                      <SelectValue placeholder="Select Department" />
                    </SelectTrigger>
                    <SelectContent>
                      {departments.map((dept) => (
                        <SelectItem key={"dept" + dept.id} value={dept.value}>
                          {dept.value}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs" htmlFor="invoice-business-entity">
                    Business Entity <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.orgId || ""}
                    onValueChange={(value) => {
                      updateForm("orgId", value);
                      updateForm("budget_id", "");
                      updateForm("budget_name", "");
                      updateForm("invoice_curr_code", organizations?.filter((item) => String(item.id) === String(value))[0]?.currency);
                    }}
                  >
                    <SelectTrigger
                      id="invoice-business-entity"
                      data-testid="select-invoice-business-entity"
                    >
                      <SelectValue placeholder="Select business entity..." />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations
                        ?.filter((org) => !isSuperadmin ? userOrgIds.includes(String(org.id)) : true)
                        ?.map((org) => (
                          <SelectItem key={"org" + org.id} value={String(org.id)}>
                            {org.organization_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Invoice Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={form.invoice_number}
                    onChange={(e) => updateForm("invoice_number", e.target.value)}
                    onBlur={() => checkInvoiceNumberDuplicate(form.invoice_number)}
                    placeholder="Enter invoice number"
                    data-testid="input-invoice-number"
                    className={invoiceNumDuplicate?.duplicate ? "border-destructive focus-visible:ring-destructive" : ""}
                  />
                  {checkingDuplicate && (
                    <p className="text-xs text-muted-foreground" data-testid="text-checking-duplicate">Checking for duplicates...</p>
                  )}
                  {invoiceNumDuplicate?.duplicate && invoiceNumDuplicate.invoice && (
                    <p className="text-xs text-destructive" data-testid="text-duplicate-warning">
                      Duplicate: Invoice "{invoiceNumDuplicate.invoice.invoice_number}" already exists for {invoiceNumDuplicate.invoice.supplier_name} (Status: {invoiceNumDuplicate.invoice.invoice_status})
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Invoice Date <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="date"
                    value={form.invoice_date}
                    onChange={(e) => updateForm("invoice_date", e.target.value)}
                    data-testid="input-invoice-date"
                  />
                </div>

                {/* <div className="space-y-1.5">
                  <Label className="text-xs">
                    Invoice Type <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.invoice_type}
                    onValueChange={(v) => updateForm("invoice_type", v)}
                  >
                    <SelectTrigger data-testid="select-invoice-type">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {INVOICE_TYPES.map((type) => (
                        <SelectItem key={"type" + type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div> */}

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Invoice Currency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.invoice_curr_code}
                    onValueChange={(v) => updateForm("invoice_curr_code", v)}
                  >
                    <SelectTrigger data-testid="select-currency">
                      <SelectValue placeholder="Select Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={"curr" + c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Payment Terms <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.payment_terms_name}
                    onValueChange={(v) => updateForm("payment_terms_name", v)}
                  >
                    <SelectTrigger data-testid="select-payment-terms">
                      <SelectValue placeholder="Select Payment Terms" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTerms.map((pt) => (
                        <SelectItem key={"term" + pt.value} value={pt.label}>
                          {pt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Invoice Description <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => updateForm("description", e.target.value)}
                    placeholder="Enter invoice description"
                    rows={2}
                    data-testid="input-description"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">
                    Reason for NON-PO Invoice <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    value={form.reason_for_non_po}
                    onChange={(e) => updateForm("reason_for_non_po", e.target.value)}
                    placeholder="Enter reason for non-PO invoice"
                    rows={2}
                    data-testid="input-reason"
                  />
                </div>

                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">
                    Budget <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.budget_id}
                    onValueChange={(v) => {
                      const selectedDept = departments.find(
                        (d) => d.value === form.department_name
                      );
                      const selectedBudget = budgetLines
                        ?.filter((item) => {
                          const matchOrg =
                            !form.orgId ||
                            item.business_entity
                              ?.split(",")
                              .map((id) => id.trim())
                              .includes(String(form.orgId));
                          const matchDept =
                            !form.department_name ||
                            item.dept_id
                              ?.split(",")
                              .map((id) => id.trim())
                              .includes(String(selectedDept?.id));
                          return matchOrg && matchDept;
                        })
                        ?.find((bl) => String(bl.id) === v);
                      updateForm("budget_id", v);
                      updateForm(
                        "budget_name",
                        selectedBudget
                          ? `${selectedBudget.budget_name} . ${selectedBudget.segment_dtl_name}`
                          : ""
                      );
                    }}
                  >
                    <SelectTrigger data-testid="select-budget">
                      <SelectValue placeholder="Select Budget">
                        {form.budget_id &&
                          (() => {
                            const selectedDept = departments.find(
                              (d) => d.value === form.department_name
                            )
                            const selected = budgetLines
                              ?.filter((item) => {

                                const matchOrg =
                                  !form.orgId ||
                                  item.business_entity
                                    ?.split(",")
                                    .map((id) => id.trim())
                                    .includes(String(form.orgId));

                                const matchDept =
                                  !form.department_name ||
                                  item.dept_id
                                    ?.split(",")
                                    .map((id) => id.trim())
                                    .includes(String(selectedDept?.id));

                                return matchOrg && matchDept;
                              })
                              ?.find((bl) => String(bl.id) === form.budget_id);
                            return selected
                              ? `${selected.budget_name} . ${selected.segment_dtl_name}`
                              : "Select Budget";
                          })()}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {uniqueBudgets?.length > 0 ? uniqueBudgets
                        ?.map((budgetLine, index) => {
                          const lineAmount = Math.max(
                            0,
                            (parseFloat(budgetLine.amount) || 0) -
                            (parseFloat(budgetLine.consumed_amount) || 0) -
                            (parseFloat(budgetLine.reserved_amount) || 0),
                          );
                          const currencySymbol =
                            budgetLine.budget_curr === "INR"
                              ? "₹ "
                              : budgetLine.budget_curr === "USD"
                                ? "$ "
                                : budgetLine.budget_curr === "AED"
                                  ? "AED "
                                  : budgetLine.budget_curr === "EUR"
                                    ? "€ "
                                    : budgetLine.budget_curr === "GBP"
                                      ? "£ "
                                      : budgetLine.budget_curr + " ";
                          return (
                            <SelectItem
                              key={"budget" + budgetLine.id + "-" + index}
                              value={String(budgetLine.id)}
                              className="py-2"
                            >
                              <div className="flex flex-col">
                                <span>
                                  {budgetLine.budget_name} .{" "}
                                  {budgetLine.segment_dtl_name}
                                </span>
                                <span className="text-xs text-green-600">
                                  Available Budget - {currencySymbol}
                                  {lineAmount.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        }) : <div className="p-2 text-sm text-muted-foreground">
                        No budgets available in selected entity
                      </div>}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="flex flex-col h-full">
              <h3 className="text-sm font-semibold mb-2">
                Click here or Drag and Drop to Upload Documents <span className="text-destructive">*</span>
              </h3>
              <div className="flex-1 overflow-y-auto max-h-[420px] space-y-2 border rounded-md p-2">
                {documents.map((doc) => {
                  const isPdf = doc.file?.type === "application/pdf" || doc.name.toLowerCase().endsWith(".pdf");
                  const isImage = doc.file?.type?.startsWith("image/") || doc.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);
                  return (
                    <div
                      key={"document" + doc.id}
                      className="relative border rounded-md overflow-hidden group"
                      data-testid={`doc-item-${doc.id}`}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-0.5 right-0.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity bg-background/70"
                        style={{ visibility: "visible" }}
                        onClick={() => removeDocument(doc.id)}
                        data-testid={`button-remove-doc-${doc.id}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      {doc.previewUrl ? (
                        <img src={doc.previewUrl} alt={doc.name} className="w-full h-[280px] object-cover rounded-t" />
                      ) : isPdf ? (
                        <div className="flex justify-center py-4">
                          <FileText className="h-10 w-10 text-red-500/70" />
                        </div>
                      ) : isImage ? (
                        <div className="flex justify-center py-4">
                          <FileImage className="h-10 w-10 text-blue-500/70" />
                        </div>
                      ) : (
                        <div className="flex justify-center py-4">
                          <File className="h-10 w-10 text-muted-foreground/70" />
                        </div>
                      )}
                      <p className="text-[11px] text-primary truncate w-full px-1.5 py-1">{doc.name}</p>
                    </div>
                  );
                })}

                <div
                  className="border-2 border-dashed rounded-md text-center cursor-pointer hover-elevate"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const file = e.dataTransfer.files?.[0];
                    if (file) {
                      const dt = new DataTransfer();
                      dt.items.add(file);
                      if (fileInputRef.current) {
                        fileInputRef.current.files = dt.files;
                        fileInputRef.current.dispatchEvent(new Event("change", { bubbles: true }));
                      }
                    }
                  }}
                  data-testid="dropzone-upload"
                >
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    data-testid="input-file-upload"
                  />
                  <div className="p-4">
                    <Upload className="h-8 w-8 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground font-medium">Upload</p>
                    <p className="text-[10px] text-destructive mt-0.5">Allowed: PDF, Image (JPEG, PNG)</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" />
            Invoice Lines
          </CardTitle>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap" htmlFor="incl-of-tax">Type of Tax</Label>
              <Select
                value={form.tax_included || "No"}
                onValueChange={(v) => updateForm("tax_included", v)}
              >
                <SelectTrigger id="incl-of-tax" className="w-[120px] h-8 text-xs" data-testid="select-incl-of-tax">
                  <SelectValue placeholder="Select Type of Tax" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Inclusive</SelectItem>
                  <SelectItem value="No">Exclusive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={openAddLine} data-testid="button-add-line">
              <Plus className="h-4 w-4 mr-1" />
              Add Invoice Line
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {lines.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No invoice lines added yet</p>
              <p className="text-xs mt-1">Click "Add Invoice Line" to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">#</TableHead>
                    <TableHead className="min-w-[150px]">Item</TableHead>
                    <TableHead className="min-w-[120px]">Category</TableHead>
                    <TableHead className="min-w-[100px]">Delivery Date</TableHead>
                    <TableHead className="min-w-[60px] text-right">Qty</TableHead>
                    <TableHead className="min-w-[60px]">Unit</TableHead>
                    <TableHead className="min-w-[80px] text-right">Unit Cost</TableHead>
                    <TableHead className="min-w-[80px] text-right">Line Cost</TableHead>
                    <TableHead className="min-w-[80px]">Tax Code</TableHead>
                    <TableHead className="min-w-[80px] text-right">Tax Amount</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line, idx) => (
                    <TableRow key={"line" + line.id}>
                      <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-medium" data-testid={`text-line-item-${line.id}`}>{line.item_name || "-"}</TableCell>
                      <TableCell className="text-sm" data-testid={`text-line-category-${line.id}`}>{line.category || "-"}</TableCell>
                      <TableCell className="text-sm">{line.delivery_date || "-"}</TableCell>
                      <TableCell className="text-sm text-right">{line.order_qty || "-"}</TableCell>
                      <TableCell className="text-sm">{line.order_unit || "-"}</TableCell>
                      <TableCell className="text-sm text-right">{line.unit_cost ? parseFloat(line.unit_cost).toFixed(2) : "-"}</TableCell>
                      <TableCell className="text-sm text-right font-medium">{line.line_cost ? parseFloat(line.line_cost).toFixed(2) : "-"}</TableCell>
                      <TableCell className="text-sm">{line.tax_rate_code || "-"}</TableCell>
                      <TableCell className="text-sm text-right">{line.tax_amount ? parseFloat(line.tax_amount).toFixed(2) : "-"}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditLine(line)}
                            data-testid={`button-edit-line-${line.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => removeLine(line.id)}
                            className="text-destructive"
                            data-testid={`button-remove-line-${line.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {lines.length > 0 && (
            <div className="flex justify-end mt-3 pt-3 border-t">
              <div className="text-sm space-y-1">
                <div className="flex items-center gap-4 justify-end">
                  <span className="text-muted-foreground">Subtotal:</span>
                  <span className="font-medium w-24 text-right">
                    {lines
                      .reduce((s, l) => s + (parseFloat(l.line_cost) || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-4 justify-end">
                  <span className="text-muted-foreground">Tax:</span>
                  <span className="font-medium w-24 text-right">
                    {lines
                      .reduce((s, l) => s + (parseFloat(l.tax_amount) || 0), 0)
                      .toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center gap-4 justify-end border-t pt-1">
                  <span className="font-semibold">Total ({form.invoice_curr_code}):</span>
                  <span className="font-bold w-24 text-right">{totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={lineSheetOpen} onOpenChange={setLineSheetOpen}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-lg">{editingLine ? "Edit Invoice Line" : "Add Invoice Line"}</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-2">
            {(
              <div className="space-y-1.5">
                <Label className="text-sm">Select Item <span className="text-destructive">*</span></Label>
                <Popover open={itemPopoverOpen} onOpenChange={setItemPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={itemPopoverOpen}
                      className="w-full justify-between font-normal"
                      data-testid="button-select-item"
                    >
                      {
                        lineForm.item_id
                          ? (() => {
                            const item = items.find(i => i.id === lineForm.item_id);
                            return item
                              ? `${item.itemCode} - ${item.name}`
                              : lineForm.item_name || "Search and select an item...";
                          })()
                          : "Search and select an item..."
                      }
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search items..." />
                      <CommandList>
                        <CommandEmpty>No items found.</CommandEmpty>
                        <CommandGroup>
                          {items.map((item) => (
                            <CommandItem
                              key={"item" + item.id}
                              value={`${item.itemCode} ${item.name}`}
                              onSelect={() => {
                                setLineForm((prev) => {
                                  const isInclusive = form.tax_included === "Yes";
                                  const baseCost = item.standardPrice ? String(item.standardPrice) : prev.unit_cost;
                                  const baseQty = prev.order_qty || "1";

                                  const qty = parseFloat(baseQty) || 0;
                                  const cost = parseFloat(baseCost) || 0;

                                  const lineCost = qty * cost;
                                  const taxRate = parseFloat(prev.tax_rate_code) || 0;
                                  const taxAmount = lineCost * (taxRate / 100);
                                  const inclusiveTaxAmt = (lineCost + taxAmount).toFixed(2);

                                  const updated = {
                                    ...prev,
                                    item_id: item.id,
                                    item_name: item.name,
                                    category_code: item.categoryCode || "",
                                    category: item.categoryName || "",
                                    order_unit: item.unitOfMeasure || "EA",
                                    unit_cost: baseCost,
                                    order_qty: baseQty,
                                    line_cost: lineCost.toFixed(2),
                                    tax_amount: taxAmount.toFixed(2),
                                    inclusiveTaxAmt: inclusiveTaxAmt,
                                  };

                                  if (isInclusive) {
                                    const qtyVal = parseFloat(baseQty) || 1;
                                    const totalVal = qtyVal * cost;
                                    const taxVal = (totalVal * taxRate) / 100;
                                    const netVal = Math.max(0, totalVal - taxVal);
                                    const calculatedUnitCost = qtyVal > 0 ? netVal / qtyVal : 0;

                                    updated.inclusiveTaxAmt = totalVal.toFixed(2);
                                    updated.unit_cost = calculatedUnitCost.toFixed(2);
                                    updated.line_cost = netVal.toFixed(2);
                                    updated.tax_amount = taxVal.toFixed(2);
                                  }

                                  return updated;
                                });
                                setItemPopoverOpen(false);
                              }}
                              data-testid={`item-option-${item.id}`}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  lineForm.item_id === item.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{item.itemCode} - {item.name}</span>
                                {item.categoryName && (
                                  <span className="text-xs text-muted-foreground">{item.categoryName}</span>
                                )}
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {lineForm.category && (
                  <div className="text-xs text-muted-foreground">
                    Category: {lineForm.category}
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Delivery Date</Label>
                <Input
                  type="date"
                  value={lineForm.delivery_date}
                  onChange={(e) => updateLineForm("delivery_date", e.target.value)}
                  data-testid="input-line-delivery-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Unit of Measure <span className="text-destructive">*</span></Label>
                <Select
                  value={lineForm.order_unit}
                  onValueChange={(v) => updateLineForm("order_unit", v)}
                >
                  <SelectTrigger id="line-uom" data-testid="select-line-uom">
                    <SelectValue placeholder="Select UoM" />
                  </SelectTrigger>
                  <SelectContent>
                    {uomOptions.map((uom) => (
                      <SelectItem key={uom.id} value={uom.description || "Each"}>
                        {uom.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.tax_included === "Yes" ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Line Total <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineForm.inclusiveTaxAmt || ""}
                    onChange={(e) => updateLineForm("inclusiveTaxAmt", e.target.value)}
                    placeholder="0.00"
                    data-testid="input-line-incl-of-tax-amt"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Order Qty <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineForm.order_qty}
                    onChange={(e) => updateLineForm("order_qty", e.target.value)}
                    placeholder="0"
                    data-testid="input-line-order-qty"
                  />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">Order Qty <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineForm.order_qty}
                    onChange={(e) => updateLineForm("order_qty", e.target.value)}
                    placeholder="0"
                    data-testid="input-line-order-qty"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Unit Cost <span className="text-destructive">*</span></Label>
                  <Input
                    type="number"
                    value={lineForm.unit_cost}
                    onChange={(e) => updateLineForm("unit_cost", e.target.value)}
                    placeholder="0.00"
                    data-testid="input-line-unit-cost"
                  />
                </div>
              </div>
            )}
            {form.tax_included === "Yes" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Unit Cost</Label>
                <Input
                  value={lineForm.unit_cost ? parseFloat(lineForm.unit_cost).toFixed(2) : "0.00"}
                  readOnly
                  className="bg-muted"
                  data-testid="input-line-unit-cost-display"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-sm">Line Cost (Excl. Tax)</Label>
              <Input
                value={lineForm.line_cost ? parseFloat(lineForm.line_cost).toFixed(2) : "0.00"}
                readOnly
                className="bg-muted"
                data-testid="input-line-cost-display"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">Tax Rate</Label>
                <Select
                  value={lineForm.tax_rate_code}
                  onValueChange={(value) => updateLineForm("tax_rate_code", value)}
                >
                  <SelectTrigger data-testid="select-line-tax-rate">
                    <SelectValue placeholder="Select tax rate" />
                  </SelectTrigger>
                  <SelectContent>
                    {taxCodes.map((tax) => (
                      <SelectItem key={"tax" + tax.id} value={String(tax.tax_rate)} data-testid={`select-tax-${tax.id}`}>
                        {tax.tax_code} - {tax.tax_code_desc}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Tax Amount</Label>
                <Input
                  value={lineForm.tax_amount ? parseFloat(lineForm.tax_amount).toFixed(2) : "0.00"}
                  readOnly
                  className="bg-muted"
                  data-testid="input-line-tax-amount"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setLineSheetOpen(false)} data-testid="button-cancel-line">
                Cancel
              </Button>
              <Button
                onClick={saveLine}
                disabled={
                  !lineForm.order_unit ||
                  !lineForm.order_qty ||
                  parseFloat(lineForm.order_qty) <= 0 ||
                  (form.tax_included === "Yes"
                    ? !lineForm.inclusiveTaxAmt || parseFloat(lineForm.inclusiveTaxAmt) <= 0
                    : !lineForm.unit_cost || parseFloat(lineForm.unit_cost) <= 0)
                }
                data-testid="button-save-line"
              >
                {editingLine ? "Update Line" : "Add Line"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {budgetExceeded && (
        <p className="text-sm text-destructive font-medium" data-testid="budget-exceeded-error">
          Invoice amount ({form.invoice_curr_code} {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) exceeds the available budget ({form.invoice_curr_code} {availableBudget!.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}). Please reduce the invoice amount or select a different budget.
        </p>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="terms"
            checked={agreedToTerms}
            onCheckedChange={(checked) => setAgreedToTerms(!!checked)}
            data-testid="checkbox-terms"
          />
          <Label htmlFor="terms" className="text-sm cursor-pointer">
            I Agree to <TermsConditions type="Create Non-PO, PO Invoice" className="text-primary font-medium" dataTestId="link-terms" />
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/app/invoices">
            <Button variant="outline" data-testid="button-cancel">
              Cancel
            </Button>
          </Link>
          <Button
            onClick={() => submitMutation.mutate({ submissionType: "Submit" })}
            disabled={!canSubmit || isSubmitPending || isDraftPending}
            data-testid="button-submit-invoice"
          >
            {isSubmitPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Submit Invoice
          </Button>
          <Button
            onClick={() => submitMutation.mutate({ submissionType: "Draft" })}
            disabled={!canSaveDraft || isSubmitPending || isDraftPending}
            data-testid="button-save-draft"
          >
            {isDraftPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Save as Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
