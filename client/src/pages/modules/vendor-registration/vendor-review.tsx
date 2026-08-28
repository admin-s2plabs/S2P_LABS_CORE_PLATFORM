import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDate, handleDownloadDocument } from "@/lib/common-functions";
import { useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  ChevronDown, ChevronRight,
  Download,
  Eye,
  File, FileImage,
  FileText,
  Landmark,
  Mail, Phone,
  User,
  Users
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";


const documentTypes = [
  { value: "tradelicense", label: "Trade License" },
  { value: "commercemembership", label: "Chamber of Commerce Membership" },
  { value: "vatcertificate", label: "VAT Certificate" },
  { value: "companyprofile", label: "Company Profile" },
  { value: "memorandum", label: "Memorandum of Association" },
  { value: "listofemployees", label: "List of Employees" },
  { value: "attroney", label: "Power of Attorney" },
  { value: "employeeliability", label: "Employee Liability Certificate" },
  { value: "insurancecert", label: "Insurance Certificate" },
  { value: "bankguarantee", label: "Bank Guarantee Letter" },
  { value: "isoqualification", label: "ISO Qualification Certificate" },
  { value: "BANK_DOCUMENT", label: "Bank Document" },
  { value: "other", label: "Other" },
];

function getDocTypeLabel(value: string) {
  return documentTypes.find(t => t.value === value)?.label || value;
}

export default function VendorReview() {
  const [, setLocation] = useLocation();
  const [previewDoc, setPreviewDoc] = useState<any>(null);
  const [expandedBankId, setExpandedBankId] = useState<number | null>(null);
  const { data: summary, isLoading } = useQuery<any>({
    queryKey: ["/api/vendor/registration-summary"],
  });

  const { data: countries } = useQuery<any[]>({
    queryKey: ["/api/countries"],
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
  const formatCountry = (code?: string | null) => {
    if (!code) return null;
    const country = countries?.find((c: any) => c.value === code);
    return country ? `${country.label} (${code})` : code;
  };

  const { data: directDocuments } = useQuery<any[]>({
    queryKey: ["/api/vendor/documents"],
  });

  const profile = summary?.profile || {};
  useEffect(() => {
    if (!isLoading && profile?.status === "Active" && profile?.attribute_4 !== "Active") {
      setLocation("/app/dashboard");
    }
  }, [isLoading, profile?.status, profile?.attribute_4]);

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Card><CardContent className="p-4 space-y-4"><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /><Skeleton className="h-4 w-1/2" /></CardContent></Card>
        <div className="grid gap-4 lg:grid-cols-2"><Card><CardContent className="p-4"><Skeleton className="h-32" /></CardContent></Card><Card><CardContent className="p-4"><Skeleton className="h-32" /></CardContent></Card></div>
      </div>
    );
  }

  const contacts = summary?.contacts || [];
  const bankAccounts = summary?.bankAccounts || [];
  const scopeOfSupply = summary?.scopeOfSupply || [];
  const allDocuments = directDocuments || summary?.documents || [];

  const isBankDocType = (docType: string) => {
    const dt = (docType || "").toLowerCase().replace(/[\s_]/g, "");
    return ["bankdocument", "bankletter", "cancelledcheque"].includes(dt);
  };

  const generalDocuments = allDocuments.filter((d: any) => !isBankDocType(d.doc_type));
  const bankDocuments = allDocuments.filter((d: any) => isBankDocType(d.doc_type));
  const references = summary?.references || [];

  const sections = [
    { complete: !!(profile.address_1 && profile.city && profile.country) },
    { complete: contacts.length > 0 },
    { complete: scopeOfSupply.length > 0 || !!profile.type_of_service },
    { complete: bankAccounts.length > 0 },
    { complete: allDocuments.length > 0 },
  ];
  const completedCount = sections.filter(s => s.complete).length;
  const allComplete = completedCount >= 3;

  const primaryContact = contacts.find((c: any) => c.is_primary === 'Yes' || c.is_primary === 'Y');

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <h1 className="text-base font-semibold tracking-tight" data-testid="text-review-title">
          {profile.company_name || "Review Profile"}
        </h1>
        <Badge variant="secondary" className="text-xs" data-testid="badge-status">{profile.status || "Draft"}</Badge>
      </div>

      <Card data-testid="card-company-info">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Company Information</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Company Name</p>
                  <p className="text-sm font-medium" data-testid="text-vendor-company-name">{profile.company_name || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Phone</p>
                  <p className="text-sm" data-testid="text-vendor-phone">{profile.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                  <p className="text-sm truncate" data-testid="text-vendor-email">{profile.email_id || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Website</p>
                  <p className="text-sm truncate" data-testid="text-vendor-website">{profile.web_address || '-'}</p>
                </div>
              </div>

              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Address</p>
                {(() => {
                  const fullAddress = [
                    profile.address_1,
                    profile.address_2,
                    profile.city,
                    profile.state,
                    profile.country,
                    profile.postalcode,
                  ]
                    .filter(Boolean)
                    .join(", ");

                  if (!fullAddress || fullAddress === "-") return <p className="text-sm">-</p>;

                  const displayAddress = fullAddress.length > 100
                    ? fullAddress.substring(0, 100) + "..."
                    : fullAddress;

                  return (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p
                            className="text-sm cursor-help"
                            data-testid="text-vendor-address"
                          >
                            {displayAddress}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-md">
                          <p className="text-xs">{fullAddress}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })()}
              </div>
            </div>

            <Separator orientation="vertical" className="hidden lg:block h-auto self-stretch" />
            <Separator className="lg:hidden" />

            <div className="lg:w-64 shrink-0 space-y-3">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Primary Contact</h3>
              </div>

              {!primaryContact ? (
                <div className="text-center py-4" data-testid="empty-primary-contact">
                  <User className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No primary contact</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold text-sm">
                        {primaryContact.contact_name?.charAt(0).toUpperCase() || 'C'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate" data-testid="text-primary-contact-name">{primaryContact.contact_name}</p>
                      <p className="text-xs text-muted-foreground truncate" data-testid="text-primary-contact-role">
                        {[primaryContact.contact_category, primaryContact.designation, primaryContact.department].filter(Boolean).join(', ') || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Email</p>
                      <p className="truncate" data-testid="text-primary-contact-email">{primaryContact.email || '-'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Mobile</p>
                      <p data-testid="text-primary-contact-phone">
                        {primaryContact.mobile || '-'}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {(primaryContact.is_primary === 'Y' || primaryContact.is_primary === 'Yes') && (
                      <Badge className="bg-primary text-primary-foreground text-[10px]" data-testid="badge-primary-contact">Primary</Badge>
                    )}
                    {(primaryContact.is_auth_signatory === 'Y' || primaryContact.is_auth_signatory === 'Yes') && (
                      <Badge variant="outline" className="text-[10px]" data-testid="badge-auth-signatory">Auth Signatory</Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-testid="card-business-details">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Business Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">License Number</p>
                <p className="text-sm font-mono" data-testid="text-license-number">{profile.license_no || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Place of Issue</p>
                <p className="text-sm" data-testid="text-place-of-issue">{profile.place_of_issue || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Business Expiry Date</p>
                <p className="text-sm" data-testid="text-business-expiry-date">{formatDate(profile.expiry_date)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Legal Entity Type</p>
                <p className="text-sm font-medium" data-testid="text-legal-entity-type">{profile.legal_entity_type || profile.type_of_company || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">PAN No (Company)</p>
                <p className="text-sm font-mono" data-testid="text-pan-no">{profile.pan_no || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Incorporation Date</p>
                <p className="text-sm font-medium" data-testid="text-incorporation-date">{profile.bus_trading_date ? formatDate(profile.bus_trading_date) : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Annual Turn Over</p>
                <p className="text-sm font-medium" data-testid="text-annual-revenue">{profile.annual_turn_over ? `${profile.turn_over_currency || ''} ${profile.annual_turn_over}` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Transaction Currency</p>
                <p className="text-sm" data-testid="text-transaction-currency">{profile.turnOverCurrency || '-'}</p>
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Working Days</p>
                <p className="text-sm" data-testid="text-working-days">{profile.workingday_start && profile.workingday_end ? `${profile.workingday_start} - ${profile.workingday_end}` : '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Working Hours</p>
                <p className="text-sm" data-testid="text-working-hours">{profile.working_time_start_time && profile.working_time_end_time ? `${profile.working_time_start_time} - ${profile.working_time_end_time}` : '-'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-tax-details">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Landmark className="h-4 w-4" />
              Tax Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">GST/VAT Registration No</p>
                <p className="text-sm font-mono" data-testid="text-tax-reg-no">{profile.tax_reg_no || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Payment Terms</p>
                <p className="text-sm font-medium" data-testid="text-payment-terms">{profile.payment_terms || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tax Identification No (TIN)</p>
                <p className="text-sm font-mono" data-testid="text-tax-payer-id">{profile.tax_payer_id || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Tax Effective Date</p>
                <p className="text-sm" data-testid="text-tax-effective-date">
                  {profile.tax_effective_date ? formatDate(profile.tax_effective_date) : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-scope">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Scope of Supply
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0 space-y-3">
            <div className="space-y-2">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Service Experience Details</p>
                <p className="text-sm" data-testid="text-service-experience">{profile.type_of_service || '-'}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Domestic Experience</p>
                  <p className="text-sm" data-testid="text-domestic-experience">
                    {profile.year_of_exp_loc_market ? `${profile.year_of_exp_loc_market} years` : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">International Experience</p>
                  <p className="text-sm" data-testid="text-international-experience">
                    {profile.year_of_exp_international ? `${profile.year_of_exp_international} years` : '-'}
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs text-muted-foreground mb-2">Categories ({scopeOfSupply.length})</p>
              {scopeOfSupply.length === 0 ? (
                <p className="text-sm text-muted-foreground" data-testid="empty-scope">No categories registered</p>
              ) : (
                <div className="space-y-2">
                  {scopeOfSupply.slice(0, 8).map((service: any) => (
                    <div key={service.id} className="flex items-center justify-between text-sm bg-secondary/30 p-2 rounded">
                      <span className="font-medium">
                        {service.good_service_code}
                        {service.category_type && (
                          <span className="text-xs text-muted-foreground ml-1.5 font-normal">
                            ({service.category_type})
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                  {scopeOfSupply.length > 8 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      +{scopeOfSupply.length - 8} more categories
                    </p>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="contacts" className="w-full">
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="contacts" className="text-xs gap-1.5" data-testid="tab-contacts">
            <Users className="h-3.5 w-3.5" />
            Contacts ({contacts.length})
          </TabsTrigger>
          <TabsTrigger value="banking" className="text-xs gap-1.5" data-testid="tab-banking">
            <Landmark className="h-3.5 w-3.5" />
            Banking ({bankAccounts.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs gap-1.5" data-testid="tab-documents">
            <FileText className="h-3.5 w-3.5" />
            Documents ({allDocuments.length})
          </TabsTrigger>
          <TabsTrigger value="references" className="text-xs gap-1.5" data-testid="tab-references">
            <Building2 className="h-3.5 w-3.5" />
            References ({references.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4">
          <Card data-testid="card-contacts">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Users className="h-4 w-4" />
                Contacts ({contacts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {contacts.length === 0 ? (
                <div className="text-center py-6" data-testid="empty-contacts">
                  <Users className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No contacts registered</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {contacts.map((contact: any) => (
                    <Card
                      key={contact.id}
                      className="p-3"
                      data-testid={`contact-card-${contact.id}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                            {contact.contact_name?.charAt(0).toUpperCase() || 'C'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate" data-testid={`text-contact-name-${contact.id}`}>{contact.contact_name}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[contact.contact_category, contact.designation, contact.department].filter(Boolean).join(', ') || '-'}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs">
                          {contact.mobile && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate" data-testid={`text-contact-phone-${contact.id}`}>{contact.mobile}</span>
                            </div>
                          )}
                          {contact.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate" data-testid={`text-contact-email-${contact.id}`}>{contact.email}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {(contact.is_primary === 'Y' || contact.is_primary === 'Yes') && (
                            <Badge className="bg-primary text-primary-foreground text-[10px]" data-testid={`badge-contact-primary-${contact.id}`}>Primary</Badge>
                          )}
                          {(contact.is_auth_signatory === 'Y' || contact.is_auth_signatory === 'Yes') && (
                            <Badge variant="outline" className="text-[10px]" data-testid={`badge-contact-auth-${contact.id}`}>Auth Signatory</Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="references" className="mt-4">
          <Card data-testid="card-references">
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                References ({references.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              {references.length === 0 ? (
                <div className="text-center py-6" data-testid="empty-references">
                  <Building2 className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No references added</p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {references.map((ref: any) => (
                    <Card
                      key={ref.id}
                      className="p-3"
                      data-testid={`reference-card-${ref.id}`}
                    >
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                            {ref.contact_name?.charAt(0).toUpperCase() || 'R'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm truncate" data-testid={`text-ref-name-${ref.id}`}>{ref.contact_name}</p>
                            <p className="text-xs text-muted-foreground truncate">{ref.ref_company_name || '-'}</p>
                          </div>
                        </div>
                        <div className="space-y-1 text-xs">
                          {ref.phone && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="h-3 w-3 shrink-0" />
                              <span className="truncate">{ref.phone}</span>
                            </div>
                          )}
                          {ref.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="h-3 w-3 shrink-0" />
                              <span className="truncate">{ref.email}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="banking" className="mt-4">
          <Card data-testid="card-banking">
            <CardContent className="p-4">
              {bankAccounts.length === 0 ? (
                <div className="text-center py-6" data-testid="empty-banking">
                  <Landmark className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No bank accounts registered</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map((bank: any) => {
                    const isExpanded = expandedBankId === bank.id;
                    const bankDocs = bankDocuments.filter((d: any) =>
                      isBankDocType(d.doc_type) &&
                      Number(d.doc_no) === Number(bank.id)
                    );
                    return (
                      <Card
                        key={bank.id}
                        className="overflow-visible"
                        data-testid={`bank-card-${bank.id}`}
                      >
                        <div
                          className="p-4 cursor-pointer"
                          onClick={() => setExpandedBankId(isExpanded ? null : bank.id)}
                          data-testid={`bank-card-toggle-${bank.id}`}
                        >
                          <div className="flex items-start justify-between gap-4 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted shrink-0">
                                {isExpanded ? <ChevronDown className="h-5 w-5 text-primary" /> : <ChevronRight className="h-5 w-5 text-muted-foreground" />}
                              </div>
                              <div>
                                <p className="font-medium" data-testid={`text-bank-name-${bank.id}`}>{bank.bank_name}</p>
                                <p className="text-sm text-muted-foreground">{bank.branch_name || 'Branch not specified'}</p>
                              </div>
                            </div>
                            {bank.primary_account === 'Y' ? (
                              <Badge className="bg-emerald-500 text-white text-xs" data-testid={`badge-bank-primary-${bank.id}`}>Primary Account</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs" data-testid={`badge-bank-secondary-${bank.id}`}>Secondary</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 text-sm">
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Account Number</p>
                              <p className="font-mono font-medium" data-testid={`text-bank-account-${bank.id}`}>{bank.account_no ? `****${bank.account_no.slice(-4)}` : '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Account Type</p>
                              <p className="font-medium">{bank.bank_account_type || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">Currency</p>
                              <p className="font-medium">{bank.currency || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">SWIFT Code</p>
                              <p className="font-mono font-medium">{bank.swift_code || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">IFSC Code</p>
                              <p className="font-mono font-medium" data-testid={`text-bank-ifsc-${bank.id}`}>{bank.ifsccode || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-0.5">IBAN</p>
                              <p className="font-mono font-medium">{bank.iban_no || '-'}</p>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-4 pb-4 pt-0 border-t">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 text-sm pt-3">
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Beneficiary Name</p>
                                <p className="font-medium">{bank.beneficiary_name || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Beneficiary Address</p>
                                <p className="font-medium">{bank.beneficiary_address || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Bank Address</p>
                                <p className="font-medium">{bank.bank_address || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Country</p>
                                <p className="font-medium">{formatCountry(bank.country) || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">City</p>
                                <p className="font-medium">{bank.city || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">State / Region</p>
                                <p className="font-medium">{bank.region || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Location / Street</p>
                                <p className="font-medium">{bank.street || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">Postal Code</p>
                                <p className="font-medium">{bank.postal_code || '-'}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground mb-0.5">ABA Routing No</p>
                                <p className="font-mono font-medium">{bank.aba_routing || '-'}</p>
                              </div>
                            </div>

                            {bankDocs.length > 0 && (
                              <div className="mt-4 pt-3 border-t">
                                <p className="text-xs font-semibold mb-2">Bank Documents</p>
                                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                                  {bankDocs.map((doc: any) => {
                                    const isPdf = doc.filetype?.toLowerCase().includes('pdf') || doc.filename?.toLowerCase()?.endsWith('.pdf');
                                    const isImage = doc.filetype?.toLowerCase().includes('image') ||
                                      doc.filename?.toLowerCase()?.match(/\.(jpg|jpeg|png|gif|webp)$/);
                                    return (
                                      <Card
                                        key={doc.id}
                                        className="overflow-visible cursor-pointer relative group"
                                        data-testid={`review-bank-doc-card-${doc.id}`}
                                      >
                                        <div className="h-28 bg-muted/50 border-b flex items-center justify-center relative rounded-t-md overflow-hidden">
                                          {doc.doc_uri ? (
                                            <img
                                              src={`data:image/png;base64,${doc.doc_uri}`}
                                              alt="Preview"
                                              className="w-full h-full object-contain p-1"
                                              data-testid={`img-review-bank-doc-${doc.id}`}
                                            />
                                          ) : isImage ? (
                                            <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center">
                                              <FileImage className="h-10 w-10 text-blue-500/70" />
                                            </div>
                                          ) : isPdf ? (
                                            <div className="flex flex-col items-center gap-1">
                                              <FileText className="h-10 w-10 text-red-500/70" />
                                              <span className="text-[10px] text-muted-foreground font-medium">PDF</span>
                                            </div>
                                          ) : (
                                            <div className="flex flex-col items-center gap-1">
                                              <File className="h-10 w-10 text-muted-foreground/50" />
                                              <span className="text-[10px] text-muted-foreground font-medium">
                                                {doc.filetype?.toUpperCase() || 'DOC'}
                                              </span>
                                            </div>
                                          )}
                                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all rounded-t-md">
                                            {doc.doc_uri && (
                                              <Button
                                                size="icon"
                                                variant="secondary"
                                                className="h-8 w-8"
                                                onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                                                title="Preview"
                                                data-testid={`button-preview-review-bank-doc-${doc.id}`}
                                              >
                                                <Eye className="h-4 w-4" />
                                              </Button>
                                            )}
                                            {doc.doc_path && (
                                              <Button
                                                size="icon"
                                                variant="secondary"
                                                className="h-8 w-8"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  handleDownloadDocument(doc, `/api/vendor/documents/${doc.id}/download`)
                                                }}
                                                title="Download"
                                                data-testid={`button-download-review-bank-doc-${doc.id}`}
                                              >
                                                <Download className="h-4 w-4" />
                                              </Button>
                                            )}
                                          </div>
                                        </div>
                                        <div className="p-2.5 space-y-1">
                                          <p className="text-xs font-medium truncate" title={doc.filename || doc.doc_name || ''}>
                                            {doc.filename || doc.doc_name || 'Untitled'}
                                          </p>
                                          <p className="text-[11px] text-muted-foreground font-medium truncate">Bank Document</p>
                                        </div>
                                      </Card>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <Card data-testid="card-documents">
            <CardContent className="p-4">
              {allDocuments.length === 0 ? (
                <div className="text-center py-6" data-testid="empty-documents">
                  <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
                </div>
              ) : (
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                  {allDocuments.map((doc: any) => {
                    const isPdf = doc.filetype?.toLowerCase().includes('pdf') || doc.filename?.toLowerCase()?.endsWith('.pdf');
                    const isImage = doc.filetype?.toLowerCase().includes('image') ||
                      doc.filename?.toLowerCase()?.match(/\.(jpg|jpeg|png|gif|webp)$/);

                    return (
                      <Card
                        key={doc.id}
                        className="overflow-visible cursor-pointer relative group"
                        data-testid={`doc-card-${doc.id}`}
                      >
                        <div className="h-28 bg-muted/50 border-b flex items-center justify-center relative rounded-t-md overflow-hidden">
                          {doc.doc_uri ? (
                            <img
                              src={`data:image/png;base64,${doc.doc_uri}`}
                              alt="Preview"
                              className="w-full h-full object-contain p-1"
                              data-testid={`img-doc-thumb-${doc.id}`}
                            />
                          ) : isImage ? (
                            <div className="absolute inset-0 bg-gradient-to-b from-muted/30 to-muted/60 flex items-center justify-center">
                              <FileImage className="h-10 w-10 text-blue-500/70" />
                            </div>
                          ) : isPdf ? (
                            <div className="flex flex-col items-center gap-1">
                              <FileText className="h-10 w-10 text-red-500/70" />
                              <span className="text-[10px] text-muted-foreground font-medium">PDF</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1">
                              <File className="h-10 w-10 text-muted-foreground/50" />
                              <span className="text-[10px] text-muted-foreground font-medium">
                                {doc.filetype?.toUpperCase() || 'DOC'}
                              </span>
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/50 flex items-center justify-center gap-2 invisible group-hover:visible transition-all rounded-t-md"
                            data-testid={`overlay-doc-${doc.id}`}
                          >
                            {doc.doc_uri && (
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                onClick={(e) => { e.stopPropagation(); setPreviewDoc(doc); }}
                                title="Preview"
                                data-testid={`button-preview-doc-${doc.id}`}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                            {doc.doc_path && (
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDownloadDocument(doc, `/api/vendor/documents/${doc.id}/download`)
                                }}
                                title="Download"
                                data-testid={`button-download-doc-${doc.id}`}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                        <div className="p-2.5 space-y-1">
                          <p
                            className="text-xs font-medium truncate"
                            title={doc.filename || doc.doc_name || ''}
                            data-testid={`text-doc-filename-${doc.id}`}
                          >
                            {doc.filename || doc.doc_name || 'Untitled'}
                          </p>
                          <p
                            className="text-[11px] text-muted-foreground font-medium truncate"
                            data-testid={`text-doc-type-${doc.id}`}
                          >
                            {getDocTypeLabel(doc.doc_type) || doc.category || 'Document'}
                          </p>
                          {doc.expiry_date && (
                            <p className="text-[10px] text-muted-foreground">
                              Expires: {formatDate(doc.expiry_date)}
                            </p>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {!allComplete && (
        <div className="flex items-center justify-center">
          <p className="text-sm text-muted-foreground">Complete at least 3 sections to submit your registration</p>
        </div>
      )}

      <Dialog open={!!previewDoc} onOpenChange={(open) => { if (!open) setPreviewDoc(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-medium flex items-center gap-2 flex-wrap">
              <span>{previewDoc?.filename || previewDoc?.doc_name || 'Document Preview'}</span>
              {previewDoc && (
                <Badge variant="secondary" className="text-[10px]">
                  {getDocTypeLabel(previewDoc.doc_type)}
                </Badge>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center bg-muted/30 rounded-md min-h-[300px]">
            {previewDoc?.doc_uri && (
              <img
                src={`data:image/png;base64,${previewDoc.doc_uri}`}
                alt="Document preview"
                className="max-w-full max-h-[65vh] object-contain"
                data-testid="img-preview-dialog"
              />
            )}
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            {previewDoc?.doc_path && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  if (!previewDoc) return;
                  handleDownloadDocument(previewDoc, `/api/vendor/documents/${previewDoc.id}/download`);
                }}
                data-testid="button-preview-download"
              >
                <Download className="h-3.5 w-3.5 mr-1.5" />
                Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
