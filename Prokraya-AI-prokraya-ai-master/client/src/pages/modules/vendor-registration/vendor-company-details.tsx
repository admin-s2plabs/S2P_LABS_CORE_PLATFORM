import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  getPhoneValidationMessage,
  hasPhoneDigits,
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
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  ChevronDown,
  ChevronUp,
  Info,
  Loader2,
  Save,
} from "lucide-react";
import { useVendorRegistrationDraftOptional } from "@/pages/modules/vendor-registration/vendor-registration-draft-context";
import { companyFieldHighlightClass } from "@/pages/modules/vendor-registration/vendor-registration-field-states";
import { MANDATORY_COMPANY_KEYS } from "@/pages/modules/vendor-registration/registration-mandatory";
import { isLikelyGlobalPrimaryTaxId } from "@shared/vendor-registration-field-validation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useSearch } from "wouter";
import { z } from "zod";

const companyDetailsSchema = z.object({
  address_1: z
    .string()
    .min(1, "Address Line 1 is required")
    .max(250, "Max 250 characters"),
  address_2: z
    .string()
    .max(250, "Max 250 characters")
    .optional()
    .or(z.literal("")),
  city: z
    .string()
    .min(1, "City is required")
    .max(200, "Max 200 characters")
    .regex(/^[a-zA-Z0-9\s\-\.]*$/, "City should not contain special characters"),
  state: z
    .string()
    .min(1, "State is required")
    .max(200, "Max 200 characters")
    .regex(/^[a-zA-Z0-9\s\-\.]*$/, "State should not contain special characters"),
  country: z
    .string()
    .min(1, "Country is required")
    .max(150, "Max 150 characters"),
  postalcode: z
    .string()
    .min(1, "Zip/Postal Code is required")
    .max(355, "Max 355 characters")
    .regex(/^[a-zA-Z0-9\s\-]*$/, "Zip/Postal Code should not contain special characters"),
  phone: z
    .string()
    .min(1, "Contact Number is required")
    .superRefine((v, ctx) => {
      if (!validatePhoneNumber(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: getPhoneValidationMessage(v) });
      }
    }),
  email_id: z
    .string()
    .email("Valid email is required")
    .max(200, "Max 200 characters"),
  web_address: z
    .string()
    .max(350, "Max 350 characters")
    .optional()
    .or(z.literal("")),
  legal_entity_type: z
    .string()
    .min(1, "Type of Legal Entity is required")
    .max(355, "Max 355 characters"),
  type_of_company: z
    .string()
    .max(355, "Max 355 characters")
    .optional()
    .or(z.literal("")),
  pan_no: z
    .string()
    .min(1, "PAN No is required")
    .length(10, "PAN must be exactly 10 characters")
    .transform((val) => val.toUpperCase())
    .superRefine((val, ctx) => {
      if (!isLikelyGlobalPrimaryTaxId(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Enter a valid primary tax identifier for your jurisdiction (e.g. PAN, EIN, UTR, TRN, BN, UEN)",
        });
      }
    }),
  start_date: z
    .string()
    .min(1, "Incorporation Date is required")
    .refine(
      (v) => !v || new Date(v) <= new Date(),
      "Incorporation Date cannot be a future date"
    ),
  license_no: z
    .string()
    .min(1, "License Number is required")
    .max(130, "Max 130 characters")
    .regex(/^[a-zA-Z0-9\s\-\/]*$/, "License Number should not contain special characters"),
  expiry_date: z
    .string()
    .min(1, "Licence Expiry Date is required")
    .refine(
      (v) => !v || new Date(v) > new Date(),
      "Licence Expiry Date must be a future date"
    ),
  place_of_issue: z
    .string()
    .min(1, "Licence Place of Issue is required")
    .max(355, "Max 355 characters")
    .regex(/^[a-zA-Z0-9\s\-\.]*$/, "Place of Issue should not contain special characters"),
  workingday_start: z
    .string()
    .min(1, "Work Week From is required")
    .max(115, "Max 115 characters"),
  workingday_end: z
    .string()
    .min(1, "Work Week To is required")
    .max(115, "Max 115 characters"),
  annual_turn_over: z.string().min(1, "Annual Turn Over is required"),
  turn_over_currency: z
    .string()
    .min(1, "Turn Over Currency is required")
    .max(355, "Max 355 characters"),
  working_time_start_time: z
    .string()
    .min(1, "Open Time is required")
    .max(355, "Max 355 characters"),
  working_time_end_time: z
    .string()
    .min(1, "Close Time is required")
    .max(355, "Max 355 characters"),
  tax_reg_no: z
    .string()
    .min(1, "GST/VAT Registration No is required")
    .max(200, "Max 200 characters")
    .regex(/^[a-zA-Z0-9\s\-]*$/, "GST/VAT Registration No should not contain special characters"),
  payment_terms: z
    .string()
    .min(1, "Payment Terms is required")
    .max(200, "Max 200 characters"),
  tax_payer_id: z
    .string()
    .min(8, "TIN must be between 8 and 11 characters")
    .max(11, "TIN must be between 8 and 11 characters")
    .regex(/^[A-Za-z0-9]+$/, "Only letters and numbers are allowed")
    .transform((val) => val.toUpperCase()),
  tax_effective_date: z.string().min(1, "Effective From date is required"),
  parent_company_name: z
    .string()
    .max(140, "Max 140 characters")
    .optional()
    .or(z.literal("")),
  parent_company_addr: z
    .string()
    .max(355, "Max 355 characters")
    .optional()
    .or(z.literal("")),
  prnt_cmpy_phone: z
    .string()
    .optional()
    .superRefine((v, ctx) => {
      // For optional phone number fields, only validate if there are actual digits typed
      if (v && hasPhoneDigits(v) && !validatePhoneNumber(v)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: getPhoneValidationMessage(v) });
      }
    }),
  url: z.string().max(400, "Max 400 characters").optional().or(z.literal("")),
});

