import prokrayaLogo from "@/assets/images/prokraya-logo-light.png";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getDialCodeByIso,
  getPhoneValidationMessage,
  countryOptions as phoneCountryOptions,
  PhoneInput,
  validatePhoneNumber,
} from "@/components/ui/phone-input";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Coins,
  CreditCard,
  FileText,
  Globe,
  Hash,
  History,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "wouter";
import { z } from "zod";
import { base64ToBlobUrl, TnCData } from "../common/terms-conditions";
import { BASIC_SETTINGS_SERVICE_KEYS, type AIServiceSetting } from "./ai-service-settings";

const orgInfoSchema = z.object({
  organization_name: z.string().min(1, "Name is required"),
  org_legal_name: z.string().min(1, "Legal name is required"),
  org_registration_no: z.string().optional(),
  org_legal_address: z.string().min(1, "Legal address is required"),
  org_city: z.string().min(1, "City is required"),
  org_state: z.string().min(1, "State is required"),
  org_country: z.string().min(1, "Country is required"),
  org_postalcode: z.string().min(1, "Postal code is required"),
  org_phone_no: z
    .string()
    .min(1, "Phone is required")
    .superRefine((v, ctx) => {
      if (v && !validatePhoneNumber(v)) {
        ctx.addIssue({ code: "custom", message: getPhoneValidationMessage(v) });
      }
    }),
  org_email: z.string().email("Valid email is required"),
  date_format: z.string().optional(),
  number_format: z.string().optional(),
  rounding_precision: z.string().optional(),
  currency: z.string().optional(),
  default_paymentterms: z.string().optional(),
  default_tax: z.string().optional(),
  attribute_10: z.string().optional(),
});

type OrgInfoForm = z.infer<typeof orgInfoSchema>;

interface OrgDetails {
  id: number;
  organization_name: string;
  org_legal_name: string;
  org_registration_no: string;
  org_legal_address: string;
  org_city: string;
  org_state: string;
  org_country: string;
  org_postalcode: string;
  org_phone_no: string;
  org_email: string;
  org_logo_path: string | null;
  date_format: string;
  number_format: string;
  rounding_precision: string;
  currency: string;
  default_paymentterms: string;
  default_tax: string;
  attribute_10: string;
}

interface Subsidiary {
  id: number;
  organization_name: string;
  org_legal_name: string;
  org_registration_no: string;
  org_legal_address: string;
  org_city: string;
  org_state: string;
  org_country: string;
  org_postalcode: string;
  org_email: string;
  org_phone_no: string;
  currency: string;
  date_format: string;
  number_format: string;
  rounding_precision: string;
  payment_terms: string;
  tax_rate: string;
}

interface Location {
  id: number;
  location_id: string;
  location_name: string;
  status: string;
  billto_address: string;
  shipto_address: string;
  org_id: number;
  organization_name?: string;
}

interface Lookup {
  id: number;
  property_name: string;
  lookup_key: string;
  lookup_value: string;
  description: string;
  status: string;
}