type CompanyDetailsFormData = z.infer<typeof companyDetailsSchema>;

const EMPTY_COMPANY_DETAILS: CompanyDetailsFormData = {
  address_1: "",
  address_2: "",
  city: "",
  state: "",
  country: "",
  postalcode: "",
  phone: "",
  email_id: "",
  web_address: "",
  legal_entity_type: "",
  type_of_company: "",
  pan_no: "",
  start_date: "",
  license_no: "",
  expiry_date: "",
  place_of_issue: "",
  workingday_start: "",
  workingday_end: "",
  annual_turn_over: "",
  turn_over_currency: "",
  working_time_start_time: "",
  working_time_end_time: "",
  tax_reg_no: "",
  payment_terms: "",
  tax_payer_id: "",
  tax_effective_date: "",
  parent_company_name: "",
  parent_company_addr: "",
  prnt_cmpy_phone: "",
  url: "",
};

function profileToCompanyFormData(profile: any): CompanyDetailsFormData {
  return {
    address_1: profile.address_1 || "",
    address_2: profile.address_2 || "",
    city: profile.city || "",
    state: profile.state || "",
    country: profile.country || "",
    postalcode: profile.postalcode || "",
    phone: profile.phone || "",
    email_id: profile.email_id || "",
    web_address: profile.web_address || "",
    legal_entity_type: profile.legal_entity_type || "",
    type_of_company: profile.type_of_company || "",
    pan_no: profile.pan_no || "",
    start_date: profile.start_date
      ? new Date(profile.start_date).toISOString().split("T")[0]
      : "",
    license_no: profile.license_no || "",
    expiry_date: profile.expiry_date
      ? new Date(profile.expiry_date).toISOString().split("T")[0]
      : "",
    place_of_issue: profile.place_of_issue || "",
    workingday_start: profile.workingday_start || "",
    workingday_end: profile.workingday_end || "",
    annual_turn_over: profile.annual_turn_over?.toString() || "",
    turn_over_currency: profile.turn_over_currency || "",
    working_time_start_time: profile.working_time_start_time || "",
    working_time_end_time: profile.working_time_end_time || "",
    tax_reg_no: profile.tax_reg_no || "",
    payment_terms: profile.payment_terms_id ? String(profile.payment_terms_id) : "",
    tax_payer_id: profile.tax_payer_id || "",
    tax_effective_date: profile.tax_effective_date
      ? new Date(profile.tax_effective_date).toISOString().split("T")[0]
      : "",
    parent_company_name: profile.parent_company_name || "",
    parent_company_addr: profile.parent_company_addr || "",
    prnt_cmpy_phone: profile.prnt_cmpy_phone || "",
    url: profile.url || "",
  };
}

interface LookupItem {
  value: string;
  label: string;
}

export default function VendorCompanyDetails() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const isVendorRegistrationWizard = location.startsWith("/vendor/register");
  const [orgOpen, setOrgOpen] = useState(true);
  const [bizOpen, setBizOpen] = useState(true);
  const [taxOpen, setTaxOpen] = useState(true);
  const [parentOpen, setParentOpen] = useState(true);

  const storedAuthStr = localStorage.getItem("prokraya-auth");
  const parsedAuth = storedAuthStr ? JSON.parse(storedAuthStr) : null;
  const vendorStatus = parsedAuth?.vendorStatus;
  const { data: profile, isLoading: profileLoading } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
  });
  const isEditMode =
    profile?.status &&
    ["Approved", "Active", "InActive", "Changes In Draft", "More Info Required", "More Information Required"].includes(
      profile?.status,
    );

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/bank-accounts"] });
    queryClient.invalidateQueries({
      queryKey: ["/api/vendor/scope-of-supply"],
    });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
  }, []);

  const { data: countries } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "countries"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/countries");
      if (!res.ok) return [];
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    }))
  });

  const { data: legalEntities } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "legal-entities"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/lookups/legal-entities");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: currencies } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "currencies"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/lookups/currencies");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: paymentTerms } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "payment-terms"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/lookups/payment-terms");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: workingDays } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "working-days"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/lookups/working-days");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: workingTimes } = useQuery<LookupItem[]>({
    queryKey: ["/api/vendor/lookups", "working-times"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/vendor/lookups/working-times");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const draftCtx = useVendorRegistrationDraftOptional();
  const urlSearch = useSearch();

  const mergedFormValues = useMemo((): CompanyDetailsFormData | undefined => {
    const dco = draftCtx?.draft?.company;
    if (!profile && (!dco || Object.keys(dco).length === 0)) return undefined;
    const base: CompanyDetailsFormData = profile
      ? profileToCompanyFormData(profile)
      : { ...EMPTY_COMPANY_DETAILS };
    if (dco) {
      for (const [k, v] of Object.entries(dco)) {
        if (!(k in base)) continue;
        if (v === undefined || v === null) continue;
        // Explicit empty Address Line 1 must win over profile when AI cleared a bogus city-as-street value.
        if (k === "address_1" && String(v).trim() === "") {
          (base as Record<string, string>).address_1 = "";
          continue;
        }
        if (String(v).trim() !== "") {
          (base as Record<string, string>)[k] = String(v);
        }
      }
    }
    return base;
  }, [profile, draftCtx?.draft?.company]);

  useEffect(() => {
    const q = new URLSearchParams(urlSearch);
    if (q.get("source") === "ai-draft") {
      draftCtx?.setHighlightFromAi(true);
    }
  }, [urlSearch, draftCtx]);

  const form = useForm<CompanyDetailsFormData>({
    resolver: zodResolver(companyDetailsSchema),
    mode: "onTouched",
    defaultValues: EMPTY_COMPANY_DETAILS,
  });

  const lookupsReady = !!(
    countries &&
    legalEntities &&
    currencies &&
    paymentTerms &&
    workingDays &&
    workingTimes
  );
  const formHydratedRef = useRef(false);
  const isSelectHydratingRef = useRef(false);

  // Merge profile + session draft without using RHF `values:` (which realigns the whole form
  // whenever draft updates and drops in-progress edits). keepDirtyValues preserves manual input.
  useEffect(() => {
    if (mergedFormValues === undefined || !lookupsReady) return;
    const isInitialHydration = !formHydratedRef.current;
    isSelectHydratingRef.current = true;
    form.reset(mergedFormValues, { keepDirtyValues: !isInitialHydration });
    formHydratedRef.current = true;
    queueMicrotask(() => {
      isSelectHydratingRef.current = false;
    });
  }, [mergedFormValues, lookupsReady, form]);

  useEffect(() => {
    formHydratedRef.current = false;
  }, [profile?.id]);

  const watched = form.watch();
  const highlightActive = !!(draftCtx?.highlightFromAi && draftCtx?.draft);
  const ring = useCallback(
    (key: keyof CompanyDetailsFormData) =>
      cn(
        companyFieldHighlightClass(
          draftCtx?.draft ?? null,
          key as string,
          highlightActive,
          MANDATORY_COMPANY_KEYS.includes(key as string) &&
            !String(watched[key] ?? "").trim(),
          String(watched[key] ?? "").trim() !== "",
        ),
      ),
    [draftCtx?.draft, draftCtx?.highlightFromAi, watched],
  );

  const onFormBlur = useCallback(
    (ev: React.FocusEvent<HTMLFormElement>) => {
      if (!draftCtx?.setCompanyField) return;
      const t = ev.target as HTMLElement;
      if (t.tagName !== "INPUT" && t.tagName !== "TEXTAREA") return;
      const name = (t as HTMLInputElement).name;
      if (!name) return;
      if (!(name in EMPTY_COMPANY_DETAILS)) return;
      const key = name as keyof CompanyDetailsFormData;
      draftCtx.setCompanyField(name, String(form.getValues(key) ?? ""));
    },
    [draftCtx, form],
  );

  /** Radix Select does not use INPUT blur; keep session draft in sync when dropdowns change. */
  const onCompanySelectChange = useCallback(
    (
      fieldName: keyof CompanyDetailsFormData,
      fieldOnChange: (value: string) => void,
    ) =>
      (value: string) => {
        if (isSelectHydratingRef.current) return;
        fieldOnChange(value);
        if (!value.trim()) return;
        draftCtx?.setCompanyField(fieldName, value);
      },
    [draftCtx],
  );

  function flushCompanyFormToDraft(data: CompanyDetailsFormData) {
    if (!draftCtx?.setCompanyField) return;
    (Object.keys(EMPTY_COMPANY_DETAILS) as Array<keyof CompanyDetailsFormData>).forEach(
      (key) => {
        draftCtx.setCompanyField(key, String(data[key] ?? ""));
      },
    );
  }

  const saveMutation = useMutation({
    mutationFn: async (data: CompanyDetailsFormData) => {
      const response = await apiRequest(
        "PATCH",
        "/api/vendor/profile/company-details",
        data,
      );
      return response.json();
    },
    onSuccess: (result: any) => {
      if (result.supplierId) {
        const storedAuth = localStorage.getItem("prokraya-auth");
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          parsed.supplierId = String(result.supplierId);
          if (!isEditMode) {
            parsed.vendorStatus = "Draft";
          } else if (
            vendorStatus === "More Info Required" ||
            vendorStatus === "More Information Required"
          ) {
            parsed.vendorStatus = vendorStatus;
          } else {
            parsed.vendorStatus = "Changes In Draft";
          }
          localStorage.setItem("prokraya-auth", JSON.stringify(parsed));
        }
      }
      toast({
        title: "Saved",
        description: isEditMode
          ? "Changes saved. Submit for approval when ready."
          : "Company details saved successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/bank-accounts"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/vendor/scope-of-supply"],
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/documents"] });
      // Keep session AI draft in sync with manual form — do not clear company draft here.
      // Draft is cleared on successful registration submit or via AI "Start over".
      const suppId = profile?.id || result.supplierId || parsedAuth?.supplierId;
      if (isEditMode && suppId) {
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        if (isVendorRegistrationWizard) {
          setLocation("/vendor/register/contacts");
        } else {
          setLocation(`/app/vendors/${suppId}`);
        }
      } else {
        setLocation("/vendor/register/contacts");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save",
        variant: "destructive",
      });
    },
  });

  const initializeCountryRef = useRef(false);

  useEffect(() => {
    if (!initializeCountryRef.current && countries && countries.length > 0 && profile?.country) {
      initializeCountryRef.current = true;
      form.setValue("country", profile.country);
    }
  }, [countries, profile, form]);

  const onSubmit = (data: CompanyDetailsFormData) => {
    flushCompanyFormToDraft(data);
    saveMutation.mutate(data);
  };

  if (profileLoading || !lookupsReady) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const companyName = profile?.company_name || "Vendor";

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2
            className="text-base font-semibold tracking-tight"
            data-testid="text-company-welcome"
          >
            {companyName}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          {isEditMode ? (
            <>
              Update your organization details below. Changes will be submitted
              for review.{" "}
              <span className="text-xs text-destructive">
                * Required fields
              </span>
            </>
          ) : (
            <>
              Complete your organization details to create your supplier
              profile.{" "}
              <span className="text-xs text-destructive">
                * Required fields
              </span>
            </>
          )}
        </p>
      </div>

      <Form {...form}>
        <form
          id="vendor-company-form"
          onSubmit={form.handleSubmit(onSubmit)}
          onBlur={onFormBlur}
          className="space-y-4"
        >
          {highlightActive && (
            <div className="rounded-md border border-amber-500/35 bg-amber-500/[0.06] p-3 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Review before submit: </span>
              <span className="font-semibold text-amber-950/80 dark:text-amber-100/90">Amber</span> highlighted fields
              contain AI-filled values that require your confirmation.{" "}
              <span className="font-semibold text-destructive">Red</span> fields are required and still missing.
            </div>
          )}
          <CollapsibleSection
            title="Organization Details"
            open={orgOpen}
            onToggle={() => setOrgOpen(!orgOpen)}
            icon={<Info className="h-4 w-4 text-muted-foreground" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="address_1"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Address Line 1 <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-address-1" maxLength={250} />
                    </FormControl>
                    {field.value?.length === 250 && (
                      <p className="text-sm text-destructive">
                        Maximum 250 characters
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address_2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-address-2" maxLength={250} />
                    </FormControl>
                    {field.value?.length === 250 && (
                      <p className="text-sm text-destructive">
                        Maximum 250 characters
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      City <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-city" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      State <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-state" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Country <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("country", field.onChange)}
                      value={field.value}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-country">
                          <SelectValue placeholder="Select Country" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(countries || []).map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="postalcode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Zip / Postal Code{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-postalcode" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Company Contact Number{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <PhoneInput
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="50 123 4567"
                        data-testid="input-phone"
                        disabled
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Company Email ID{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="email"
                        {...field}
                        data-testid="input-email"
                        disabled
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="web_address"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Website URL</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="url"
                        {...field}
                        placeholder="https://"
                        data-testid="input-website"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Business Details"
            open={bizOpen}
            onToggle={() => setBizOpen(!bizOpen)}
            icon={<Info className="h-4 w-4 text-muted-foreground" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="legal_entity_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Type of Legal Entity{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("legal_entity_type", field.onChange)}
                      value={field.value}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-legal-entity">
                          <SelectValue placeholder="Select Legal Entity" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(legalEntities || []).map((e) => (
                          <SelectItem key={e.value} value={e.value}>
                            {e.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pan_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      PAN No (Company){" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-pan" maxLength={10}
                        onChange={(e) => {
                          let value = e.target.value?.toUpperCase();
                          value = value?.replace(/[^a-zA-Z0-9]/g, "");
                          field.onChange(value);
                        }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="start_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Incorporation Date{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="date"
                        {...field}
                        max={new Date().toISOString().split("T")[0]}
                        data-testid="input-incorporation-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="license_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      License Number <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-license-number"
                        onChange={(e) => {
                          let value = e.target.value?.toUpperCase();
                          value = value?.replace(/[^a-zA-Z0-9]/g, "");
                          field.onChange(value);
                        }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="expiry_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Licence Expiry Date{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="date"
                        {...field}
                        min={new Date(Date.now() + 86400000).toISOString().split("T")[0]}
                        data-testid="input-license-expiry"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="place_of_issue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Licence Place of Issue{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-place-of-issue" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workingday_start"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Work Week From <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("workingday_start", field.onChange)}
                      value={field.value || undefined}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-workweek-from">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(workingDays || []).map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="workingday_end"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Work Week To <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("workingday_end", field.onChange)}
                      value={field.value || undefined}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-workweek-to">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(workingDays || []).map((d) => (
                          <SelectItem key={d.value} value={d.value}>
                            {d.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="annual_turn_over"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Annual Turn Over{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="number"
                        {...field}
                        data-testid="input-annual-turnover"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="turn_over_currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Turn Over Currency <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("turn_over_currency", field.onChange)}
                      value={field.value || undefined}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-turnover-currency">
                          <SelectValue placeholder="Select..." />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(currencies || []).map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="working_time_start_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Open Time <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange(
                        "working_time_start_time",
                        field.onChange,
                      )}
                      value={field.value || undefined}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-open-time">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(workingTimes || []).map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="working_time_end_time"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Close Time <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange(
                        "working_time_end_time",
                        field.onChange,
                      )}
                      value={field.value || undefined}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-close-time">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(workingTimes || []).map((t) => (
                          <SelectItem key={t.value} value={t.value}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Tax Details"
            open={taxOpen}
            onToggle={() => setTaxOpen(!taxOpen)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="tax_reg_no"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      GST/VAT Registration No{" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-tax-reg"
                        onChange={(e) => {
                          let value = e.target.value;
                          value = value.replace(/[^a-zA-Z0-9]/g, "");
                          value = value.toUpperCase();
                          field.onChange(value);
                        }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="payment_terms"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Payment Terms <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select
                      onValueChange={onCompanySelectChange("payment_terms", field.onChange)}
                      value={field.value || ""}
                    >
                      <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                        <SelectTrigger data-testid="select-payment-terms">
                          <SelectValue placeholder="Select Payment Terms" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(paymentTerms || []).map((p) => (
                          <SelectItem key={p.value} value={p.value}>
                            {p.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_payer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Tax Identification No (TIN){" "}
                      <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-tin" maxLength={11}
                        onChange={(e) => {
                          let value = e.target.value?.toUpperCase();
                          value = value?.replace(/[^a-zA-Z0-9]/g, "");
                          field.onChange(value);
                        }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="tax_effective_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Effective From <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="date"
                        {...field}
                        data-testid="input-tax-effective-date"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title="Parent Company Details"
            subtitle="(Optional)"
            open={parentOpen}
            onToggle={() => setParentOpen(!parentOpen)}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="parent_company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        {...field}
                        data-testid="input-parent-company-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="parent_company_addr"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Beneficiary Address Line 1</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input {...field} data-testid="input-parent-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="prnt_cmpy_phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <PhoneInput
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="50 123 4567"
                        data-testid="input-parent-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL</FormLabel>
                    <FormControl className={ring(field.name as keyof CompanyDetailsFormData)}>
                      <Input
                        type="url"
                        {...field}
                        placeholder="https://"
                        data-testid="input-parent-url"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CollapsibleSection>

          {isEditMode && (profile?.attribute_4 === "Active" || !isVendorRegistrationWizard) && (
            <div className="flex items-center justify-between gap-3 pt-4 border-t sticky bottom-0 bg-background pb-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  const suppId = profile?.id || parsedAuth?.supplierId;
                  setLocation(
                    suppId ? `/app/vendors/${suppId}` : "/app/dashboard",
                  );
                }}
                data-testid="button-cancel-edit"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="button-save-changes"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-1" />
                )}
                Save Changes
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}

function CollapsibleSection({
  title,
  subtitle,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Collapsible open={open} onOpenChange={onToggle}>
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover-elevate rounded-t-md"
            data-testid={`toggle-section-${title.toLowerCase().replace(/\s+/g, "-")}`}
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">{title}</h3>
              {subtitle && (
                <span className="text-sm text-muted-foreground italic">
                  {subtitle}
                </span>
              )}
              {icon}
            </div>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 px-4 pb-4">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