interface LookupResponse {
  data: Lookup[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface PaymentTerm {
  id: number;
  payment_term_id: string;
  terms_name: string;
  description: string;
  status: string;
}

interface PaymentTermResponse {
  data: PaymentTerm[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface TaxCode {
  id: number;
  tax_code_id: string;
  tax_code: string;
  tax_code_desc: string;
  tax_rate: number;
  tax_type: string;
  status: string;
}

interface TaxCodeResponse {
  data: TaxCode[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface Prefix {
  id: number;
  prefix_name: string;
  prefix_value: string;
  prefix_key: string;
  prefix_description: string;
  status: string;
}

interface PrefixResponse {
  data: Prefix[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface ExchangeRateRow {
  id: number;
  from_currency: string;
  to_currency: string;
  conversion_rate: string | number;
  conversion_date: string;
  created_by?: string | null;
  creation_date?: string | null;
  last_updated_by?: string | null;
  last_updated_date?: string | null;
}

interface ExchangeRateListResponse {
  data: ExchangeRateRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface TermsCondition {
  id: number;
  module_name: string;
  tnc_text: string;
  status: number;
  created_by: string;
  creation_time: string;
}

interface TermsConditionResponse {
  data: TermsCondition[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface TncDocument {
  id: number;
  doc_name: string;
  doc_desc: string;
  filename: string;
  filetype: string;
  status: string;
  creation_date: string;
  preview_image?: string | null;
}

const DATE_FORMATS = [
  { label: "DD.MM.YYYY", value: "DD.MM.YYYY" },
  { label: "YYYYMMDD", value: "YYYYMMDD" },
  { label: "DDMMYYYY", value: "DDMMYYYY" },
  { label: "Month DD, YYYY", value: "Month DD, YYYY" },
  { label: "DD Month YYYY", value: "DD Month YYYY" },
  { label: "MMM-YYYY", value: "MMM-YYYY" },
  { label: "Month YYYY", value: "Month YYYY" },
  { label: "DD/MM/YY", value: "DD/MM/YY" },
  { label: "MM/DD/YY", value: "MM/DD/YY" },
  { label: "MM-DD-YYYY", value: "MM-DD-YYYY" },
  { label: "DD-MM-YYYY", value: "DD-MM-YYYY" },
] as const;

const modulesList: { key: string, value: string }[] = [
  { key: "Signup", value: "Signup" },
  { key: "Signin", value: "Signin" },
  { key: "ResetPassword", value: "Reset Password" },
  { key: "SubmitRegistrationApprovalSupplier", value: "Submit Registration Approval - Supplier" },
  { key: "BidAcknowledgeSupplier", value: "Bid Acknowledge - Supplier" },
  { key: "POPreviewSubmitInvoice", value: "PO Preview Submit Invoice" },
  { key: "CreateNonPOPOInvoice", value: "Create Non-PO, PO Invoice" },
  { key: "Footer", value: "Footer" }
];

export default function BasicSettings() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("information");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [subsidiaryLogoPreview, setSubsidiaryLogoPreview] = useState<string | null>(null);
  const subsidiaryFileInputRef = useRef<HTMLInputElement>(null);
  const [stagedLogoFile, setStagedLogoFile] = useState<File | null>(null);

  // Subsidiaries state
  const [subSearchQuery, setSubSearchQuery] = useState("");
  const [subPage, setSubPage] = useState(1);
  const [subLimit, setSubLimit] = useState(10);
  const [showSubsidiarySheet, setShowSubsidiarySheet] = useState(false);
  const [editingSubsidiary, setEditingSubsidiary] = useState<Subsidiary | null>(
    null,
  );
  const [subsidiaryForm, setSubsidiaryForm] = useState({
    name: "",
    legal_name: "",
    business_registration_no: "",
    legal_address: "",
    city: "",
    state: "",
    country: "",
    postal_code: "",
    phone: "",
    email: "",
    date_format: "",
    number_format: "",
    rounding_precision: "",
    payment_terms: "",
    tax_rate: "",
    currency: "",
  });
  const [subsidiaryErrors, setSubsidiaryErrors] = useState<Record<string, string>>({});
  const [locationErrors, setLocationErrors] = useState<Record<string, string>>({});

  const getDefaultDialCodeForCountry = (countryValueOrLabel?: string) => {
    if (!countryValueOrLabel) return "+1";
    const normalized = countryValueOrLabel.trim();
    const isoFromCode = normalized.length === 2 ? normalized.toUpperCase() : "";
    const isoFromName =
      phoneCountryOptions.find((c) => c.name.toLowerCase() === normalized.toLowerCase())?.iso || "";
    return getDialCodeByIso(isoFromCode || isoFromName);
  };

  // Locations state
  const [locSearchQuery, setLocSearchQuery] = useState("");
  const [locPage, setLocPage] = useState(1);
  const [locLimit, setLocLimit] = useState(10);
  const [showLocationSheet, setShowLocationSheet] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [deleteLocationId, setDeleteLocationId] = useState<number | null>(null);
  const [locationForm, setLocationForm] = useState({
    location_name: "",
    billto_address: "",
    shipto_address: "",
    org_id: "",
  });

  // Lookups state
  const [lookupSearchQuery, setLookupSearchQuery] = useState("");
  const [lookupPage, setLookupPage] = useState(1);
  const [lookupLimit, setLookupLimit] = useState(10);
  const [showLookupSheet, setShowLookupSheet] = useState(false);
  const [editingLookup, setEditingLookup] = useState<Lookup | null>(null);
  const [deleteLookupId, setDeleteLookupId] = useState<number | null>(null);
  const [lookupForm, setLookupForm] = useState({
    property_name: "",
    lookup_key: "",
    lookup_value: "",
    description: "",
  });

  // Payment Terms state
  const [paymentTermSearchQuery, setPaymentTermSearchQuery] = useState("");
  const [paymentTermPage, setPaymentTermPage] = useState(1);
  const [paymentTermLimit, setPaymentTermLimit] = useState(10);
  const [showPaymentTermSheet, setShowPaymentTermSheet] = useState(false);
  const [editingPaymentTerm, setEditingPaymentTerm] =
    useState<PaymentTerm | null>(null);
  const [deletePaymentTermId, setDeletePaymentTermId] = useState<number | null>(
    null,
  );
  const [paymentTermForm, setPaymentTermForm] = useState({
    terms_name: "",
    description: "",
  });

  // Taxes state
  const [taxSearchQuery, setTaxSearchQuery] = useState("");
  const [taxPage, setTaxPage] = useState(1);
  const [taxLimit, setTaxLimit] = useState(10);
  const [showTaxSheet, setShowTaxSheet] = useState(false);
  const [editingTax, setEditingTax] = useState<TaxCode | null>(null);
  const [deleteTaxId, setDeleteTaxId] = useState<number | null>(null);
  const [taxForm, setTaxForm] = useState({
    tax_code: "",
    tax_code_desc: "",
    tax_rate: "",
    tax_type: "",
  });

  // Prefix state
  const [prefixSearchQuery, setPrefixSearchQuery] = useState("");
  const [prefixPage, setPrefixPage] = useState(1);
  const [prefixLimit, setPrefixLimit] = useState(10);
  const [showPrefixSheet, setShowPrefixSheet] = useState(false);
  const [editingPrefix, setEditingPrefix] = useState<Prefix | null>(null);
  const [deletePrefixId, setDeletePrefixId] = useState<number | null>(null);
  const [prefixForm, setPrefixForm] = useState({
    prefix_name: "",
    prefix_value: "",
    prefix_key: "",
    prefix_description: "",
  });

  const [exSearchQuery, setExSearchQuery] = useState("");
  const [exPage, setExPage] = useState(1);
  const [exLimit, setExLimit] = useState(10);
  const [showExRateSheet, setShowExRateSheet] = useState(false);
  const [editingExRate, setEditingExRate] = useState<ExchangeRateRow | null>(
    null,
  );
  const [exRateForm, setExRateForm] = useState({
    from_currency: "",
    to_currency: "",
    conversion_rate: "",
  });
  const [exHistoryOpen, setExHistoryOpen] = useState(false);
  const [exHistoryPair, setExHistoryPair] = useState<{
    from: string;
    to: string;
  } | null>(null);

  // Terms & Conditions state
  const [tncSearchQuery, setTncSearchQuery] = useState("");
  const [tncPage, setTncPage] = useState(1);
  const [tncLimit, setTncLimit] = useState(10);
  const [showTncSheet, setShowTncSheet] = useState(false);
  const [tncClicked, setTncClicked] = useState<{ clicked: boolean; type: string }>({ clicked: false, type: '' });
  const [editingTnc, setEditingTnc] = useState<TermsCondition | null>(null);
  const [deleteTncId, setDeleteTncId] = useState<number | null>(null);
  const [tncForm, setTncForm] = useState({
    module_name: "",
    tnc_text: "",
  });
  const [tncDocument, setTncDocument] = useState<TncDocument | null>(null);
  const [selectedTncFile, setSelectedTncFile] = useState<File | null>(null);
  const tncFileInputRef = useRef<HTMLInputElement>(null);

  const openAddSubsidiary = () => {
    setEditingSubsidiary(null);
    setSubsidiaryForm({
      name: "",
      legal_name: "",
      business_registration_no: "",
      legal_address: "",
      city: "",
      state: "",
      country: orgDetails?.org_country || "",
      postal_code: "",
      phone: "",
      email: "",
      date_format: "",
      number_format: "",
      rounding_precision: "",
      payment_terms: "",
      tax_rate: "",
      currency: "",
    });
    setShowSubsidiarySheet(true);
  };

  const openEditSubsidiary = (sub: Subsidiary) => {
    setEditingSubsidiary(sub);
    setSubsidiaryForm({
      name: sub.organization_name || "",
      legal_name: sub.org_legal_name || "",
      business_registration_no: sub.org_registration_no || "",
      legal_address: sub.org_legal_address || "",
      city: sub.org_city || "",
      state: sub.org_state || "",
      country: sub.org_country || "",
      postal_code: sub.org_postalcode || "",
      phone: sub.org_phone_no || "",
      email: sub.org_email || "",
      date_format: sub.date_format || "",
      number_format: sub.number_format || "",
      rounding_precision: sub.rounding_precision || "",
      payment_terms: sub.payment_terms || "",
      tax_rate: sub.tax_rate || "",
      currency: sub.currency || "",
    });
    setShowSubsidiarySheet(true);
  };

  const createSubsidiaryMutation = useMutation({
    mutationFn: async (data: typeof subsidiaryForm) => {
      const res = await apiRequest("POST", "/api/subsidiaries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subsidiaries"] });
      setShowSubsidiarySheet(false);
      toast({
        title: "Subsidiary created",
        description: "New subsidiary has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create subsidiary",
        variant: "destructive",
      });
    },
  });

  const updateSubsidiaryMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: typeof subsidiaryForm;
    }) => {
      const res = await apiRequest("PUT", `/api/subsidiaries/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subsidiaries"] });
      setShowSubsidiarySheet(false);
      setEditingSubsidiary(null);
      toast({
        title: "Subsidiary updated",
        description: "Subsidiary has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update subsidiary",
        variant: "destructive",
      });
    },
  });

  const handleSaveSubsidiary = async () => {
    // Validate required fields
    const errors: Record<string, string> = {};
    if (!subsidiaryForm.name.trim()) errors.name = "Company name is required";
    if (!subsidiaryForm.legal_name.trim()) errors.legal_name = "Legal name is required";
    if (!subsidiaryForm.business_registration_no.trim()) errors.business_registration_no = "Business registration number is required";
    if (!subsidiaryForm.legal_address.trim()) errors.legal_address = "Legal address is required";
    if (!subsidiaryForm.city.trim()) errors.city = "City is required";
    if (!subsidiaryForm.state.trim()) errors.state = "State is required";
    if (!subsidiaryForm.country) errors.country = "Country is required";
    if (!subsidiaryForm.postal_code.trim()) errors.postal_code = "Postal code is required";
    if (!subsidiaryForm.phone.trim()) {
      errors.phone = "Phone number is required";
    } else if (!validatePhoneNumber(subsidiaryForm.phone)) {
      errors.phone = getPhoneValidationMessage(subsidiaryForm.phone);
    }
    if (!subsidiaryForm.email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(subsidiaryForm.email)) {
      errors.email = "Enter a valid email address";
    }
    if (!subsidiaryForm.date_format) errors.date_format = "Date format is required";
    if (!subsidiaryForm.payment_terms) errors.payment_terms = "Payment terms is required";
    if (!subsidiaryForm.tax_rate) errors.tax_rate = "Tax rate is required";
    if (!subsidiaryForm.currency) errors.currency = "Currency is required";
    // if (!subsidiaryForm.number_format) errors.number_format = "Number format is required";
    // if (!subsidiaryForm.rounding_precision) errors.rounding_precision = "Rounding precision is required";

    if (Object.keys(errors).length > 0) {
      setSubsidiaryErrors(errors);
      return;
    }
    setSubsidiaryErrors({});

    // Build payload — convert staged logo to base64 and include inline
    let payload: any = { ...subsidiaryForm };
    if (stagedLogoFile) {
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target!.result as string);
        reader.readAsDataURL(stagedLogoFile);
      });
      payload.org_logo_path = base64;
    }
    if (editingSubsidiary) {
      updateSubsidiaryMutation.mutate(
        { id: editingSubsidiary.id, data: payload },
        { onSuccess: () => setStagedLogoFile(null) }
      );
    } else {
      createSubsidiaryMutation.mutate(payload, {
        onSuccess: () => setStagedLogoFile(null),
      });
    }
  };

  const { data: orgDetails, isLoading } = useQuery<OrgDetails>({
    queryKey: ["/api/org-details"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/org-details");
      const data = await res.json();
      localStorage.setItem("orgDetails", JSON.stringify(data));
      return data;
    },
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: subsidiaries = [], isLoading: isLoadingSubsidiaries } =
    useQuery<Subsidiary[]>({
      queryKey: ["/api/subsidiaries"],
      staleTime: 0,
      refetchOnMount: "always",
    });

  const { data: organizations = [] } = useQuery<{ id: number; organization_name: string; entity_type: string }[]>({
    queryKey: ["/api/organizations"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: locations = [], isLoading: isLoadingLocations } = useQuery<
    Location[]
  >({
    queryKey: ["/api/locations"],
    staleTime: 0,
    refetchOnMount: "always",
  });

  const sortedLocations = locations.sort((a, b) => {
    const aName = (a.id);
    const bName = (b.id);
    if (aName < bName) return -1;
    if (aName > bName) return 1;
    return 0;
  });

  const { data: lookupsResponse, isLoading: isLoadingLookups } =
    useQuery<LookupResponse>({
      queryKey: [
        "/api/lookups",
        { page: lookupPage, limit: lookupLimit, search: lookupSearchQuery },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(lookupPage),
          limit: String(lookupLimit),
          ...(lookupSearchQuery && { search: lookupSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/lookups?${params}`);
        if (!res.ok) throw new Error("Failed to fetch lookups");
        return res.json();
      },
      staleTime: 0,
      refetchOnMount: "always",
    });

  const lookups = lookupsResponse?.data || [];
  const lookupPagination = lookupsResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const { data: paymentTermsResponse, isLoading: isLoadingPaymentTerms } =
    useQuery<PaymentTermResponse>({
      queryKey: [
        "/api/payment-terms",
        {
          page: paymentTermPage,
          limit: paymentTermLimit,
          search: paymentTermSearchQuery,
        },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(paymentTermPage),
          limit: String(paymentTermLimit),
          ...(paymentTermSearchQuery && { search: paymentTermSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/payment-terms?${params}`);
        if (!res.ok) throw new Error("Failed to fetch payment terms");
        return res.json();
      },
      staleTime: 0,
      refetchOnMount: "always",
    });

  const paymentTerms = paymentTermsResponse?.data || [];
  const paymentTermPagination = paymentTermsResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const { data: taxesResponse, isLoading: isLoadingTaxes } =
    useQuery<TaxCodeResponse>({
      queryKey: [
        "/api/taxes",
        { page: taxPage, limit: taxLimit, search: taxSearchQuery },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(taxPage),
          limit: String(taxLimit),
          ...(taxSearchQuery && { search: taxSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/taxes?${params}`);
        if (!res.ok) throw new Error("Failed to fetch taxes");
        return res.json();
      },
      staleTime: 0,
      refetchOnMount: "always",
    });

  const { data: allPaymentTermsData } = useQuery<PaymentTermResponse>({
    queryKey: ["/api/payment-terms", { page: 1, limit: 1000 }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/payment-terms?page=1&limit=1000`);
      if (!res.ok) throw new Error("Failed to fetch payment terms");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const allPaymentTerms = allPaymentTermsData?.data || [];

  const { data: allTaxesData } = useQuery<TaxCodeResponse>({
    queryKey: ["/api/taxes", { page: 1, limit: 1000 }],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/taxes?page=1&limit=1000`);
      if (!res.ok) throw new Error("Failed to fetch taxes");
      return res.json();
    },
    staleTime: 0,
    refetchOnMount: "always",
  });
  const allTaxes = allTaxesData?.data || [];

  const { data: currencyOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: countryOptions = [] } = useQuery<
    { value: string; label: string }[]
  >({
    queryKey: ["/api/countries"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/countries");
      if (!res.ok) throw new Error("Failed to fetch countries");
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    })),
  });

  const initializeOrgValuesRef = useRef(false);

  useEffect(() => {
    if (
      !initializeOrgValuesRef.current &&
      countryOptions?.length &&
      allPaymentTerms?.length &&
      allTaxes?.length &&
      currencyOptions?.length &&
      orgDetails
    ) {
      initializeOrgValuesRef.current = true;
      form.setValue(
        "org_country",
        String(orgDetails.org_country || "")
      );
      form.setValue(
        "default_paymentterms",
        String(orgDetails.default_paymentterms || "")
      );
      form.setValue(
        "default_tax",
        String(orgDetails.default_tax || "")
      );
      form.setValue(
        "currency",
        String(orgDetails.currency || "")
      );
    }
  }, [countryOptions, allPaymentTerms, allTaxes, currencyOptions, orgDetails]);

  const taxes = taxesResponse?.data || [];
  const taxPagination = taxesResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  // Location functions
  const openAddLocation = () => {
    setEditingLocation(null);
    setLocationForm({
      location_name: "",
      billto_address: "",
      shipto_address: "",
      org_id: "",
    });
    setLocationErrors({});
    setShowLocationSheet(true);
  };

  const openEditLocation = (loc: Location) => {
    setEditingLocation(loc);
    setLocationForm({
      location_name: loc.location_name || "",
      billto_address: loc.billto_address || "",
      shipto_address: loc.shipto_address || "",
      org_id: loc.org_id ? String(loc.org_id) : "",
    });
    setLocationErrors({});
    setShowLocationSheet(true);
  };

  const createLocationMutation = useMutation({
    mutationFn: async (data: typeof locationForm) => {
      const res = await apiRequest("POST", "/api/locations", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setShowLocationSheet(false);
      toast({
        title: "Location created",
        description: "New location has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create location",
        variant: "destructive",
      });
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: typeof locationForm;
    }) => {
      const res = await apiRequest("PUT", `/api/locations/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setShowLocationSheet(false);
      setEditingLocation(null);
      toast({
        title: "Location updated",
        description: "Location has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update location",
        variant: "destructive",
      });
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/locations/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
      setDeleteLocationId(null);
      toast({
        title: "Location deleted",
        description: "Location has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete location",
        variant: "destructive",
      });
    },
  });

  const deleteSubsidiaryMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/subsidiaries/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subsidiaries"] });
      toast({ title: "Subsidiary deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete subsidiary", description: error.message, variant: "destructive" });
    },
  });

  const deleteExchangeRateMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/exchange-rates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates/history"] });
      toast({ title: "Exchange rate deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete exchange rate", description: error.message, variant: "destructive" });
    },
  });

  const toggleLocationStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/locations/${id}/status`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/locations"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update location status",
        variant: "destructive",
      });
    },
  });

const toggleChatBotMutation = useMutation({
      mutationFn: async ({ id, chatBot }: { id: number; chatBot: string }) => {
          const response = await apiRequest(
              "PATCH",
              `/api/org-details/${id}/${chatBot}`
          );

          const data = await response.json();

          if (!response.ok) {
              throw new Error(data);
          }

          return data;
      },

     onSuccess: async () => {
      localStorage.removeItem("orgDetails");
      await queryClient.invalidateQueries({ queryKey: ["/api/org-details"] });
      toast({
        title: "Success",
        description: "Chat bot details updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update chat bot details",
        variant: "destructive",
      });
    },
  });

  const handleSaveLocation = () => {
    const errors: Record<string, string> = {};
    if (!locationForm.location_name.trim()) errors.location_name = "Location name is required";
    if (!locationForm.org_id) errors.org_id = "Business Entity is required";
    if (!locationForm.billto_address.trim()) errors.billto_address = "Billing address is required";
    if (!locationForm.shipto_address.trim()) errors.shipto_address = "Shipping address is required";

    if (Object.keys(errors).length > 0) {
      setLocationErrors(errors);
      return;
    }
    setLocationErrors({});

    if (editingLocation) {
      updateLocationMutation.mutate({
        id: editingLocation.id,
        data: locationForm,
      });
    } else {
      createLocationMutation.mutate(locationForm);
    }
  };

  // Lookup functions
  const openAddLookup = () => {
    setEditingLookup(null);
    setLookupForm({
      property_name: "",
      lookup_key: "",
      lookup_value: "",
      description: "",
    });
    setShowLookupSheet(true);
  };

  const openEditLookup = (lookup: Lookup) => {
    setEditingLookup(lookup);
    setLookupForm({
      property_name: lookup.property_name || "",
      lookup_key: lookup.lookup_key || "",
      lookup_value: lookup.lookup_value || "",
      description: lookup.description || "",
    });
    setShowLookupSheet(true);
  };

  const createLookupMutation = useMutation({
    mutationFn: async (data: typeof lookupForm) => {
      const res = await apiRequest("POST", "/api/lookups", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookups"] });
      setShowLookupSheet(false);
      toast({
        title: "Lookup created",
        description: "New lookup property has been added successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create lookup",
        variant: "destructive",
      });
    },
  });

  const updateLookupMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: typeof lookupForm;
    }) => {
      const res = await apiRequest("PUT", `/api/lookups/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookups"] });
      setShowLookupSheet(false);
      setEditingLookup(null);
      toast({
        title: "Lookup updated",
        description: "Lookup property has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update lookup",
        variant: "destructive",
      });
    },
  });

  const deleteLookupMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/lookups/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookups"] });
      setDeleteLookupId(null);
      toast({
        title: "Lookup deleted",
        description: "Lookup property has been deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete lookup",
        variant: "destructive",
      });
    },
  });

  const toggleLookupStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/lookups/${id}/status`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lookups"] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update lookup status",
        variant: "destructive",
      });
    },
  });

  const handleSaveLookup = () => {
    if (editingLookup) {
      updateLookupMutation.mutate({ id: editingLookup.id, data: lookupForm });
    } else {
      createLookupMutation.mutate(lookupForm);
    }
  };

  // Payment Terms functions
  const openAddPaymentTerm = () => {
    setEditingPaymentTerm(null);
    setPaymentTermForm({
      terms_name: "",
      description: "",
    });
    setShowPaymentTermSheet(true);
  };

  const openEditPaymentTerm = (term: PaymentTerm) => {
    setEditingPaymentTerm(term);
    setPaymentTermForm({
      terms_name: term.terms_name || "",
      description: term.description || "",
    });
    setShowPaymentTermSheet(true);
  };

  const createPaymentTermMutation = useMutation({
    mutationFn: async (data: typeof paymentTermForm) => {
      const res = await apiRequest("POST", "/api/payment-terms", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-terms"] });
      setShowPaymentTermSheet(false);
      toast({
        title: "Success",
        description: "Payment term created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePaymentTermMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: typeof paymentTermForm;
    }) => {
      const res = await apiRequest("PUT", `/api/payment-terms/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-terms"] });
      setShowPaymentTermSheet(false);
      toast({
        title: "Success",
        description: "Payment term updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePaymentTermMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/payment-terms/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-terms"] });
      setDeletePaymentTermId(null);
      toast({
        title: "Success",
        description: "Payment term deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const togglePaymentTermStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/payment-terms/${id}/status`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payment-terms"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSavePaymentTerm = () => {
    if (editingPaymentTerm) {
      updatePaymentTermMutation.mutate({
        id: editingPaymentTerm.id,
        data: paymentTermForm,
      });
    } else {
      createPaymentTermMutation.mutate(paymentTermForm);
    }
  };

  // Taxes functions
  const openAddTax = () => {
    setEditingTax(null);
    setTaxForm({
      tax_code: "",
      tax_code_desc: "",
      tax_rate: "",
      tax_type: "",
    });
    setShowTaxSheet(true);
  };

  const openEditTax = (tax: TaxCode) => {
    setEditingTax(tax);
    setTaxForm({
      tax_code: tax.tax_code || "",
      tax_code_desc: tax.tax_code_desc || "",
      tax_rate: String(tax.tax_rate) || "",
      tax_type: tax.tax_type || "",
    });
    setShowTaxSheet(true);
  };

  const createTaxMutation = useMutation({
    mutationFn: async (data: typeof taxForm) => {
      const res = await apiRequest("POST", "/api/taxes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taxes"] });
      setShowTaxSheet(false);
      toast({ title: "Success", description: "Tax code created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTaxMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof taxForm }) => {
      const res = await apiRequest("PUT", `/api/taxes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taxes"] });
      setShowTaxSheet(false);
      toast({ title: "Success", description: "Tax code updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTaxMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/taxes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taxes"] });
      setDeleteTaxId(null);
      toast({ title: "Success", description: "Tax code deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const toggleTaxStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/taxes/${id}/status`, {
        status,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/taxes"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveTax = () => {
    if (editingTax) {
      updateTaxMutation.mutate({ id: editingTax.id, data: taxForm });
    } else {
      createTaxMutation.mutate(taxForm);
    }
  };

  // Prefix query
  const { data: prefixesResponse, isLoading: isLoadingPrefixes } =
    useQuery<PrefixResponse>({
      queryKey: [
        "/api/prefixes",
        { page: prefixPage, limit: prefixLimit, search: prefixSearchQuery },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(prefixPage),
          limit: String(prefixLimit),
          ...(prefixSearchQuery && { search: prefixSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/prefixes?${params}`);
        if (!res.ok) throw new Error("Failed to fetch prefixes");
        return res.json();
      },
      staleTime: 0,
      refetchOnMount: "always",
    });

  const prefixes = prefixesResponse?.data || [];
  const prefixPagination = prefixesResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const openAddPrefix = () => {
    setEditingPrefix(null);
    setPrefixForm({
      prefix_name: "",
      prefix_value: "",
      prefix_key: "",
      prefix_description: "",
    });
    setShowPrefixSheet(true);
  };

  const openEditPrefix = (prefix: Prefix) => {
    setEditingPrefix(prefix);
    setPrefixForm({
      prefix_name: prefix.prefix_name || "",
      prefix_value: prefix.prefix_value || "",
      prefix_key: prefix.prefix_key || "",
      prefix_description: prefix.prefix_description || "",
    });
    setShowPrefixSheet(true);
  };

  const createPrefixMutation = useMutation({
    mutationFn: async (data: typeof prefixForm) => {
      const res = await apiRequest("POST", "/api/prefixes", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prefixes"] });
      setShowPrefixSheet(false);
      toast({ title: "Success", description: "Prefix created successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePrefixMutation = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number;
      data: typeof prefixForm;
    }) => {
      const res = await apiRequest("PUT", `/api/prefixes/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prefixes"] });
      setShowPrefixSheet(false);
      toast({ title: "Success", description: "Prefix updated successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deletePrefixMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/prefixes/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/prefixes"] });
      setDeletePrefixId(null);
      toast({ title: "Success", description: "Prefix deleted successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // const togglePrefixStatusMutation = useMutation({
  //   mutationFn: async ({ id, status }: { id: number; status: string }) => {
  //     const res = await apiRequest("PUT", `/api/prefixes/${id}/status`, {
  //       status,
  //     });
  //     return res.json();
  //   },
  //   onSuccess: () => {
  //     queryClient.invalidateQueries({ queryKey: ["/api/prefixes"] });
  //   },
  //   onError: (error: Error) => {
  //     toast({
  //       title: "Error",
  //       description: error.message,
  //       variant: "destructive",
  //     });
  //   },
  // });

  const handleSavePrefix = () => {
    if (editingPrefix) {
      updatePrefixMutation.mutate({ id: editingPrefix.id, data: prefixForm });
    } else {
      createPrefixMutation.mutate(prefixForm);
    }
  };

  const openAddExRate = () => {
    setEditingExRate(null);
    setExRateForm({
      from_currency: "",
      to_currency: "",
      conversion_rate: "",
    });
    setShowExRateSheet(true);
  };

  const openEditExRate = (row: ExchangeRateRow) => {
    setEditingExRate(row);
    setExRateForm({
      from_currency: row.from_currency || "",
      to_currency: row.to_currency || "",
      conversion_rate: String(row.conversion_rate ?? ""),
    });
    setShowExRateSheet(true);
  };

  const openExHistory = (from: string, to: string) => {
    setExHistoryPair({ from, to });
    setExHistoryOpen(true);
  };

  const { data: baseCurrencyLookups = [], isLoading: isLoadingBaseCurrencies } =
    useQuery<
      Array<{
        id: number;
        property_name: string;
        lookup_key: string;
        lookup_value: string;
        description: string;
      }>
    >({
      queryKey: ["/api/lookups/by-property/BASE_CURRENCY"],
      enabled: activeTab === "exchange-rates" || showExRateSheet,
    });

  const { data: exRatesResponse, isLoading: isLoadingExRates } =
    useQuery<ExchangeRateListResponse>({
      queryKey: [
        "/api/exchange-rates",
        { page: exPage, limit: exLimit, search: exSearchQuery },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(exPage),
          limit: String(exLimit),
          ...(exSearchQuery && { search: exSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/exchange-rates?${params}`);
        if (!res.ok) throw new Error("Failed to fetch exchange rates");
        return res.json();
      },
      enabled: activeTab === "exchange-rates",
      staleTime: 0,
      refetchOnMount: "always",
    });

  const exRates = exRatesResponse?.data || [];
  const exPagination = exRatesResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const { data: exHistoryResponse, isLoading: isLoadingExHistory } = useQuery<{
    data: ExchangeRateRow[];
  }>({
    queryKey: [
      "/api/exchange-rates/history",
      exHistoryPair?.from,
      exHistoryPair?.to,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        from_currency: exHistoryPair!.from,
        to_currency: exHistoryPair!.to,
      });
      const res = await apiRequest("GET", `/api/exchange-rates/history?${params}`);
      if (!res.ok) throw new Error("Failed to fetch exchange rate history");
      return res.json();
    },
    enabled:
      exHistoryOpen &&
      !!exHistoryPair?.from &&
      !!exHistoryPair?.to,
    staleTime: 0,
  });

  const exHistoryRows = exHistoryResponse?.data || [];

  const createExRateMutation = useMutation({
    mutationFn: async (data: typeof exRateForm) => {
      const res = await apiRequest("POST", "/api/exchange-rates", {
        from_currency: data.from_currency.trim(),
        to_currency: data.to_currency.trim(),
        conversion_rate: Number(data.conversion_rate),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates/history"] });
      setShowExRateSheet(false);
      toast({
        title: "Success",
        description: "Exchange rate created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateExRateMutation = useMutation({
    mutationFn: async ({
      id,
      conversion_rate,
    }: {
      id: number;
      conversion_rate: string;
    }) => {
      const res = await apiRequest("PUT", `/api/exchange-rates/${id}`, {
        conversion_rate: Number(conversion_rate),
      });
      return res.json();
    },
    onSuccess: (data: ExchangeRateRow) => {
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/exchange-rates/history"] });
      setShowExRateSheet(false);
      if (data?.from_currency && data?.to_currency) {
        setExHistoryPair({
          from: data.from_currency,
          to: data.to_currency,
        });
        setExHistoryOpen(true);
      }
      toast({
        title: "Success",
        description:
          "New rate saved. Previous rates are kept in history for this pair.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveExRate = () => {
    if (editingExRate) {
      updateExRateMutation.mutate({
        id: editingExRate.id,
        conversion_rate: exRateForm.conversion_rate,
      });
      return;
    }
    if (!exRateForm.from_currency?.trim() || !exRateForm.to_currency?.trim()) {
      toast({
        title: "Validation",
        description: "Select both From and To currency.",
        variant: "destructive",
      });
      return;
    }
    if (exRateForm.from_currency.trim() === exRateForm.to_currency.trim()) {
      toast({
        title: "Validation",
        description: "From and To currency must be different.",
        variant: "destructive",
      });
      return;
    }
    createExRateMutation.mutate(exRateForm);
  };

  // Terms & Conditions query
  const { data: tncResponse, isLoading: isLoadingTnc } =
    useQuery<TermsConditionResponse>({
      queryKey: [
        "/api/terms-conditions",
        { page: tncPage, limit: tncLimit, search: tncSearchQuery },
      ],
      queryFn: async () => {
        const params = new URLSearchParams({
          page: String(tncPage),
          limit: String(tncLimit),
          ...(tncSearchQuery && { search: tncSearchQuery }),
        });
        const res = await apiRequest("GET", `/api/terms-conditions?${params}`);
        if (!res.ok) throw new Error("Failed to fetch terms conditions");
        return res.json();
      },
      staleTime: 0,
      refetchOnMount: "always",
    });

  const termsConditions = tncResponse?.data || [];
  const tncPagination = tncResponse?.pagination || {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  };

  const openAddTnc = () => {
    setEditingTnc(null);
    setTncForm({ module_name: "", tnc_text: "" });
    setTncDocument(null);
    setSelectedTncFile(null);
    setShowTncSheet(true);
  };

  const { data: termsConditionsRecord } = useQuery<TnCData>({
    queryKey: ["/api/terms-conditions-by-name/", tncClicked.type],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/terms-conditions-by-name/${tncClicked.type}`);
      if (!res.ok) throw new Error("Failed to fetch terms and conditions");
      return res.json();
    },
    enabled: tncClicked.clicked,
  });

  const openEditTnc = (tnc: TermsCondition) => {
    setEditingTnc(tnc);
    setTncForm({
      module_name: tnc.module_name || "",
      tnc_text: tnc.tnc_text || "",
    });
    setTncClicked({ clicked: true, type: tnc.module_name })
    setTncDocument(null);
    setSelectedTncFile(null);
    setShowTncSheet(true);
  };

  const createTncMutation = useMutation({
    mutationFn: async (data: typeof tncForm) => {
      const res = await apiRequest("POST", "/api/terms-conditions", data);
      const result = await res.json();
      if (selectedTncFile) {
        await uploadTncDocumentMutation.mutateAsync({
          id: result.id,
          file: selectedTncFile,
        });
      }
      return result;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      setShowTncSheet(false);
      toast({
        title: "Success",
        description: "Terms & Conditions created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTncMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof tncForm }) => {
      const res = await apiRequest("PUT", `/api/terms-conditions/${id}`, data);
      const result = await res.json();
      if (selectedTncFile) {
        await uploadTncDocumentMutation.mutateAsync({
          id: id,
          file: selectedTncFile,
        });
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      setShowTncSheet(false);
      toast({
        title: "Success",
        description: "Terms & Conditions updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/terms-conditions/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/terms-conditions"] });
      setDeleteTncId(null);
      toast({
        title: "Success",
        description: "Terms & Conditions deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSaveTnc = () => {
    if (editingTnc) {
      updateTncMutation.mutate({ id: editingTnc.id, data: tncForm });
    } else {
      createTncMutation.mutate(tncForm);
    }
  };

  // T&C Document query (only when editing)
  const { data: fetchedTncDocument, refetch: refetchTncDocument } =
    useQuery<TncDocument | null>({
      queryKey: ["/api/terms-conditions", editingTnc?.id, "document"],
      queryFn: async () => {
        if (!editingTnc?.id) return null;
        const res = await apiRequest("GET", 
          `/api/terms-conditions/${editingTnc.id}/document`,
        );
        if (!res.ok) return null;
        return res.json();
      },
      enabled: !!editingTnc?.id && showTncSheet,
    });

  // Sync fetched document to state when it changes
  useEffect(() => {
    if (showTncSheet && editingTnc) {
      setTncDocument(fetchedTncDocument || null);
    }
  }, [fetchedTncDocument, showTncSheet, editingTnc]);

  const uploadTncDocumentMutation = useMutation({
    mutationFn: async ({ id, file }: { id: number; file: File }) => {
      const formData = new FormData();
      formData.append("document", file);
      const res = await apiRequest("POST", `/api/terms-conditions/${id}/document`, formData);
      if (!res.ok) throw new Error("Failed to upload document");
      return res.json();
    },
    onSuccess: () => {
      refetchTncDocument();
      setSelectedTncFile(null);
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTncDocumentMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/terms-conditions/${id}/document`);
      if (!res.ok) throw new Error("Failed to delete document");
      return res.json();
    },
    onSuccess: () => {
      setTncDocument(null);
      refetchTncDocument();
      toast({ title: "Success", description: "Document removed successfully" });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleTncFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== "application/pdf") {
      e.target.value = "";
      toast({
        title: "Error",
        description: "Only PDF files are allowed. Please upload a valid PDF document.",
        variant: "destructive",
      });
      return;
    }
    setSelectedTncFile(file);
  };

  const logoUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await apiRequest("POST", `/api/org-details/${orgDetails?.id}/logo`, formData);
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      // Immediately update the shared query cache so all consumers (e.g. the
      // header in app-portal) reflect the new logo without waiting for the
      // background refetch to complete.
      if (logoPreview) {
        queryClient.setQueryData(["/api/org-details"], (old: any) => {
          if (!old) return old;
          return { ...old, org_logo_path: logoPreview };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/org-details"] });
      toast({
        title: "Logo updated",
        description: "Organization logo saved successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to upload logo",
        variant: "destructive",
      });
    },
  });

  const clearLogoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/org-details/logo`);
      if (!res.ok) throw new Error("Clear failed");
      return res.json();
    },
    onSuccess: () => {
      setLogoPreview(null);
      queryClient.setQueryData(["/api/org-details"], (old: any) => {
        if (!old) return old;
        return { ...old, org_logo_path: null };
      });
      queryClient.invalidateQueries({ queryKey: ["/api/org-details"] });
      toast({
        title: "Logo cleared",
        description: "Organization logo has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to clear logo",
        variant: "destructive",
      });
    },
  });

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid file",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
      // Show preview immediately
      const reader = new FileReader();
      reader.onload = (event) => {
        setLogoPreview(event.target?.result as string);
      };
      reader.readAsDataURL(file);
      // Upload to server
      logoUploadMutation.mutate(file);
    }
  };

  const form = useForm<OrgInfoForm>({
    resolver: zodResolver(orgInfoSchema),
    values: {
      organization_name: orgDetails?.organization_name ?? "",
      org_legal_name: orgDetails?.org_legal_name ?? "",
      org_registration_no: orgDetails?.org_registration_no ?? "",
      org_legal_address: orgDetails?.org_legal_address ?? "",
      org_city: orgDetails?.org_city ?? "",
      org_state: orgDetails?.org_state ?? "",
      org_country: orgDetails?.org_country ?? "",
      org_postalcode: orgDetails?.org_postalcode ?? "",
      org_phone_no: orgDetails?.org_phone_no ?? "",
      org_email: orgDetails?.org_email ?? "",
      date_format: orgDetails?.date_format ?? "",
      number_format: orgDetails?.number_format ?? "",
      rounding_precision: orgDetails?.rounding_precision ?? "",
      currency: orgDetails?.currency ?? "",
      default_paymentterms: orgDetails?.default_paymentterms ?? "",
      default_tax: orgDetails?.default_tax ?? "",
      attribute_10: orgDetails?.attribute_10 ?? "",
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: OrgInfoForm) => {
      return apiRequest("PATCH", `/api/org-details/${orgDetails?.id}`, data);
    },
    onSuccess: async () => {
      localStorage.removeItem("orgDetails");
      await queryClient.invalidateQueries({ queryKey: ["/api/org-details"] });
      toast({
        title: "Success",
        description: "Organization details updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update organization details",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: any) => {
    updateMutation.mutate(data);
  };

  const onError = () => {
    toast({
      title: "Validation Failure",
      description: "Please fill all mandatory organization details",
      variant: "destructive",
    });
  };

  interface SystemSettings {
    schedulerEnabled: boolean;
    emailNotificationsEnabled: boolean;
    supplierEmailNotificationsEnabled: boolean;
  }

  const { data: systemSettings, isLoading: isLoadingSystemSettings } = useQuery<SystemSettings>({
    queryKey: ["/api/system-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/system-settings");
      if (!res.ok) throw new Error("Failed to fetch system settings");
      return res.json();
    },
    enabled: activeTab === "system",
  });

  const updateSystemSettingsMutation = useMutation({
    mutationFn: async (data: SystemSettings) => {
      const res = await apiRequest("PUT", "/api/system-settings", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/system-settings"] });
      toast({ title: "System settings saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const { data: aiServiceSettings = [], isLoading: isLoadingAiServiceSettings } = useQuery<
    AIServiceSetting[]
  >({
    queryKey: ["/api/ai-service-settings"],
    enabled: activeTab === "services",
  });

  const toggleAiServiceMutation = useMutation({
    mutationFn: async ({ featureKey, isEnabled }: { featureKey: string; isEnabled: boolean }) => {
      await apiRequest("PUT", `/api/ai-service-settings/${featureKey}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-service-settings"] });
    },
    onError: () => {
      toast({ title: "Failed to update setting", variant: "destructive" });
    },
  });

  const servicesTabSettings = BASIC_SETTINGS_SERVICE_KEYS.map((key) =>
    aiServiceSettings.find((s) => s.feature_key === key)
  ).filter((s): s is AIServiceSetting => !!s);

  const tabs = [
    { id: "information", label: "Information" },
    { id: "subsidiaries", label: "Subsidiaries" },
    { id: "locations", label: "Locations" },
    { id: "lookups", label: "Lookups" },
    { id: "payment-terms", label: "Payment Terms" },
    { id: "taxes", label: "Taxes" },
    { id: "terms-conditions", label: "Terms & Conditions" },
    { id: "prefix", label: "Prefix" },
    { id: "exchange-rates", label: "Exchange Rates" },
    { id: "system", label: "System" },
    { id: "services", label: "Services" },
  ];

  if (isLoading) {
    return (
      <div className="p-4 space-y-3">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72 mt-1" />
        </div>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
       <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">
            Application Settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Application level settings are defined here.
          </p>
        </div>
      </div> 

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-9">
          {tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="text-xs px-3"
              data-testid={`tab-${tab.id}`}
            >
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="information" className="mt-4">
          <form onSubmit={form.handleSubmit(onSubmit, onError)}>
            <div className="flex justify-end mb-3">
              <Button
                type="submit"
                size="sm"
                disabled={updateMutation.isPending}
                data-testid="button-save-org-info"
              >
                <Save className="h-4 w-4 mr-1" />
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {/* Company Information Card - Left Top */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        Company Information
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Organization branding and identity
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <Label className="text-xs">
                      Company / Organization Name
                    </Label>
                    <Input
                      {...form.register("organization_name")}
                      className="h-8 text-sm mt-1 bg-muted"
                      data-testid="input-org-name"
                      disabled
                    />
                  </div>
                  <div>
                    <div>
                      <Label className="text-xs">
                        Legal Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...form.register("org_legal_name")}
                        className="h-8 text-sm mt-1"
                        data-testid="input-legal-name"
                      />
                    </div>
                    {/* <div>
                      <Label className="text-xs">
                        Registration No{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...form.register("org_registration_no")}
                        className="h-8 text-sm mt-1"
                        data-testid="input-registration-no"
                      />
                    </div> */}
                  </div>
                  <div>
                    <Label className="text-xs">Company Logo</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Upload a logo to display. Recommended size: 200x80px.
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-12 border rounded flex items-center justify-center bg-muted/50 relative">
                        {logoUploadMutation.isPending && (
                          <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                          </div>
                        )}
                        <img
                          src={
                            logoPreview ||
                            orgDetails?.org_logo_path ||
                            prokrayaLogo
                          }
                          alt="Logo"
                          className="max-w-full max-h-full object-contain"
                          data-testid="img-org-logo"
                        />
                      </div>
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleLogoChange}
                        accept="image/*"
                        className="hidden"
                        data-testid="input-logo-file"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={
                          logoUploadMutation.isPending ||
                          clearLogoMutation.isPending
                        }
                        data-testid="button-change-logo"
                      >
                        <Upload className="h-4 w-4 mr-1" />
                        Upload Logo
                      </Button>
                      {orgDetails?.org_logo_path && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => clearLogoMutation.mutate()}
                          disabled={
                            logoUploadMutation.isPending ||
                            clearLogoMutation.isPending
                          }
                          data-testid="button-clear-logo"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={orgDetails?.attribute_10 === "Y" ? true : false}
                      onCheckedChange={(checked) => {
                          toggleChatBotMutation.mutate({
                              id: orgDetails?.id!,
                              chatBot: checked ? "Y" : "N",
                          });
                      }}
                      data-testid="chat-bot-enabled"
                    /> Chat Bot Show
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Contact Information Card - Right Top */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Phone className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        Contact Information
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Organization contact details
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <Label className="text-xs">
                      Email Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...form.register("org_email")}
                      type="email"
                      className="h-8 text-sm mt-1"
                      data-testid="input-email"
                      disabled
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      Phone Number <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={form.control}
                      name="org_phone_no"
                      render={({ field }) => (
                        <PhoneInput
                          value={field.value}
                          onChange={field.onChange}
                          className="h-8 mt-1"
                          data-testid="input-phone"
                          disabled
                        />
                      )}
                    />
                    {form.formState.errors.org_phone_no && (
                      <p className="text-[10px] text-destructive mt-1">
                        {form.formState.errors.org_phone_no.message}
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">
                      Legal Address <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      {...form.register("org_legal_address")}
                      className="h-8 text-sm mt-1"
                      data-testid="input-legal-address"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">
                        City <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...form.register("org_city")}
                        className="h-8 text-sm mt-1"
                        data-testid="input-city"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        State <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...form.register("org_state")}
                        className="h-8 text-sm mt-1"
                        data-testid="input-state"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">
                        Country <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.watch("org_country") || ""}
                        onValueChange={(val) => form.setValue("org_country", val)}
                      >
                        <SelectTrigger
                          className="h-8 text-sm mt-1"
                          data-testid="select-country"
                        >
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                        <SelectContent>
                          {countryOptions.map((c) => (
                            <SelectItem key={c.value} value={c.value}>
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">
                        Postal Code <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...form.register("org_postalcode")}
                        className="h-8 text-sm mt-1"
                        data-testid="input-postal-code"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={7}
                        onInput={(e) => {
                          e.currentTarget.value = e.currentTarget.value
                            .replace(/\D/g, "")
                            .slice(0, 7);
                        }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Settings Card - Left Bottom */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        Payment Settings
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Default payment terms and tax
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <Label className="text-xs">Default Payment Terms</Label>
                    <Select
                      value={form.watch("default_paymentterms") || ""}
                      onValueChange={(val) =>
                        form.setValue("default_paymentterms", val)
                      }
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-payment-terms"
                      >
                        <SelectValue placeholder="Select payment terms" />
                      </SelectTrigger>
                      <SelectContent>
                        {allPaymentTerms.map((term) => (
                          <SelectItem key={term.id} value={String(term.id)}>
                            {term.terms_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Default Tax Rate</Label>
                    <Select
                      value={form.watch("default_tax") || ""}
                      onValueChange={(val) => form.setValue("default_tax", val)}
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-tax-rate"
                      >
                        <SelectValue placeholder="Select tax rate" />
                      </SelectTrigger>
                      <SelectContent>
                        {allTaxes.map((tax) => (
                          <SelectItem key={tax.id} value={tax.tax_code}>
                            {tax.tax_code} - {tax.tax_rate}%
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* <div>
                    <Label className="text-xs">Rounding Precision</Label>
                    <Select
                      value={form.watch("rounding_precision") || ""}
                      onValueChange={(val) =>
                        form.setValue("rounding_precision", val)
                      }
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-rounding-precision"
                      >
                        <SelectValue placeholder="Select precision" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">0 decimals</SelectItem>
                        <SelectItem value="1">1 decimal</SelectItem>
                        <SelectItem value="2">2 decimals</SelectItem>
                        <SelectItem value="3">3 decimals</SelectItem>
                        <SelectItem value="4">4 decimals</SelectItem>
                      </SelectContent>
                    </Select>
                  </div> */}
                </CardContent>
              </Card>

              {/* Regional Settings Card - Right Bottom */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                      <Globe className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-medium">
                        Regional Settings
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">
                        Currency and date formats
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <Label className="text-xs">Currency</Label>
                    <Select
                      value={form.watch("currency") || ""}
                      onValueChange={(val) => form.setValue("currency", val)}
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-currency"
                      >
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        {currencyOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Date Format</Label>
                    <Select
                      value={form.watch("date_format") || ""}
                      onValueChange={(val) => form.setValue("date_format", val)}
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-date-format"
                      >
                        <SelectValue placeholder="Select date format" />
                      </SelectTrigger>
                      <SelectContent>
                        {DATE_FORMATS.map((format) => (
                          <SelectItem key={format.value} value={format.value}>
                            {format.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* <div>
                    <Label className="text-xs">Number Format</Label>
                    <Select
                      value={form.watch("number_format") || ""}
                      onValueChange={(val) =>
                        form.setValue("number_format", val)
                      }
                    >
                      <SelectTrigger
                        className="h-8 text-sm mt-1"
                        data-testid="select-number-format"
                      >
                        <SelectValue placeholder="Select number format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="#,##0.0000">
                          #,##0.0000 (1,234.5678)
                        </SelectItem>
                        <SelectItem value="#,##0.##">
                          #,##0.00 (1,234.56)
                        </SelectItem>
                        <SelectItem value="###0.0000">
                          ###0.0000 (1234.5678)
                        </SelectItem>
                        <SelectItem value="###0.00">
                          ###0.00 (1234.56)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div> */}
                </CardContent>
              </Card>
            </div>
          </form>
        </TabsContent>

        <TabsContent value="subsidiaries" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddSubsidiary}
              data-testid="button-add-subsidiary"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Subsidiary
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, email, state..."
                    value={subSearchQuery}
                    onChange={(e) => {
                      setSubSearchQuery(e.target.value);
                      setSubPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-subsidiaries"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-export-subsidiaries"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-subsidiary-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-subsidiary-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-subsidiary-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingSubsidiaries ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">Id</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[160px]">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            Name
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">
                            State
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            Country
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Email
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[130px]">
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            Contact No.
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5" />
                            Currency
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[60px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filtered = subsidiaries.filter(
                          (sub) =>
                            !subSearchQuery ||
                            sub.organization_name
                              ?.toLowerCase()
                              .includes(subSearchQuery.toLowerCase()) ||
                            sub.org_email
                              ?.toLowerCase()
                              .includes(subSearchQuery.toLowerCase()) ||
                            sub.org_state
                              ?.toLowerCase()
                              .includes(subSearchQuery.toLowerCase()) ||
                            sub.org_country
                              ?.toLowerCase()
                              .includes(subSearchQuery.toLowerCase()),
                        );
                        const paginated = filtered.slice(
                          (subPage - 1) * subLimit,
                          subPage * subLimit,
                        );
                        const totalPages = Math.ceil(
                          filtered.length / subLimit,
                        );

                        return paginated.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={8}
                              className="text-center py-6 text-muted-foreground"
                            >
                              No subsidiaries found
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginated.map((sub) => (
                            <TableRow
                              key={sub.id}
                              data-testid={`row-subsidiary-${sub.id}`}
                            >
                              <TableCell className="py-1.5 font-medium text-sm truncate">
                                SUB{String(sub.id).padStart(6, "0")}
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {sub.organization_name || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{sub.organization_name || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {sub.org_state || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{sub.org_state || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {sub.org_country || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{sub.org_country || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {sub.org_email || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{sub.org_email || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {sub.org_phone_no || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{sub.org_phone_no || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Badge variant="secondary" className="text-xs">
                                  {sub.currency || "ALL"}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Edit Subsidiary"
                                  onClick={() => openEditSubsidiary(sub)}
                                  data-testid={`button-edit-subsidiary-${sub.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Delete Subsidiary"
                                  onClick={() => deleteSubsidiaryMutation.mutate(sub.id)}
                                  data-testid={`button-delete-subsidiary-${sub.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        );
                      })()}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {(() => {
                    const filtered = subsidiaries.filter(
                      (sub) =>
                        !subSearchQuery ||
                        sub.organization_name
                          ?.toLowerCase()
                          .includes(subSearchQuery.toLowerCase()) ||
                        sub.org_email
                          ?.toLowerCase()
                          .includes(subSearchQuery.toLowerCase()) ||
                        sub.org_state
                          ?.toLowerCase()
                          .includes(subSearchQuery.toLowerCase()) ||
                        sub.org_country
                          ?.toLowerCase()
                          .includes(subSearchQuery.toLowerCase()),
                    );
                    const totalPages =
                      Math.ceil(filtered.length / subLimit) || 1;

                    return (
                      <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Rows:
                          </span>
                          <Select
                            value={subLimit.toString()}
                            onValueChange={(v) => {
                              setSubLimit(parseInt(v));
                              setSubPage(1);
                            }}
                          >
                            <SelectTrigger
                              className="w-[60px] h-7 text-xs"
                              data-testid="select-subsidiary-page-size"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {filtered.length > 0
                              ? `${(subPage - 1) * subLimit + 1}-${Math.min(subPage * subLimit, filtered.length)} of ${filtered.length}`
                              : "0 results"}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setSubPage((p) => Math.max(1, p - 1))
                              }
                              disabled={subPage <= 1}
                              data-testid="button-subsidiary-prev-page"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs px-1">
                              {subPage}/{totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setSubPage((p) => Math.min(totalPages, p + 1))
                              }
                              disabled={subPage >= totalPages}
                              data-testid="button-subsidiary-next-page"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddLocation}
              data-testid="button-add-location"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Location
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by location name, address..."
                    value={locSearchQuery}
                    onChange={(e) => {
                      setLocSearchQuery(e.target.value);
                      setLocPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-locations"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-export-locations"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-location-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-location-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-location-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingLocations ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">Id</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            Status
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                          <span className="flex items-center gap-1.5">
                            Business Entity
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                          <span className="flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5" />
                            Location
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[220px]">
                          <span className="flex items-center gap-1.5">
                            Billing Address
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[220px]">
                          <span className="flex items-center gap-1.5">
                            Shipping Address
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(() => {
                        const filtered = sortedLocations.filter(
                          (loc) =>
                            !locSearchQuery ||
                            loc.location_name
                              ?.toLowerCase()
                              .includes(locSearchQuery.toLowerCase()) ||
                            loc.location_id
                              ?.toLowerCase()
                              .includes(locSearchQuery.toLowerCase()) ||
                            loc.organization_name
                              ?.toLowerCase()
                              .includes(locSearchQuery.toLowerCase()) ||
                            loc.billto_address
                              ?.toLowerCase()
                              .includes(locSearchQuery.toLowerCase()) ||
                            loc.shipto_address
                              ?.toLowerCase()
                              .includes(locSearchQuery.toLowerCase()),
                        );
                        const paginated = filtered.slice(
                          (locPage - 1) * locLimit,
                          locPage * locLimit,
                        );

                        return paginated.length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={7}
                              className="text-center py-6 text-muted-foreground"
                            >
                              No locations found
                            </TableCell>
                          </TableRow>
                        ) : (
                          paginated.map((loc) => (
                            <TableRow
                              key={loc.id}
                              data-testid={`row-location-${loc.id}`}
                            >
                              <TableCell className="py-1.5 font-medium text-sm truncate">
                                {loc.location_id || loc.id}
                              </TableCell>
                              <TableCell className="py-1.5">
                                <Switch
                                  checked={loc.status === "Y"}
                                  onCheckedChange={(checked) => {
                                    toggleLocationStatusMutation.mutate({
                                      id: loc.id,
                                      status: checked ? "Y" : "N",
                                    });
                                  }}
                                  data-testid={`switch-location-status-${loc.id}`}
                                />
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {loc.organization_name}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{loc.organization_name}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {loc.location_name || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{loc.location_name || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {loc.billto_address || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{loc.billto_address || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell
                                className="py-1.5 text-sm truncate"
                              >
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm block truncate max-w-[150px] cursor-default">
                                      {loc.shipto_address || "-"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p>{loc.shipto_address || "-"}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell className="py-1.5">
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7"
                                    title="Edit Location"
                                    onClick={() => openEditLocation(loc)}
                                    data-testid={`button-edit-location-${loc.id}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-destructive hover:text-destructive"
                                    title="Delete Location"
                                    onClick={() => setDeleteLocationId(loc.id)}
                                    data-testid={`button-delete-location-${loc.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))
                        );
                      })()}
                    </TableBody>
                  </Table>

                  {/* Pagination Controls */}
                  {(() => {
                    const filtered = locations.filter(
                      (loc) =>
                        !locSearchQuery ||
                        loc.location_name
                          ?.toLowerCase()
                          .includes(locSearchQuery.toLowerCase()) ||
                        loc.location_id
                          ?.toLowerCase()
                          .includes(locSearchQuery.toLowerCase()) ||
                        loc.organization_name
                          ?.toLowerCase()
                          .includes(locSearchQuery.toLowerCase()) ||
                        loc.billto_address
                          ?.toLowerCase()
                          .includes(locSearchQuery.toLowerCase()) ||
                        loc.shipto_address
                          ?.toLowerCase()
                          .includes(locSearchQuery.toLowerCase()),
                    );
                    const totalPages =
                      Math.ceil(filtered.length / locLimit) || 1;

                    return (
                      <div className="flex items-center justify-between border-t px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            Rows:
                          </span>
                          <Select
                            value={locLimit.toString()}
                            onValueChange={(v) => {
                              setLocLimit(parseInt(v));
                              setLocPage(1);
                            }}
                          >
                            <SelectTrigger
                              className="w-[60px] h-7 text-xs"
                              data-testid="select-location-page-size"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="10">10</SelectItem>
                              <SelectItem value="20">20</SelectItem>
                              <SelectItem value="50">50</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">
                            {filtered.length > 0
                              ? `${(locPage - 1) * locLimit + 1}-${Math.min(locPage * locLimit, filtered.length)} of ${filtered.length}`
                              : "0 results"}
                          </span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setLocPage((p) => Math.max(1, p - 1))
                              }
                              disabled={locPage <= 1}
                              data-testid="button-location-prev-page"
                            >
                              <ChevronLeft className="h-3.5 w-3.5" />
                            </Button>
                            <span className="text-xs px-1">
                              {locPage}/{totalPages}
                            </span>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                setLocPage((p) => Math.min(totalPages, p + 1))
                              }
                              disabled={locPage >= totalPages}
                              data-testid="button-location-next-page"
                            >
                              <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="lookups" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddLookup}
              data-testid="button-add-lookup"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Lookup Property
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by property name, key, value..."
                    value={lookupSearchQuery}
                    onChange={(e) => {
                      setLookupSearchQuery(e.target.value);
                      setLookupPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-lookup-search"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-lookup-export"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-lookup-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-lookup-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-lookup-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingLookups ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            Status
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">Id</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[180px]">
                          <span className="flex items-center gap-1.5">
                            Property Name
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">Key</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">
                            Value
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[200px]">
                          <span className="flex items-center gap-1.5">
                            Description
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lookups.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-6 text-muted-foreground"
                          >
                            No lookups found
                          </TableCell>
                        </TableRow>
                      ) : (
                        lookups.map((lookup) => (
                          <TableRow
                            key={lookup.id}
                            data-testid={`row-lookup-${lookup.id}`}
                          >
                            <TableCell className="py-1.5">
                              <Switch
                                checked={lookup.status === "Y"}
                                onCheckedChange={(checked) => {
                                  toggleLookupStatusMutation.mutate({
                                    id: lookup.id,
                                    status: checked ? "Y" : "N",
                                  });
                                }}
                                data-testid={`switch-lookup-status-${lookup.id}`}
                              />
                            </TableCell>
                            <TableCell className="py-1.5 font-medium text-sm truncate">
                              {lookup.id}
                            </TableCell>
                            <TableCell
                              className="py-1.5 text-sm truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {lookup.property_name}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{lookup.property_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="py-1.5 text-sm truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {lookup.lookup_key}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{lookup.lookup_key}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="py-1.5 text-sm truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {lookup.lookup_value}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{lookup.lookup_value}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="py-1.5 text-sm truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {lookup.description}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{lookup.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  title="Edit Lookup"
                                  onClick={() => openEditLookup(lookup)}
                                  data-testid={`button-edit-lookup-${lookup.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  title="Delete Lookup"
                                  onClick={() => setDeleteLookupId(lookup.id)}
                                  data-testid={`button-delete-lookup-${lookup.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="p-3 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Select
                        value={String(lookupLimit)}
                        onValueChange={(val) => {
                          setLookupLimit(Number(val));
                          setLookupPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="h-7 w-[70px] text-xs"
                          data-testid="select-lookup-page-size"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5</SelectItem>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-xs text-muted-foreground">
                        {lookupPagination.total > 0
                          ? `${(lookupPage - 1) * lookupLimit + 1}-${Math.min(lookupPage * lookupLimit, lookupPagination.total)} of ${lookupPagination.total}`
                          : "0 items"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setLookupPage((p) => Math.max(1, p - 1))}
                        disabled={lookupPage <= 1}
                        data-testid="button-lookup-prev-page"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <span className="text-xs px-1">
                        {lookupPage}/{lookupPagination.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() =>
                          setLookupPage((p) =>
                            Math.min(lookupPagination.totalPages, p + 1),
                          )
                        }
                        disabled={lookupPage >= lookupPagination.totalPages}
                        data-testid="button-lookup-next-page"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Add/Edit Lookup Sheet */}
          <Sheet open={showLookupSheet} onOpenChange={setShowLookupSheet}>
            <SheetContent className="w-[50vw] sm:max-w-[50vw]">
              <SheetHeader className="space-y-1 pb-3">
                <SheetTitle className="text-base">
                  {editingLookup
                    ? "Edit Lookup Property"
                    : "Add Lookup Property"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> Indicates mandatory fields
                </p>
              </SheetHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Property Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={lookupForm.property_name}
                    onChange={(e) =>
                      setLookupForm({
                        ...lookupForm,
                        property_name: e.target.value,
                      })
                    }
                    placeholder="Enter property name"
                    data-testid="input-lookup-property-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Key <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={lookupForm.lookup_key}
                    onChange={(e) =>
                      setLookupForm({
                        ...lookupForm,
                        lookup_key: e.target.value,
                      })
                    }
                    placeholder="Enter key"
                    data-testid="input-lookup-key"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Value <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={lookupForm.lookup_value}
                    onChange={(e) =>
                      setLookupForm({
                        ...lookupForm,
                        lookup_value: e.target.value,
                      })
                    }
                    placeholder="Enter value"
                    data-testid="input-lookup-value"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={lookupForm.description}
                    onChange={(e) =>
                      setLookupForm({
                        ...lookupForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter description"
                    data-testid="input-lookup-description"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowLookupSheet(false)}
                    data-testid="button-cancel-lookup"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveLookup}
                    disabled={
                      createLookupMutation.isPending ||
                      updateLookupMutation.isPending
                    }
                    data-testid="button-save-lookup"
                  >
                    {(createLookupMutation.isPending ||
                      updateLookupMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                    {editingLookup ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          {/* Delete Lookup Confirmation */}
          <AlertDialog
            open={deleteLookupId !== null}
            onOpenChange={() => setDeleteLookupId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Lookup Property</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this lookup property? This
                  action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-lookup">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() =>
                    deleteLookupId &&
                    deleteLookupMutation.mutate(deleteLookupId)
                  }
                  data-testid="button-confirm-delete-lookup"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="payment-terms" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddPaymentTerm}
              data-testid="button-add-payment-term"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Payment Term
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by terms name, description..."
                    value={paymentTermSearchQuery}
                    onChange={(e) => {
                      setPaymentTermSearchQuery(e.target.value);
                      setPaymentTermPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-payment-terms"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-export-payment-terms"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-payment-term-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-payment-term-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-payment-term-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingPaymentTerms ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">Id</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            Status
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[200px]">
                          <span className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5" />
                            Terms Name
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            Description
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paymentTerms.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-6 text-muted-foreground"
                          >
                            No payment terms found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paymentTerms.map((term) => (
                          <TableRow
                            key={term.id}
                            data-testid={`row-payment-term-${term.id}`}
                          >
                            <TableCell className="py-1.5 font-medium">
                              {term.payment_term_id}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Switch
                                checked={term.status === "Y"}
                                onCheckedChange={(checked) => {
                                  togglePaymentTermStatusMutation.mutate({
                                    id: term.id,
                                    status: checked ? "Y" : "N",
                                  });
                                }}
                                data-testid={`switch-payment-term-status-${term.id}`}
                              />
                            </TableCell>
                            <TableCell
                              className="py-1.5 truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {term.terms_name}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{term.terms_name}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="py-1.5 truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {term.description}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{term.description}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditPaymentTerm(term)}
                                  data-testid={`button-edit-payment-term-${term.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() =>
                                    setDeletePaymentTermId(term.id)
                                  }
                                  data-testid={`button-delete-payment-term-${term.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Show</span>
                      <Select
                        value={String(paymentTermLimit)}
                        onValueChange={(val) => {
                          setPaymentTermLimit(Number(val));
                          setPaymentTermPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-16"
                          data-testid="select-payment-term-limit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>of {paymentTermPagination.total} entries</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setPaymentTermPage((p) => Math.max(1, p - 1))
                        }
                        disabled={paymentTermPage <= 1}
                        data-testid="button-payment-term-prev"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        Page {paymentTermPage} of{" "}
                        {paymentTermPagination.totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setPaymentTermPage((p) =>
                            Math.min(paymentTermPagination.totalPages, p + 1),
                          )
                        }
                        disabled={
                          paymentTermPage >= paymentTermPagination.totalPages
                        }
                        data-testid="button-payment-term-next"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Sheet
            open={showPaymentTermSheet}
            onOpenChange={setShowPaymentTermSheet}
          >
            <SheetContent style={{ width: "50vw", maxWidth: "50vw" }}>
              <SheetHeader className="space-y-1 pb-3">
                <SheetTitle className="text-base">
                  {editingPaymentTerm
                    ? "Edit Payment Term"
                    : "Add Payment Term"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> Indicates mandatory fields
                </p>
              </SheetHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Terms Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={paymentTermForm.terms_name}
                    onChange={(e) =>
                      setPaymentTermForm({
                        ...paymentTermForm,
                        terms_name: e.target.value,
                      })
                    }
                    placeholder="Enter terms name"
                    data-testid="input-payment-term-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={paymentTermForm.description}
                    onChange={(e) =>
                      setPaymentTermForm({
                        ...paymentTermForm,
                        description: e.target.value,
                      })
                    }
                    placeholder="Enter description"
                    data-testid="input-payment-term-description"
                  />
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowPaymentTermSheet(false)}
                    data-testid="button-cancel-payment-term"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSavePaymentTerm}
                    disabled={
                      createPaymentTermMutation.isPending ||
                      updatePaymentTermMutation.isPending
                    }
                    data-testid="button-save-payment-term"
                  >
                    {(createPaymentTermMutation.isPending ||
                      updatePaymentTermMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                    {editingPaymentTerm ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <AlertDialog
            open={deletePaymentTermId !== null}
            onOpenChange={(open) => !open && setDeletePaymentTermId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Payment Term</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this payment term? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-payment-term">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deletePaymentTermId &&
                    deletePaymentTermMutation.mutate(deletePaymentTermId)
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete-payment-term"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="taxes" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openAddTax} data-testid="button-add-tax">
              <Plus className="h-4 w-4 mr-1" />
              Add Tax
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by tax code, description..."
                    value={taxSearchQuery}
                    onChange={(e) => {
                      setTaxSearchQuery(e.target.value);
                      setTaxPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-taxes"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-export-taxes"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-tax-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-tax-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-tax-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingTaxes ? (
                <div className="p-3 space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">Id</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            Status
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5" />
                            Tax Code
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            Description
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            Rate (%)
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            Type
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {taxes.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="text-center py-6 text-muted-foreground"
                          >
                            No taxes found
                          </TableCell>
                        </TableRow>
                      ) : (
                        taxes.map((tax) => (
                          <TableRow
                            key={tax.id}
                            data-testid={`row-tax-${tax.id}`}
                          >
                            <TableCell className="py-1.5 font-medium">
                              {tax.tax_code_id}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <Switch
                                checked={tax.status === "Y"}
                                onCheckedChange={(checked) => {
                                  toggleTaxStatusMutation.mutate({
                                    id: tax.id,
                                    status: checked ? "Y" : "N",
                                  });
                                }}
                                data-testid={`switch-tax-status-${tax.id}`}
                              />
                            </TableCell>
                            <TableCell
                              className="py-1.5 truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {tax.tax_code}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{tax.tax_code}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell
                              className="py-1.5 truncate"
                            >
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {tax.tax_code_desc}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{tax.tax_code_desc}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5">
                              {tax.tax_rate}%
                            </TableCell>
                            <TableCell className="py-1.5">
                              {tax.tax_type}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditTax(tax)}
                                  data-testid={`button-edit-tax-${tax.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteTaxId(tax.id)}
                                  data-testid={`button-delete-tax-${tax.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Show</span>
                      <Select
                        value={String(taxLimit)}
                        onValueChange={(val) => {
                          setTaxLimit(Number(val));
                          setTaxPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="h-8 w-16"
                          data-testid="select-tax-limit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span>of {taxPagination.total} entries</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setTaxPage((p) => Math.max(1, p - 1))}
                        disabled={taxPage <= 1}
                        data-testid="button-tax-prev"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm px-2">
                        Page {taxPage} of {taxPagination.totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          setTaxPage((p) =>
                            Math.min(taxPagination.totalPages, p + 1),
                          )
                        }
                        disabled={taxPage >= taxPagination.totalPages}
                        data-testid="button-tax-next"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Sheet open={showTaxSheet} onOpenChange={setShowTaxSheet}>
            <SheetContent style={{ width: "50vw", maxWidth: "50vw" }}>
              <SheetHeader className="space-y-1 pb-3">
                <SheetTitle className="text-base">
                  {editingTax ? "Edit Tax" : "Add Tax"}
                </SheetTitle>
                <p className="text-xs text-muted-foreground">
                  <span className="text-destructive">*</span> Indicates mandatory fields
                </p>
              </SheetHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Tax Code <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={taxForm.tax_code}
                    onChange={(e) =>
                      setTaxForm({ ...taxForm, tax_code: e.target.value })
                    }
                    placeholder="e.g., VAT5%"
                    data-testid="input-tax-code"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm">
                    Description <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    className="h-8 text-sm"
                    value={taxForm.tax_code_desc}
                    onChange={(e) =>
                      setTaxForm({ ...taxForm, tax_code_desc: e.target.value })
                    }
                    placeholder="Enter description"
                    data-testid="input-tax-description"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Tax Rate (%) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="h-8 text-sm"
                      type="number"
                      min="0"
                      step="0.01"
                      value={taxForm.tax_rate}
                      onChange={(e) =>
                        setTaxForm({ ...taxForm, tax_rate: e.target.value })
                      }
                      placeholder="e.g., 5"
                      data-testid="input-tax-rate"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Tax Type <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      className="h-8 text-sm"
                      value={taxForm.tax_type}
                      onChange={(e) =>
                        setTaxForm({ ...taxForm, tax_type: e.target.value })
                      }
                      placeholder="e.g., VAT"
                      data-testid="input-tax-type"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => setShowTaxSheet(false)}
                    data-testid="button-cancel-tax"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSaveTax}
                    disabled={
                      createTaxMutation.isPending || updateTaxMutation.isPending
                    }
                    data-testid="button-save-tax"
                  >
                    {(createTaxMutation.isPending ||
                      updateTaxMutation.isPending) && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                    {editingTax ? "Update" : "Add"}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <AlertDialog
            open={deleteTaxId !== null}
            onOpenChange={(open) => !open && setDeleteTaxId(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Tax</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this tax code? This action
                  cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel data-testid="button-cancel-delete-tax">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    deleteTaxId && deleteTaxMutation.mutate(deleteTaxId)
                  }
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  data-testid="button-confirm-delete-tax"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </TabsContent>

        <TabsContent value="terms-conditions" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" onClick={openAddTnc} data-testid="button-add-tnc">
              <Plus className="h-4 w-4 mr-1" />
              Add Terms & Conditions
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by module or text..."
                    value={tncSearchQuery}
                    onChange={(e) => {
                      setTncSearchQuery(e.target.value);
                      setTncPage(1);
                    }}
                    className="pl-8 h-8"
                    data-testid="input-search-tnc"
                  />
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingTnc ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : termsConditions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No terms & conditions found
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="text-xs">
                        <TableHead className="h-9 py-2 max-w-md">
                          <span className="flex items-center gap-1.5">
                            Module
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 max-w-md">
                          <span className="flex items-center gap-1.5">
                            Terms Text
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {termsConditions.map((tnc) => (
                        <TableRow
                          key={tnc.id}
                          className="text-sm"
                          data-testid={`row-tnc-${tnc.id}`}
                        >
                          <TableCell className="py-1.5 font-medium">
                            {tnc.module_name}
                          </TableCell>
                          <TableCell className="py-1.5 text-muted-foreground max-w-md truncate">
                            {tnc.tnc_text}
                          </TableCell>
                          <TableCell className="py-1.5">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEditTnc(tnc)}
                                data-testid={`button-edit-tnc-${tnc.id}`}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTncId(tnc.id)}
                                data-testid={`button-delete-tnc-${tnc.id}`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {tncPagination.totalPages > 1 && (
                <div className="flex items-center justify-between border-t p-2">
                  <div className="text-xs text-muted-foreground">
                    Page {tncPagination.page} of {tncPagination.totalPages}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={tncPagination.page <= 1}
                      onClick={() => setTncPage((p) => p - 1)}
                      data-testid="button-prev-tnc-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-7 w-7"
                      disabled={tncPagination.page >= tncPagination.totalPages}
                      onClick={() => setTncPage((p) => p + 1)}
                      data-testid="button-next-tnc-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="prefix" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddPrefix}
              data-testid="button-add-prefix"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Prefix
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, value, key..."
                    value={prefixSearchQuery}
                    onChange={(e) => {
                      setPrefixSearchQuery(e.target.value);
                      setPrefixPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-prefixes"
                  />
                </div>
                {/* <div className="flex items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8"
                        data-testid="button-export-prefixes"
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem data-testid="menu-export-prefix-pdf">
                        <FileDown className="h-4 w-4 mr-2" />
                        Export as PDF
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-prefix-xls">
                        <FileSpreadsheet className="h-4 w-4 mr-2" />
                        Export as XLS
                      </DropdownMenuItem>
                      <DropdownMenuItem data-testid="menu-export-prefix-csv">
                        <Download className="h-4 w-4 mr-2" />
                        Export as CSV
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div> */}
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingPrefixes ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        {/* <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            Status
                          </span>
                        </TableHead> */}
                        <TableHead className="h-9 py-2 text-xs font-medium w-[200px]">
                          <span className="flex items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5" />
                            Prefix Name
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">
                            Value
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">Key</span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            Description
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prefixes.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={6}
                            className="text-center py-6 text-muted-foreground"
                          >
                            No prefixes found
                          </TableCell>
                        </TableRow>
                      ) : (
                        prefixes.map((prefix) => (
                          <TableRow
                            key={prefix.id}
                            data-testid={`row-prefix-${prefix.id}`}
                          >
                            {/* <TableCell className="py-1.5">
                              <Switch
                                checked={prefix.status === "Active"}
                                onCheckedChange={(checked) => {
                                  togglePrefixStatusMutation.mutate({
                                    id: prefix.id,
                                    status: checked ? "Active" : "Inactive",
                                  });
                                }}
                                data-testid={`switch-prefix-status-${prefix.id}`}
                              />
                            </TableCell> */}
                            <TableCell className="py-1.5 font-medium">
                              {prefix.prefix_name}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {prefix.prefix_value}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {prefix.prefix_key}
                            </TableCell>
                            <TableCell className="py-1.5 text-muted-foreground truncate">
                              {prefix.prefix_description}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditPrefix(prefix)}
                                  data-testid={`button-edit-prefix-${prefix.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                {/* <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => setDeletePrefixId(prefix.id)}
                                  data-testid={`button-delete-prefix-${prefix.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button> */}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Rows per page:
                      </span>
                      <Select
                        value={String(prefixLimit)}
                        onValueChange={(val) => {
                          setPrefixLimit(Number(val));
                          setPrefixPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="h-7 w-16 text-xs"
                          data-testid="select-prefix-limit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(prefixPage - 1) * prefixLimit + 1}-
                        {Math.min(
                          prefixPage * prefixLimit,
                          prefixPagination.total,
                        )}{" "}
                        of {prefixPagination.total}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={prefixPage <= 1}
                          onClick={() =>
                            setPrefixPage((p) => Math.max(1, p - 1))
                          }
                          data-testid="button-prefix-prev"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={prefixPage >= prefixPagination.totalPages}
                          onClick={() => setPrefixPage((p) => p + 1)}
                          data-testid="button-prefix-next"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exchange-rates" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button
              size="sm"
              onClick={openAddExRate}
              data-testid="button-add-exchange-rate"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add rate
            </Button>
          </div>
          <Card>
            <div className="p-3 border-b">
              <div className="flex flex-col sm:flex-row gap-2 justify-between">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by currency code..."
                    value={exSearchQuery}
                    onChange={(e) => {
                      setExSearchQuery(e.target.value);
                      setExPage(1);
                    }}
                    className="pl-8 h-8 text-sm"
                    autoComplete="new-password"
                    name="search-basic-settings"
                    data-testid="input-search-exchange-rates"
                  />
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              {isLoadingExRates ? (
                <div className="p-4 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            <Globe className="h-3.5 w-3.5" />
                            From
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          To
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[140px]">
                          <span className="flex items-center gap-1.5">
                            <Coins className="h-3.5 w-3.5" />
                            Rate
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[130px]">
                          Effective date (UTC)
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">
                          <span className="flex items-center gap-1.5">
                            <Settings className="h-3.5 w-3.5" />
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {exRates.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={5}
                            className="text-center py-6 text-muted-foreground"
                          >
                            No exchange rates found. Add a rate using currencies
                            from the BASE_CURRENCY lookup.
                          </TableCell>
                        </TableRow>
                      ) : (
                        exRates.map((row) => (
                          <TableRow
                            key={row.id}
                            data-testid={`row-exchange-rate-${row.id}`}
                          >
                            <TableCell className="py-1.5 font-medium">
                              {row.from_currency}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {row.to_currency}
                            </TableCell>
                            <TableCell className="py-1.5 tabular-nums">
                              {typeof row.conversion_rate === "number"
                                ? row.conversion_rate
                                : parseFloat(String(row.conversion_rate))}
                            </TableCell>
                            <TableCell className="py-1.5 text-muted-foreground">
                              {String(row.conversion_date || "").slice(0, 10)}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  type="button"
                                  title="History"
                                  onClick={() =>
                                    openExHistory(
                                      row.from_currency,
                                      row.to_currency,
                                    )
                                  }
                                  data-testid={`button-exchange-rate-history-${row.id}`}
                                >
                                  <History className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => openEditExRate(row)}
                                  data-testid={`button-edit-exchange-rate-${row.id}`}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  onClick={() => deleteExchangeRateMutation.mutate(row.id)}
                                  data-testid={`button-delete-exchange-rate-${row.id}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between px-4 py-3 border-t">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        Rows per page:
                      </span>
                      <Select
                        value={String(exLimit)}
                        onValueChange={(val) => {
                          setExLimit(Number(val));
                          setExPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="h-7 w-16 text-xs"
                          data-testid="select-exchange-rate-limit"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {(exPage - 1) * exLimit + 1}-
                        {Math.min(exPage * exLimit, exPagination.total)} of{" "}
                        {exPagination.total}
                      </span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={exPage <= 1}
                          onClick={() => setExPage((p) => Math.max(1, p - 1))}
                          data-testid="button-exchange-rate-prev"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          disabled={exPage >= exPagination.totalPages}
                          onClick={() => setExPage((p) => p + 1)}
                          data-testid="button-exchange-rate-next"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                  <Settings className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">System &amp; notifications</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Control scheduled jobs and outbound email behaviour
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-6">
              {isLoadingSystemSettings ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Background scheduler</p>
                      <p className="text-xs text-muted-foreground">
                        Auto-close bids, document expiry reminders, and daily approval digests
                      </p>
                    </div>
                    <Switch
                      checked={systemSettings?.schedulerEnabled ?? false}
                      onCheckedChange={(checked) =>
                        updateSystemSettingsMutation.mutate({
                          schedulerEnabled: checked,
                          emailNotificationsEnabled: systemSettings?.emailNotificationsEnabled ?? true,
                          supplierEmailNotificationsEnabled:
                            systemSettings?.supplierEmailNotificationsEnabled ?? true,
                        })
                      }
                      disabled={updateSystemSettingsMutation.isPending}
                      data-testid="switch-scheduler-enabled"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Email notifications (all)</p>
                      <p className="text-xs text-muted-foreground">
                        Master switch for every outbound email, including staff and suppliers
                      </p>
                    </div>
                    <Switch
                      checked={systemSettings?.emailNotificationsEnabled ?? false}
                      onCheckedChange={(checked) =>
                        updateSystemSettingsMutation.mutate({
                          schedulerEnabled: systemSettings?.schedulerEnabled ?? false,
                          emailNotificationsEnabled: checked,
                          supplierEmailNotificationsEnabled:
                            systemSettings?.supplierEmailNotificationsEnabled ?? true,
                        })
                      }
                      disabled={updateSystemSettingsMutation.isPending}
                      data-testid="switch-email-notifications-enabled"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border p-3">
                    <div>
                      <p className="text-sm font-medium">Supplier / vendor emails</p>
                      <p className="text-xs text-muted-foreground">
                        Invitations, registration, PO, bid, auction, invoice, and contract emails sent to suppliers
                      </p>
                    </div>
                    <Switch
                      checked={systemSettings?.supplierEmailNotificationsEnabled ?? false}
                      onCheckedChange={(checked) =>
                        updateSystemSettingsMutation.mutate({
                          schedulerEnabled: systemSettings?.schedulerEnabled ?? false,
                          emailNotificationsEnabled: systemSettings?.emailNotificationsEnabled ?? true,
                          supplierEmailNotificationsEnabled: checked,
                        })
                      }
                      disabled={
                        updateSystemSettingsMutation.isPending ||
                        !(systemSettings?.emailNotificationsEnabled ?? false)
                      }
                      data-testid="switch-supplier-email-notifications-enabled"
                    />
                  </div>
                  {!(systemSettings?.emailNotificationsEnabled ?? false) && (
                    <p className="text-xs text-muted-foreground">
                      Enable &quot;Email notifications (all)&quot; first to send supplier emails.
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="services" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-sm font-medium">Services</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Enable or disable individual AI-powered procurement and catalog services
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {isLoadingAiServiceSettings ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                servicesTabSettings.map((feature) => (
                  <div
                    key={feature.feature_key}
                    className="flex items-center justify-between gap-4 rounded-md border p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{feature.feature_name}</p>
                      <p className="text-xs text-muted-foreground">{feature.description}</p>
                    </div>
                    <Switch
                      checked={feature.is_enabled}
                      onCheckedChange={(checked) =>
                        toggleAiServiceMutation.mutate({
                          featureKey: feature.feature_key,
                          isEnabled: checked,
                        })
                      }
                      disabled={toggleAiServiceMutation.isPending}
                      data-testid={`switch-feature-${feature.feature_key}`}
                    />
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Subsidiary Sheet */}
      <Sheet open={showSubsidiarySheet} onOpenChange={(open) => {
        setShowSubsidiarySheet(open);
        if (!open) {
          setSubsidiaryLogoPreview(null);
          setStagedLogoFile(null);
          setSubsidiaryErrors({});
        }
      }}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">
              {editingSubsidiary ? "Edit Subsidiary" : "Add Subsidiary"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
          </SheetHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-sm">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={subsidiaryForm.name}
                onChange={(e) => {
                  setSubsidiaryForm({ ...subsidiaryForm, name: e.target.value });
                  if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, name: "" }));
                }}
                className={`h-8 text-sm${subsidiaryErrors.name ? " border-destructive" : ""}`}
                data-testid="input-subsidiary-name"
              />
              {subsidiaryErrors.name && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.name}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">
                  Legal Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={subsidiaryForm.legal_name}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, legal_name: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, legal_name: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.legal_name ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-legal-name"
                />
                {subsidiaryErrors.legal_name && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.legal_name}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">
                  Business Registration No{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={subsidiaryForm.business_registration_no}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, business_registration_no: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, business_registration_no: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.business_registration_no ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-registration"
                />
                {subsidiaryErrors.business_registration_no && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.business_registration_no}</p>}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-sm">
                Legal Address <span className="text-destructive">*</span>
              </Label>
              <Input
                value={subsidiaryForm.legal_address}
                onChange={(e) => {
                  setSubsidiaryForm({ ...subsidiaryForm, legal_address: e.target.value });
                  if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, legal_address: "" }));
                }}
                className={`h-8 text-sm${subsidiaryErrors.legal_address ? " border-destructive" : ""}`}
                data-testid="input-subsidiary-address"
              />
              {subsidiaryErrors.legal_address && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.legal_address}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">
                  City <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={subsidiaryForm.city}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, city: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, city: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.city ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-city"
                />
                {subsidiaryErrors.city && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.city}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">
                  State <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={subsidiaryForm.state}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, state: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, state: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.state ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-state"
                />
                {subsidiaryErrors.state && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.state}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">
                  Country <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={subsidiaryForm.country}
                  onValueChange={(v) => {
                    setSubsidiaryForm({ ...subsidiaryForm, country: v });
                    setSubsidiaryErrors((p) => ({ ...p, country: "" }));
                  }}
                >
                  <SelectTrigger
                    className={`h-8 text-sm${subsidiaryErrors.country ? " border-destructive" : ""}`}
                    data-testid="select-subsidiary-country"
                  >
                    <SelectValue placeholder="Select Country" />
                  </SelectTrigger>
                  <SelectContent>
                    {countryOptions.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {subsidiaryErrors.country && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.country}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">
                  Postal Code <span className="text-destructive">*</span>
                </Label>
                <Input
                  value={subsidiaryForm.postal_code}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, postal_code: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, postal_code: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.postal_code ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-postal"
                />
                {subsidiaryErrors.postal_code && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.postal_code}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm">
                  Phone <span className="text-destructive">*</span>
                </Label>
                <PhoneInput
                  value={subsidiaryForm.phone}
                  onChange={(val) => {
                    setSubsidiaryForm({ ...subsidiaryForm, phone: val });
                    if (val.trim()) setSubsidiaryErrors((p) => ({ ...p, phone: "" }));
                  }}
                  defaultCountryCode={getDefaultDialCodeForCountry(subsidiaryForm.country || orgDetails?.org_country)}
                  className={`h-8 mt-1${subsidiaryErrors.phone ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-phone"
                />
                {subsidiaryErrors.phone && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.phone}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-sm">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="email"
                  value={subsidiaryForm.email}
                  onChange={(e) => {
                    setSubsidiaryForm({ ...subsidiaryForm, email: e.target.value });
                    if (e.target.value.trim()) setSubsidiaryErrors((p) => ({ ...p, email: "" }));
                  }}
                  className={`h-8 text-sm${subsidiaryErrors.email ? " border-destructive" : ""}`}
                  data-testid="input-subsidiary-email"
                />
                {subsidiaryErrors.email && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.email}</p>}
              </div>
            </div>

            <div className="pt-4 border-t">
              <h3 className="text-sm font-medium mb-3">Application Global Parameters</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm">Date Format <span className="text-destructive">*</span></Label>
                  <Select
                    value={subsidiaryForm.date_format}
                    onValueChange={(v) => setSubsidiaryForm({ ...subsidiaryForm, date_format: v })}
                  >
                    <SelectTrigger className={`h-8 text-sm${subsidiaryErrors.date_format ? " border-destructive" : ""}`} data-testid="select-subsidiary-date-format">
                      <SelectValue placeholder="Select Date Format" />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_FORMATS.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subsidiaryErrors.date_format && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.date_format}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Payment Terms <span className="text-destructive">*</span></Label>
                  <Select
                    value={subsidiaryForm.payment_terms}
                    onValueChange={(v) => setSubsidiaryForm({ ...subsidiaryForm, payment_terms: v })}
                  >
                    <SelectTrigger className={`h-8 text-sm${subsidiaryErrors.payment_terms ? " border-destructive" : ""}`} data-testid="select-subsidiary-payment-terms">
                      <SelectValue placeholder="Select Payment Terms" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentTerms.map((term) => (
                        <SelectItem key={term.id} value={String(term.id)}>
                          {term.terms_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subsidiaryErrors.payment_terms && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.payment_terms}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-1">
                  <Label className="text-sm">Tax Rate <span className="text-destructive">*</span></Label>
                  <Select
                    value={subsidiaryForm.tax_rate}
                    onValueChange={(v) => setSubsidiaryForm({ ...subsidiaryForm, tax_rate: v })}
                  >
                    <SelectTrigger className={`h-8 text-sm${subsidiaryErrors.tax_rate ? " border-destructive" : ""}`} data-testid="select-subsidiary-tax-rate">
                      <SelectValue placeholder="Select Tax Rate" />
                    </SelectTrigger>
                    <SelectContent>
                      {taxes.map((tax) => (
                        <SelectItem key={tax.id} value={tax.tax_code}>
                          {tax.tax_code} - {tax.tax_rate}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subsidiaryErrors.tax_rate && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.tax_rate}</p>}
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Base Currency <span className="text-destructive">*</span></Label>
                  <Select
                    value={subsidiaryForm.currency}
                    onValueChange={(v) => setSubsidiaryForm({ ...subsidiaryForm, currency: v })}
                  >
                    <SelectTrigger className={`h-8 text-sm${subsidiaryErrors.currency ? " border-destructive" : ""}`} data-testid="select-subsidiary-currency">
                      <SelectValue placeholder="Select Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyOptions.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {subsidiaryErrors.currency && <p className="text-xs text-destructive mt-1">{subsidiaryErrors.currency}</p>}
                </div>
              </div>
            </div>

            {/* <div className="grid grid-cols-2 gap-4 mt-3">
                <div className="space-y-1">
                  <Label className="text-sm">Number Format <span className="text-destructive">*</span></Label>
                  <Select 
                    value={subsidiaryForm.number_format} 
                    onValueChange={(v) => setSubsidiaryForm({...subsidiaryForm, number_format: v})}
                  >
                    <SelectTrigger className="h-8 text-sm" data-testid="select-subsidiary-number-format">
                      <SelectValue placeholder="Select Number Format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1,234.56">1,234.56</SelectItem>
                      <SelectItem value="1.234,56">1.234,56</SelectItem>
                      <SelectItem value="1 234.56">1 234.56</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm">Rounding Precision <span className="text-destructive">*</span></Label>
                  <Select 
                    value={subsidiaryForm.rounding_precision} 
                    onValueChange={(v) => setSubsidiaryForm({...subsidiaryForm, rounding_precision: v})}
                  >
                    <SelectTrigger className="h-8 text-sm" data-testid="select-subsidiary-rounding">
                      <SelectValue placeholder="Select Rounding Precision" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0 Decimal Places</SelectItem>
                      <SelectItem value="2">2 Decimal Places</SelectItem>
                      <SelectItem value="3">3 Decimal Places</SelectItem>
                      <SelectItem value="4">4 Decimal Places</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div> */}

            {/* <div className="pt-4 border-t">
              <h3 className="text-sm font-medium mb-3">Upload Company Logo</h3>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 border rounded-md flex items-center justify-center bg-muted overflow-hidden">
                  {subsidiaryLogoPreview ? (
                    <img src={subsidiaryLogoPreview} alt="Logo preview" className="w-full h-full object-contain" />
                  ) : (
                    <Building2 className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <input
                  ref={subsidiaryFileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!file.type.startsWith("image/")) {
                      toast({ title: "Invalid file", description: "Please select an image file", variant: "destructive" });
                      return;
                    }
                    setStagedLogoFile(file);
                    const reader = new FileReader();
                    reader.onload = (ev) => setSubsidiaryLogoPreview(ev.target?.result as string);
                    reader.readAsDataURL(file);
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => subsidiaryFileInputRef.current?.click()}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {stagedLogoFile ? "Change Logo" : "Upload Logo"}
                </Button>
                {stagedLogoFile && (
                  <span className="text-xs text-muted-foreground">
                    {stagedLogoFile.name}
                  </span>
                )}
              </div>
            </div> */}

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowSubsidiarySheet(false);
                  setSubsidiaryErrors({});
                }}
                disabled={
                  createSubsidiaryMutation.isPending ||
                  updateSubsidiaryMutation.isPending
                }
                data-testid="button-cancel-subsidiary"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveSubsidiary}
                disabled={
                  createSubsidiaryMutation.isPending ||
                  updateSubsidiaryMutation.isPending
                }
                data-testid="button-save-subsidiary"
              >
                {(createSubsidiaryMutation.isPending ||
                  updateSubsidiaryMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                {editingSubsidiary ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Add/Edit Location Sheet */}
      <Sheet open={showLocationSheet} onOpenChange={setShowLocationSheet}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">
              {editingLocation ? "Edit Location" : "Add Location"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
          </SheetHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1">
              <Label className="text-sm">
                Business Entity <span className="text-destructive">*</span>
              </Label>
              <Select
                value={locationForm.org_id}
                onValueChange={(val) =>
                  setLocationForm({ ...locationForm, org_id: val })
                }
              >
                <SelectTrigger
                  className={`h-8 text-sm${locationErrors.org_id ? " border-destructive" : ""}`}
                  data-testid="select-location-subsidiary"
                >
                  <SelectValue placeholder="Select subsidiary" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={String(org.id)}>
                      {org.organization_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {locationErrors.org_id && <p className="text-xs text-destructive mt-1">{locationErrors.org_id}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-sm">
                Location Name <span className="text-destructive">*</span>
              </Label>
              <Input
                value={locationForm.location_name}
                onChange={(e) =>
                  setLocationForm({
                    ...locationForm,
                    location_name: e.target.value,
                  })
                }
                className={`h-8 text-sm${locationErrors.location_name ? " border-destructive" : ""}`}
                placeholder="e.g., Head Quarters - Dubai"
                data-testid="input-location-name"
              />
              {locationErrors.location_name && <p className="text-xs text-destructive mt-1">{locationErrors.location_name}</p>}
            </div>



            <div className="space-y-1">
              <Label className="text-sm">
                Billing Address <span className="text-destructive">*</span>
              </Label>
              <Input
                value={locationForm.billto_address}
                onChange={(e) =>
                  setLocationForm({
                    ...locationForm,
                    billto_address: e.target.value,
                  })
                }
                className={`h-8 text-sm${locationErrors.billto_address ? " border-destructive" : ""}`}
                data-testid="input-location-billing-address"
              />
              {locationErrors.billto_address && <p className="text-xs text-destructive mt-1">{locationErrors.billto_address}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-sm">
                Shipping Address <span className="text-destructive">*</span>
              </Label>
              <Input
                value={locationForm.shipto_address}
                onChange={(e) =>
                  setLocationForm({
                    ...locationForm,
                    shipto_address: e.target.value,
                  })
                }
                className={`h-8 text-sm${locationErrors.shipto_address ? " border-destructive" : ""}`}
                data-testid="input-location-shipping-address"
              />
              {locationErrors.shipto_address && <p className="text-xs text-destructive mt-1">{locationErrors.shipto_address}</p>}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowLocationSheet(false)}
                disabled={
                  createLocationMutation.isPending ||
                  updateLocationMutation.isPending
                }
                data-testid="button-cancel-location"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveLocation}
                disabled={
                  createLocationMutation.isPending ||
                  updateLocationMutation.isPending
                }
                data-testid="button-save-location"
              >
                {(createLocationMutation.isPending ||
                  updateLocationMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                {editingLocation ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Location Confirmation Dialog */}
      <AlertDialog
        open={deleteLocationId !== null}
        onOpenChange={(open) => !open && setDeleteLocationId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Location</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this location? This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-location">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteLocationId &&
                deleteLocationMutation.mutate(deleteLocationId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-location"
            >
              {deleteLocationMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Prefix Sheet */}
      <Sheet open={showPrefixSheet} onOpenChange={setShowPrefixSheet}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">
              {editingPrefix ? "Edit Prefix" : "Add Prefix"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
          </SheetHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm" htmlFor="prefix-name">
                Prefix Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prefix-name"
                value={prefixForm.prefix_name}
                onChange={(e) =>
                  setPrefixForm({ ...prefixForm, prefix_name: e.target.value })
                }
                placeholder="e.g., PURCHASE ORDER"
                data-testid="input-prefix-name"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="prefix-value">
                Prefix Value <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prefix-value"
                value={prefixForm.prefix_value}
                onChange={(e) =>
                  setPrefixForm({ ...prefixForm, prefix_value: e.target.value })
                }
                placeholder="e.g., PO"
                data-testid="input-prefix-value"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="prefix-key">
                Prefix Key <span className="text-destructive">*</span>
              </Label>
              <Input
                id="prefix-key"
                value={prefixForm.prefix_key}
                onChange={(e) =>
                  setPrefixForm({ ...prefixForm, prefix_key: e.target.value })
                }
                placeholder="e.g., PO"
                data-testid="input-prefix-key"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="prefix-description">
                Description
              </Label>
              <Input
                id="prefix-description"
                value={prefixForm.prefix_description}
                onChange={(e) =>
                  setPrefixForm({
                    ...prefixForm,
                    prefix_description: e.target.value,
                  })
                }
                placeholder="e.g., Prefix for Purchase Orders"
                data-testid="input-prefix-description"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowPrefixSheet(false)}
                disabled={
                  createPrefixMutation.isPending ||
                  updatePrefixMutation.isPending
                }
                data-testid="button-cancel-prefix"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSavePrefix}
                disabled={
                  createPrefixMutation.isPending ||
                  updatePrefixMutation.isPending
                }
                data-testid="button-save-prefix"
              >
                {(createPrefixMutation.isPending ||
                  updatePrefixMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                {editingPrefix ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={showExRateSheet} onOpenChange={setShowExRateSheet}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">
              {editingExRate ? "Edit exchange rate" : "Add exchange rate"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              Amount in <strong>From</strong> multiplied by this rate equals
              amount in <strong>To</strong>. Currencies come from the{" "}
              <strong>BASE_CURRENCY</strong> lookup. The effective date (UTC) is
              set automatically on save.{" "}
              {editingExRate
                ? "Updating adds a new history row; previous rates stay in the history table."
                : "Add creates the first rate for this pair."}
            </p>
          </SheetHeader>

          <div className="mt-2 space-y-4">
            {editingExRate ? (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1.5 text-sm">
                <p>
                  <span className="text-muted-foreground">From: </span>
                  <span className="font-medium">{editingExRate.from_currency}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">To: </span>
                  <span className="font-medium">{editingExRate.to_currency}</span>
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="ex-from">
                    From currency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={exRateForm.from_currency || undefined}
                    onValueChange={(v) =>
                      setExRateForm({ ...exRateForm, from_currency: v })
                    }
                    disabled={isLoadingBaseCurrencies}
                  >
                    <SelectTrigger
                      id="ex-from"
                      className="h-8 text-sm"
                      data-testid="select-exchange-from"
                    >
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {baseCurrencyLookups.map((row) => (
                        <SelectItem
                          key={`ex-from-${row.id}`}
                          value={row.lookup_key.trim()}
                        >
                          {row.description?.trim() &&
                          row.description.trim().toUpperCase() !==
                            row.lookup_key.trim().toUpperCase()
                            ? `${row.description.trim()} (${row.lookup_key})`
                            : row.lookup_key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm" htmlFor="ex-to">
                    To currency <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={exRateForm.to_currency || undefined}
                    onValueChange={(v) =>
                      setExRateForm({ ...exRateForm, to_currency: v })
                    }
                    disabled={isLoadingBaseCurrencies}
                  >
                    <SelectTrigger
                      id="ex-to"
                      className="h-8 text-sm"
                      data-testid="select-exchange-to"
                    >
                      <SelectValue placeholder="Select currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {baseCurrencyLookups.map((row) => (
                        <SelectItem
                          key={`ex-to-${row.id}`}
                          value={row.lookup_key.trim()}
                        >
                          {row.description?.trim() &&
                          row.description.trim().toUpperCase() !==
                            row.lookup_key.trim().toUpperCase()
                            ? `${row.description.trim()} (${row.lookup_key})`
                            : row.lookup_key}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="ex-rate">
                Conversion rate <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ex-rate"
                type="text"
                inputMode="decimal"
                value={exRateForm.conversion_rate}
                onChange={(e) =>
                  setExRateForm({
                    ...exRateForm,
                    conversion_rate: e.target.value,
                  })
                }
                placeholder="e.g. 3.67"
                className="h-8 text-sm tabular-nums max-w-xs"
                data-testid="input-exchange-rate"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                type="button"
                onClick={() => setShowExRateSheet(false)}
                disabled={
                  createExRateMutation.isPending ||
                  updateExRateMutation.isPending
                }
                data-testid="button-cancel-exchange-rate"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleSaveExRate}
                disabled={
                  createExRateMutation.isPending ||
                  updateExRateMutation.isPending
                }
                data-testid="button-save-exchange-rate"
              >
                {(createExRateMutation.isPending ||
                  updateExRateMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                )}
                {editingExRate ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <Dialog
        open={exHistoryOpen}
        onOpenChange={(open) => {
          setExHistoryOpen(open);
          if (!open) setExHistoryPair(null);
        }}
      >
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col gap-0">
          <DialogHeader>
            <DialogTitle className="text-base pr-8">
              Rate history — {exHistoryPair?.from} → {exHistoryPair?.to}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 min-h-0 mt-2">
            {isLoadingExHistory ? (
              <div className="space-y-2 py-4">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : exHistoryRows.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                No history rows for this pair.
              </p>
            ) : (
              <Table className="text-sm">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="h-9 text-xs">Effective date (UTC)</TableHead>
                    <TableHead className="h-9 text-xs">Rate</TableHead>
                    <TableHead className="h-9 text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exHistoryRows.map((h, index) => (
                    <TableRow key={h.id}>
                      <TableCell className="py-1.5 text-muted-foreground">
                        {String(h.conversion_date || "").slice(0, 10)}
                      </TableCell>
                      <TableCell className="py-1.5 tabular-nums">
                        {typeof h.conversion_rate === "number"
                          ? h.conversion_rate
                          : parseFloat(String(h.conversion_rate))}
                      </TableCell>
                      <TableCell className="py-1.5">
                        {index === 0 ? (
                          <span className="text-xs font-medium text-primary">
                            Current
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Historical
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Prefix Confirmation Dialog */}
      <AlertDialog
        open={deletePrefixId !== null}
        onOpenChange={(open) => !open && setDeletePrefixId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Prefix</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this prefix? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-prefix">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletePrefixId && deletePrefixMutation.mutate(deletePrefixId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-prefix"
            >
              {deletePrefixMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Terms & Conditions Sheet */}
      <Sheet open={showTncSheet} onOpenChange={setShowTncSheet}>
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
          <SheetHeader className="space-y-1 pb-3">
            <SheetTitle className="text-base">
              {editingTnc
                ? "Edit Terms & Conditions"
                : "Add Terms & Conditions"}
            </SheetTitle>
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">*</span> Indicates mandatory fields
            </p>
          </SheetHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-2">
              <Label className="text-sm" htmlFor="tnc-module">
                Module Name <span className="text-destructive">*</span>
              </Label>
              <Select
                value={tncForm.module_name}
                onValueChange={(val) =>
                  setTncForm({ ...tncForm, module_name: val })
                }
              >
                <SelectTrigger id="tnc-module" data-testid="select-tnc-module">
                  <SelectValue placeholder="Select module" />
                </SelectTrigger>
                <SelectContent>
                  {(() => {
                    let filteredList = [];
                    if (tncForm?.module_name) {
                      filteredList = modulesList?.filter(
                        (item) => item.value === tncForm.module_name
                      );
                    } else {
                      filteredList = modulesList?.filter(
                        (item) =>
                          !termsConditions?.some(
                            (tc) => tc.module_name === item.value
                          )
                      );
                    }
                    return filteredList?.length > 0 ? (
                      filteredList.map((item) => (
                        <SelectItem key={item.key} value={item.value}>
                          {item.value}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem disabled value="no-data">
                        No records found
                      </SelectItem>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-sm" htmlFor="tnc-text">
                Terms Text <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="tnc-text"
                value={tncForm.tnc_text}
                onChange={(e) =>
                  setTncForm({ ...tncForm, tnc_text: e.target.value })
                }
                placeholder="Enter the terms and conditions text..."
                rows={6}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="input-tnc-text"
              />
            </div>

            {/* Document Section */}
            <div className="space-y-2 pt-2 border-t">
              <Label className="text-sm">Document</Label>
              {tncDocument ? (
                <div className="space-y-2">
                  {/* {tncDocument.preview_image ? (
                    <div className="border rounded-md overflow-hidden bg-muted/30">
                      <img
                        src={tncDocument.preview_image}
                        alt="Document preview"
                        className="w-full h-auto max-h-96 object-contain"
                        data-testid="img-tnc-document-preview"
                      />
                    </div>
                  ) : null} */}
                  {termsConditionsRecord?.data && termsConditionsRecord.filetype ? (
                    <object
                      aria-label="terms-conditions-document"
                      data={base64ToBlobUrl(termsConditionsRecord.data, termsConditionsRecord.filetype)}
                      width="100%"
                      height="500"
                    />
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No terms &amp; conditions document uploaded!
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-2 border rounded-md bg-muted/50">
                    <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {tncDocument.filename}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Uploaded document
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <input
                    type="file"
                    ref={tncFileInputRef}
                    onChange={handleTncFileSelect}
                    accept=".pdf"
                    className="hidden"
                    data-testid="input-tnc-document"
                  />
                  {selectedTncFile ? (
                    <div className="space-y-3">
                      {selectedTncFile.type === "application/pdf" && (
                        <div className="border rounded-md overflow-hidden bg-muted/30 h-[400px]">
                          <object
                            data={URL.createObjectURL(selectedTncFile)}
                            type="application/pdf"
                            className="w-full h-full"
                          >
                            <p>Unable to display PDF preview.</p>
                          </object>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 p-2 border rounded-md">
                        <div className="flex items-center gap-2 overflow-hidden">
                          <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                          <span className="text-sm truncate">
                            {selectedTncFile.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 flex-shrink-0"
                            onClick={() => setSelectedTncFile(null)}
                            data-testid="button-clear-tnc-file"
                            disabled={createTncMutation.isPending || updateTncMutation.isPending || uploadTncDocumentMutation.isPending}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => tncFileInputRef.current?.click()}
                      data-testid="button-select-tnc-document"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Select Document
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Accepted formats: PDF
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              {editingTnc && tncDocument && (
                <Button
                  variant="destructive"
                  onClick={() => deleteTncDocumentMutation.mutate(editingTnc.id)}
                  disabled={deleteTncDocumentMutation.isPending}
                  data-testid="button-delete-tnc-document-footer"
                >
                  {deleteTncDocumentMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1.5" />
                  )}
                  Delete Document
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setShowTncSheet(false)}
                disabled={
                  createTncMutation.isPending || updateTncMutation.isPending || uploadTncDocumentMutation.isPending
                }
                data-testid="button-cancel-tnc"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTnc}
                disabled={
                  createTncMutation.isPending || updateTncMutation.isPending || uploadTncDocumentMutation.isPending
                }
                data-testid="button-save-tnc"
              >
                {(createTncMutation.isPending ||
                  updateTncMutation.isPending ||
                  uploadTncDocumentMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  )}
                {editingTnc ? "Update" : "Add"}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Terms & Conditions Confirmation Dialog */}
      <AlertDialog
        open={deleteTncId !== null}
        onOpenChange={(open) => !open && setDeleteTncId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Terms & Conditions</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this terms & conditions entry?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-tnc">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteTncId && deleteTncMutation.mutate(deleteTncId)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-tnc"
            >
              {deleteTncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
