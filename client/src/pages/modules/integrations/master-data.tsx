import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, UseMutationResult, useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Database,
  Eye, EyeOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search, Server,
  Trash2,
  XCircle,
  Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, UseFormReturn } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";

const ERP_TYPES = [
  { value: "sap_s4hana_cloud", label: "SAP S/4HANA Cloud", description: "OData V2/V4 REST APIs", group: "SAP" },
  { value: "sap_s4hana_onprem", label: "SAP S/4HANA On-Premise", description: "OData / RFC / BAPI", group: "SAP" },
  { value: "sap_ecc", label: "SAP ECC 6.0", description: "RFC / BAPI / IDoc", group: "SAP" },
  { value: "sap_b1", label: "SAP Business One", description: "Service Layer REST API", group: "SAP" },
  { value: "sap_byd", label: "SAP Business ByDesign", description: "OData APIs", group: "SAP" },
  { value: "oracle_fusion", label: "Oracle ERP Cloud (Fusion)", description: "REST / SOAP APIs", group: "Oracle" },
  { value: "oracle_ebs", label: "Oracle E-Business Suite R12", description: "PL/SQL / REST Gateway", group: "Oracle" },
  { value: "oracle_jde", label: "Oracle JD Edwards", description: "REST APIs / Business Services", group: "Oracle" },
  { value: "oracle_peoplesoft", label: "Oracle PeopleSoft", description: "Component Interface / REST", group: "Oracle" },
  { value: "d365_fo", label: "Dynamics 365 Finance & Operations", description: "OData / Data Entities", group: "Microsoft" },
  { value: "d365_bc", label: "Dynamics 365 Business Central", description: "OData v4 / REST APIs", group: "Microsoft" },
  { value: "d365_gp", label: "Dynamics GP (Great Plains)", description: "eConnect / Web Services", group: "Microsoft" },
  { value: "d365_nav", label: "Dynamics NAV", description: "OData / SOAP Web Services", group: "Microsoft" },
  { value: "d365_ax", label: "Dynamics AX 2012", description: "AIF / WCF Services", group: "Microsoft" },
];

const AUTH_TYPES = [
  { value: "basic", label: "Basic Auth (Username/Password)" },
  { value: "oauth2", label: "OAuth 2.0 (Client Credentials)" },
  { value: "api_key", label: "API Key" },
  { value: "certificate", label: "X.509 Certificate" },
  { value: "ntlm", label: "Windows Auth (NTLM)" },
];

interface ErpConfig {
  defaultAuth: string;
  apiUrlPlaceholder: string;
  apiUrlHint: string;
  resourceUrlPlaceholder?: string;
  extraFields: { key: string; label: string; placeholder: string }[];
  authOptions: string[];
}

const ERP_CONFIG: Record<string, ErpConfig> = {
  sap_s4hana_cloud: {
    defaultAuth: "oauth2",
    apiUrlPlaceholder: "https://<tenant>.s4hana.cloud.sap/sap/opu/odata/sap/",
    apiUrlHint: "SAP S/4HANA Cloud OData endpoint",
    extraFields: [
      { key: "sap_client", label: "SAP Client", placeholder: "e.g., 100" },
      { key: "sap_language", label: "Language", placeholder: "e.g., EN" },
    ],
    authOptions: ["oauth2", "basic", "certificate"],
  },
  sap_s4hana_onprem: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:<port>/sap/opu/odata/sap/",
    apiUrlHint: "SAP Gateway OData service URL",
    extraFields: [
      { key: "sap_client", label: "SAP Client", placeholder: "e.g., 100" },
      { key: "sap_system_id", label: "System ID (SID)", placeholder: "e.g., PRD" },
      { key: "sap_instance", label: "Instance Number", placeholder: "e.g., 00" },
      { key: "sap_language", label: "Language", placeholder: "e.g., EN" },
    ],
    authOptions: ["basic", "certificate"],
  },
  sap_ecc: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:<port>/sap/bc/srt/rfc/",
    apiUrlHint: "SAP ECC RFC/BAPI gateway URL",
    extraFields: [
      { key: "sap_client", label: "SAP Client", placeholder: "e.g., 800" },
      { key: "sap_system_id", label: "System ID (SID)", placeholder: "e.g., ECP" },
      { key: "sap_instance", label: "Instance Number", placeholder: "e.g., 00" },
      { key: "sap_language", label: "Language", placeholder: "e.g., EN" },
    ],
    authOptions: ["basic", "certificate"],
  },
  sap_b1: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:50000/b1s/v1/",
    apiUrlHint: "SAP Business One Service Layer URL",
    extraFields: [
      { key: "sap_company_db", label: "Company Database", placeholder: "e.g., SBODemoUS" },
    ],
    authOptions: ["basic"],
  },
  sap_byd: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<tenant>.sapbydesign.com/sap/byd/odata/v1/",
    apiUrlHint: "SAP ByDesign OData endpoint",
    extraFields: [],
    authOptions: ["basic", "oauth2", "certificate"],
  },
  oracle_fusion: {
    defaultAuth: "oauth2",
    apiUrlPlaceholder: "https://<host>.fa.us2.oraclecloud.com/fscmRestApi/resources/",
    apiUrlHint: "Oracle Fusion REST API base URL",
    resourceUrlPlaceholder: "https://<host>.fa.us2.oraclecloud.com",
    extraFields: [
      { key: "oracle_instance", label: "Instance Name", placeholder: "e.g., ecog-prod" },
    ],
    authOptions: ["oauth2", "basic"],
  },
  oracle_ebs: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:<port>/webservices/rest/",
    apiUrlHint: "Oracle EBS Integrated SOA Gateway URL",
    extraFields: [
      { key: "oracle_responsibility", label: "Responsibility", placeholder: "e.g., PURCHASING_SUPER_USER" },
      { key: "oracle_org_id", label: "Organization ID", placeholder: "e.g., 204" },
    ],
    authOptions: ["basic"],
  },
  oracle_jde: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:<port>/jderest/v3/",
    apiUrlHint: "JD Edwards REST API base URL (AIS Server)",
    extraFields: [
      { key: "oracle_environment", label: "Environment", placeholder: "e.g., JPS920" },
      { key: "oracle_role", label: "Role", placeholder: "e.g., *ALL" },
    ],
    authOptions: ["basic", "oauth2"],
  },
  oracle_peoplesoft: {
    defaultAuth: "basic",
    apiUrlPlaceholder: "https://<host>:<port>/PSIGW/RESTListeningConnector/",
    apiUrlHint: "PeopleSoft Integration Gateway URL",
    extraFields: [
      { key: "oracle_node_name", label: "Node Name", placeholder: "e.g., PSFT_HR" },
    ],
    authOptions: ["basic", "oauth2"],
  },
  d365_fo: {
    defaultAuth: "oauth2",
    apiUrlPlaceholder: "https://<tenant>.operations.dynamics.com/data/",
    apiUrlHint: "D365 F&O Data Entities OData endpoint",
    resourceUrlPlaceholder: "https://<tenant>.operations.dynamics.com",
    extraFields: [
      { key: "d365_legal_entity", label: "Legal Entity", placeholder: "e.g., USMF" },
    ],
    authOptions: ["oauth2"],
  },
  d365_bc: {
    defaultAuth: "oauth2",
    apiUrlPlaceholder: "https://api.businesscentral.dynamics.com/v2.0/<tenant>/<environment>/api/v2.0/",
    apiUrlHint: "Business Central API endpoint",
    extraFields: [
      { key: "d365_company_id", label: "Company ID", placeholder: "UUID of the company" },
      { key: "d365_environment", label: "Environment", placeholder: "e.g., Production" },
    ],
    authOptions: ["oauth2", "basic"],
  },
  d365_gp: {
    defaultAuth: "ntlm",
    apiUrlPlaceholder: "https://<host>:<port>/GPService/",
    apiUrlHint: "Dynamics GP Web Services URL",
    extraFields: [
      { key: "d365_company_name", label: "Company Name", placeholder: "e.g., Fabrikam, Inc." },
    ],
    authOptions: ["ntlm", "basic"],
  },
  d365_nav: {
    defaultAuth: "ntlm",
    apiUrlPlaceholder: "https://<host>:<port>/<instance>/ODataV4/",
    apiUrlHint: "Dynamics NAV OData endpoint",
    extraFields: [
      { key: "d365_nav_instance", label: "Service Instance", placeholder: "e.g., DynamicsNAV" },
      { key: "d365_company_name", label: "Company Name", placeholder: "e.g., CRONUS" },
    ],
    authOptions: ["ntlm", "basic"],
  },
  d365_ax: {
    defaultAuth: "ntlm",
    apiUrlPlaceholder: "https://<host>:<port>/MicrosoftDynamicsAXAif60/",
    apiUrlHint: "AX 2012 AIF Service endpoint",
    extraFields: [
      { key: "d365_company_name", label: "Company Name", placeholder: "e.g., DAT" },
      { key: "d365_partition", label: "Partition Key", placeholder: "e.g., initial" },
    ],
    authOptions: ["ntlm", "basic", "certificate"],
  },
};

const erpConnectionSchema = z.object({
  erp_type: z.string().min(1, "ERP type is required"),
  erp_name: z.string().min(1, "Connection name is required"),
  api_url: z.string().url("Must be a valid URL").or(z.literal("")),
  resource_url: z.string().optional(),
  auth_type: z.string().min(1, "Auth type is required"),
  username: z.string().optional(),
  password: z.string().optional(),
  client_id: z.string().optional(),
  client_secret: z.string().optional(),
  tenant_id: z.string().optional(),
  scope: z.string().optional(),
  extra_fields: z.record(z.string()).optional(),
});

type ErpConnectionForm = z.infer<typeof erpConnectionSchema>;

interface MasterDataEntity {
  id: number;
  business_entity: string;
  description: string;
  status: string;
  last_execution_date: string | null;
  target_table: string | null;
  field_mappings: Record<string, string> | null;
  erp_endpoint: string | null;
  last_modified_by: string | null;
  last_modified_date: string | null;
}

function formatEntityName(businessEntity: string) {
  return businessEntity
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bMigration\b/gi, "")
    .replace(/\bDtls\b/gi, "Details")
    .replace(/\bMst\b/gi, "Master")
    .trim();
}

interface ErpConnection {
  erp_type: string;
  erp_name: string;
  api_url: string;
  resource_url: string;
  auth_type: string;
  username: string;
  client_id: string;
  tenant_id: string;
  scope: string;
  status: string;
  last_tested_at: string | null;
  test_result: string | null;
  extra_fields: Record<string, string> | null;
}

function getStatusBadge(status: string) {
  switch (status?.toLowerCase()) {
    case "syncing":
      return <Badge variant="outline" className="gap-1 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800 no-default-active-elevate"><Loader2 className="h-3 w-3 animate-spin" />Syncing</Badge>;
    case "executed":
      return <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 no-default-active-elevate"><CheckCircle2 className="h-3 w-3" />Executed</Badge>;
    case "failed":
      return <Badge variant="outline" className="gap-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800 no-default-active-elevate"><XCircle className="h-3 w-3" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="gap-1 text-muted-foreground no-default-active-elevate"><Clock className="h-3 w-3" />{status || "Pending"}</Badge>;
  }
}

function getConnectionStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge variant="outline" className="gap-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800"><CheckCircle2 className="h-3 w-3" />Connected</Badge>;
    case "failed":
      return <Badge variant="outline" className="gap-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"><XCircle className="h-3 w-3" />Failed</Badge>;
    default:
      return <Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />Inactive</Badge>;
  }
}

function getErpLabel(type: string) {
  return ERP_TYPES.find(e => e.value === type)?.label || type;
}

interface ConnectionInlineFormProps {
  existingConnection: ErpConnection | null;
  form: UseFormReturn<ErpConnectionForm>;
  watchAuthType: string;
  showPasswords: Record<string, boolean>;
  setShowPasswords: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  saveConnectionMutation: UseMutationResult<any, Error, ErpConnectionForm>;
  testConnectionMutation: UseMutationResult<any, Error, void>;
  testPreSaveMutation: UseMutationResult<any, Error, ErpConnectionForm>;
  deleteConnectionMutation: UseMutationResult<void, Error, void>;
}

function ConnectionInlineForm({
  existingConnection, form, watchAuthType, showPasswords, setShowPasswords,
  saveConnectionMutation, testConnectionMutation, testPreSaveMutation, deleteConnectionMutation,
}: ConnectionInlineFormProps) {
  const [isEditing, setIsEditing] = useState(!existingConnection);
  const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string>>({});
  const [testPreSaveResult, setTestPreSaveResult] = useState<{ status: string; testResult: string; responseTime?: number } | null>(null);
  const watchErpType = form.watch("erp_type");
  const erpConfig = watchErpType ? ERP_CONFIG[watchErpType] : null;

  useEffect(() => {
    if (existingConnection) {
      form.reset({
        erp_type: existingConnection.erp_type,
        erp_name: existingConnection.erp_name,
        api_url: existingConnection.api_url || "",
        resource_url: existingConnection.resource_url || "",
        auth_type: existingConnection.auth_type || "basic",
        username: existingConnection.username || "",
        password: "",
        client_id: existingConnection.client_id || "",
        client_secret: "",
        tenant_id: existingConnection.tenant_id || "",
        scope: existingConnection.scope || "",
        extra_fields: existingConnection.extra_fields || {},
      });
      setExtraFieldValues(existingConnection.extra_fields || {});
      setIsEditing(false);
    } else {
      form.reset({
        erp_type: "", erp_name: "", api_url: "", resource_url: "",
        auth_type: "basic", username: "", password: "",
        client_id: "", client_secret: "", tenant_id: "", scope: "",
        extra_fields: {},
      });
      setExtraFieldValues({});
      setIsEditing(true);
    }
  }, [existingConnection]);

  useEffect(() => {
    if (!watchErpType || !erpConfig) return;
    if (existingConnection && existingConnection.erp_type === watchErpType) return;
    form.setValue("auth_type", erpConfig.defaultAuth);
    const newExtras: Record<string, string> = {};
    erpConfig.extraFields.forEach(f => { newExtras[f.key] = ""; });
    setExtraFieldValues(newExtras);
    form.setValue("extra_fields", newExtras);
  }, [watchErpType]);

  const updateExtraField = (key: string, value: string) => {
    setExtraFieldValues(prev => {
      const updated = { ...prev, [key]: value };
      form.setValue("extra_fields", updated);
      return updated;
    });
  };

  const availableAuthTypes = erpConfig
    ? AUTH_TYPES.filter(a => erpConfig.authOptions.includes(a.value))
    : AUTH_TYPES;

  if (existingConnection && !isEditing) {
    const connConfig = ERP_CONFIG[existingConnection.erp_type];
    return (
      <Card>
        <div className="p-3 border-b">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Server className="h-3.5 w-3.5" />
              ERP Connection
            </h3>
            <div className="flex items-center gap-2">
              {getConnectionStatusBadge(existingConnection.status)}
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => testConnectionMutation.mutate()}
                disabled={testConnectionMutation.isPending}
                data-testid="button-test-connection"
              >
                {testConnectionMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Test Connection
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setIsEditing(true)} data-testid="button-edit-connection">
                Edit
              </Button>
              <Button size="sm" variant="outline" className="gap-1.5 text-destructive" onClick={() => deleteConnectionMutation.mutate()} data-testid="button-delete-connection">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">ERP System</p>
              <p className="text-sm font-medium" data-testid="text-erp-type">{getErpLabel(existingConnection.erp_type)}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Connection Name</p>
              <p className="text-sm font-medium" data-testid="text-erp-name">{existingConnection.erp_name}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">API URL</p>
              <p className="text-sm font-medium font-mono text-xs break-all" data-testid="text-api-url">{existingConnection.api_url || "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Resource URL</p>
              <p className="text-sm font-medium font-mono text-xs break-all" data-testid="text-resource-url">{existingConnection.resource_url || "—"}</p>
            </div>
            <div className="space-y-0.5">
              <p className="text-xs text-muted-foreground">Authentication</p>
              <p className="text-sm font-medium" data-testid="text-auth-type">{AUTH_TYPES.find(a => a.value === existingConnection.auth_type)?.label || existingConnection.auth_type}</p>
            </div>
            {existingConnection.last_tested_at && (
              <div className="space-y-0.5">
                <p className="text-xs text-muted-foreground">Last Tested</p>
                <p className="text-sm font-medium">{formatDate(existingConnection.last_tested_at)}</p>
              </div>
            )}
            {connConfig && connConfig.extraFields.length > 0 && existingConnection.extra_fields && (
              <>
                {connConfig.extraFields.map(ef => {
                  const val = existingConnection.extra_fields?.[ef.key];
                  if (!val) return null;
                  return (
                    <div key={ef.key} className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">{ef.label}</p>
                      <p className="text-sm font-medium">{val}</p>
                    </div>
                  );
                })}
              </>
            )}
            {existingConnection.test_result && (
              <div className="space-y-0.5 md:col-span-2">
                <p className="text-xs text-muted-foreground">Test Result</p>
                <p className="text-sm text-muted-foreground italic">{existingConnection.test_result}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-3 border-b">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" />
            {existingConnection ? "Edit ERP Connection" : "Configure ERP Connection"}
          </h3>
          {erpConfig && (
            <p className="text-xs text-muted-foreground">{erpConfig.apiUrlHint}</p>
          )}
        </div>
      </div>
      <CardContent className="p-4">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => {
            saveConnectionMutation.mutate(data, {
              onSuccess: () => setIsEditing(false),
            });
          })} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField control={form.control} name="erp_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>ERP System</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-erp-type">
                        <SelectValue placeholder="Select ERP system" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {["SAP", "Oracle", "Microsoft"].map(group => (
                        <SelectGroup key={group}>
                          <SelectLabel>{group}</SelectLabel>
                          {ERP_TYPES.filter(e => e.group === group).map(e => (
                            <SelectItem key={e.value} value={e.value}>
                              <span>{e.label}</span>
                              <span className="ml-1.5 text-xs text-muted-foreground">({e.description})</span>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="erp_name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Connection Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., SAP Production" {...field} data-testid="input-erp-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="api_url" render={({ field }) => (
                <FormItem>
                  <FormLabel>API URL</FormLabel>
                  <FormControl>
                    <Input placeholder={erpConfig?.apiUrlPlaceholder || "https://..."} {...field} data-testid="input-api-url" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              {erpConfig?.resourceUrlPlaceholder && (
                <FormField control={form.control} name="resource_url" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource URL</FormLabel>
                    <FormControl>
                      <Input placeholder={erpConfig.resourceUrlPlaceholder} {...field} data-testid="input-resource-url" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              <FormField control={form.control} name="auth_type" render={({ field }) => (
                <FormItem>
                  <FormLabel>Authentication</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-auth-type">
                        <SelectValue placeholder="Select auth type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableAuthTypes.map(a => (
                        <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            {(watchAuthType === "basic" || watchAuthType === "api_key" || watchAuthType === "ntlm") && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="username" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchAuthType === "api_key" ? "API Key Name" : watchAuthType === "ntlm" ? "Domain\\Username" : "Username"}</FormLabel>
                    <FormControl>
                      <Input placeholder={watchAuthType === "ntlm" ? "e.g., DOMAIN\\user" : ""} {...field} data-testid="input-username" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="password" render={({ field }) => (
                  <FormItem>
                    <FormLabel>{watchAuthType === "api_key" ? "API Key Value" : "Password"}</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPasswords["password"] ? "text" : "password"}
                          placeholder={existingConnection ? "Leave blank to keep existing" : ""}
                          className="pr-9"
                          {...field}
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPasswords(p => ({ ...p, password: !p.password }))}
                        >
                          {showPasswords["password"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {watchAuthType === "oauth2" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField control={form.control} name="client_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client ID</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-client-id" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="client_secret" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Client Secret</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input
                          type={showPasswords["secret"] ? "text" : "password"}
                          placeholder={existingConnection ? "Leave blank to keep existing" : ""}
                          className="pr-9"
                          {...field}
                          data-testid="input-client-secret"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPasswords(p => ({ ...p, secret: !p.secret }))}
                        >
                          {showPasswords["secret"] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="tenant_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tenant ID</FormLabel>
                    <FormControl>
                      <Input placeholder={watchErpType?.startsWith("d365") ? "Azure AD Tenant ID" : "OAuth Token Endpoint Tenant"} {...field} data-testid="input-tenant-id" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="scope" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Scope</FormLabel>
                    <FormControl>
                      <Input placeholder={watchErpType?.startsWith("d365") ? "e.g., https://dynamics.com/.default" : "e.g., openid"} {...field} data-testid="input-scope" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            )}

            {erpConfig && erpConfig.extraFields.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">
                  {ERP_TYPES.find(e => e.value === watchErpType)?.group || "ERP"}-Specific Settings
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {erpConfig.extraFields.map(ef => (
                    <div key={ef.key}>
                      <label className="text-sm font-medium">{ef.label}</label>
                      <Input
                        value={extraFieldValues[ef.key] || ""}
                        onChange={(e) => updateExtraField(ef.key, e.target.value)}
                        placeholder={ef.placeholder}
                        className="mt-1.5"
                        data-testid={`input-${ef.key}`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {testPreSaveResult && (
              <div className={`flex items-center gap-2 p-2.5 rounded-md text-sm ${
                testPreSaveResult.status === "active"
                  ? "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              }`} data-testid="text-presave-test-result">
                {testPreSaveResult.status === "active" ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 shrink-0" />
                )}
                <span>{testPreSaveResult.testResult}</span>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={testPreSaveMutation.isPending}
                onClick={() => {
                  const values = form.getValues();
                  const valid = form.trigger();
                  valid.then((isValid) => {
                    if (!isValid) return;
                    setTestPreSaveResult(null);
                    testPreSaveMutation.mutate(values, {
                      onSuccess: (result) => setTestPreSaveResult(result),
                    });
                  });
                }}
                data-testid="button-test-before-save"
              >
                {testPreSaveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Zap className="h-3.5 w-3.5" />
                )}
                Test Connection
              </Button>
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={testPreSaveMutation.isPending || saveConnectionMutation.isPending}
                onClick={() => {
                  const values = form.getValues();
                  const valid = form.trigger();
                  valid.then((isValid) => {
                    if (!isValid) return;
                    setTestPreSaveResult(null);
                    testPreSaveMutation.mutate(values, {
                      onSuccess: (result) => {
                        setTestPreSaveResult(result);
                        if (result.status === "active") {
                          saveConnectionMutation.mutate(values, {
                            onSuccess: () => {
                              setTestPreSaveResult(null);
                              setIsEditing(false);
                            },
                          });
                        }
                      },
                    });
                  });
                }}
                data-testid="button-test-and-save"
              >
                {(testPreSaveMutation.isPending || saveConnectionMutation.isPending) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                )}
                Test & Save
              </Button>
              <Button type="submit" size="sm" variant="outline" className="gap-1.5" disabled={saveConnectionMutation.isPending} data-testid="button-save-connection">
                {saveConnectionMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {existingConnection ? "Save Only" : "Save Without Testing"}
              </Button>
              {existingConnection && (
                <Button type="button" size="sm" variant="ghost" onClick={() => {
                  form.reset({
                    erp_type: existingConnection.erp_type,
                    erp_name: existingConnection.erp_name,
                    api_url: existingConnection.api_url || "",
                    resource_url: existingConnection.resource_url || "",
                    auth_type: existingConnection.auth_type || "basic",
                    username: existingConnection.username || "",
                    password: "",
                    client_id: existingConnection.client_id || "",
                    client_secret: "",
                    tenant_id: existingConnection.tenant_id || "",
                    scope: existingConnection.scope || "",
                    extra_fields: existingConnection.extra_fields || {},
                  });
                  setExtraFieldValues(existingConnection.extra_fields || {});
                  setTestPreSaveResult(null);
                  setIsEditing(false);
                }}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

export default function ManageMasterData() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("entities");
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();
  const [deleteTarget, setDeleteTarget] = useState<ErpConnection | null>(null);
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [editEntity, setEditEntity] = useState<MasterDataEntity | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editTargetTable, setEditTargetTable] = useState("");
  const [editErpEndpoint, setEditErpEndpoint] = useState("");
  const [addEntityOpen, setAddEntityOpen] = useState(false);
  const [newEntityKey, setNewEntityKey] = useState("");
  const [newEntityDescription, setNewEntityDescription] = useState("");
  const [newEntityTargetTable, setNewEntityTargetTable] = useState("");

  const { data: entities, isLoading: loadingEntities } = useQuery<MasterDataEntity[]>({
    queryKey: ["/api/admin/masterdata-entities"],
  });

  const { data: connection, isLoading: loadingConnections } = useQuery<ErpConnection | null>({
    queryKey: ["/api/admin/erp-connection"],
  });

  const form = useForm<ErpConnectionForm>({
    resolver: zodResolver(erpConnectionSchema),
    defaultValues: {
      erp_type: "", erp_name: "", api_url: "", resource_url: "",
      auth_type: "basic", username: "", password: "",
      client_id: "", client_secret: "", tenant_id: "", scope: "",
    },
  });

  const watchAuthType = form.watch("auth_type");

  const saveConnectionMutation = useMutation({
    mutationFn: async (data: ErpConnectionForm) => {
      const res = await apiRequest("PUT", "/api/admin/erp-connection", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/erp-connection"] });
      toast({ title: connection ? "Connection Updated" : "Connection Created" });
    },
    onError: () => toast({ title: "Failed to save connection", variant: "destructive" }),
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/admin/erp-connection");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/erp-connection"] });
      toast({ title: "Connection Deleted" });
      setDeleteTarget(null);
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const testConnectionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/erp-connection/test");
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/erp-connection"] });
      toast({
        title: result.status === "active" ? "Connection Successful" : "Connection Failed",
        description: result.testResult,
        variant: result.status === "active" ? "default" : "destructive",
      });
    },
    onError: () => toast({ title: "Test Failed", variant: "destructive" }),
  });

  const testPreSaveMutation = useMutation({
    mutationFn: async (data: ErpConnectionForm) => {
      const res = await apiRequest("POST", "/api/admin/erp-connection/test-presave", {
        api_url: data.api_url,
        auth_type: data.auth_type,
        username: data.username,
        password: data.password,
        client_id: data.client_id,
        client_secret: data.client_secret,
        tenant_id: data.tenant_id,
        scope: data.scope,
      });
      return res.json();
    },
    onError: () => toast({ title: "Test Failed", description: "Could not reach server", variant: "destructive" }),
  });

  const updateEntityMutation = useMutation({
    mutationFn: async ({ businessEntity, data }: { businessEntity: string; data: { description?: string; target_table?: string; erp_endpoint?: string } }) => {
      const res = await apiRequest("PUT", `/api/admin/entity-configs/${businessEntity}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Entity Updated" });
      setEditEntity(null);
    },
    onError: () => toast({ title: "Failed to update entity", variant: "destructive" }),
  });

  const syncEntityMutation = useMutation({
    mutationFn: async (businessEntity: string) => {
      const res = await apiRequest("POST", `/api/admin/entity-configs/${businessEntity}/sync`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Sync Initiated", description: result.message });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      }, 5000);
    },
    onError: (error: any) => {
      const msg = error?.message || "Failed to sync entity";
      toast({ title: "Sync Failed", description: msg, variant: "destructive" });
    },
  });

  const createEntityMutation = useMutation({
    mutationFn: async (data: { business_entity: string; description?: string; target_table?: string; erp_endpoint?: string }) => {
      const res = await apiRequest("POST", "/api/admin/masterdata-entities", data);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/masterdata-entities"] });
      toast({ title: "Entity Created", description: `${result.business_entity} has been added` });
      setAddEntityOpen(false);
      setNewEntityKey("");
      setNewEntityDescription("");
      setNewEntityTargetTable("");
    },
    onError: (error: any) => {
      let desc = "An error occurred";
      try {
        const msg = error?.message || "";
        const jsonPart = msg.substring(msg.indexOf("{"));
        const parsed = JSON.parse(jsonPart);
        desc = parsed.error || parsed.message || desc;
      } catch { desc = error?.message || desc; }
      toast({ title: "Failed to create entity", description: desc, variant: "destructive" });
    },
  });

  const handleCreateEntity = () => {
    if (!newEntityKey.trim()) return;
    createEntityMutation.mutate({
      business_entity: newEntityKey.trim(),
      description: newEntityDescription.trim() || undefined,
      target_table: newEntityTargetTable.trim() || undefined,
    });
  };

  const openEditSheet = (entity: MasterDataEntity, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditEntity(entity);
    setEditDescription(entity.description || "");
    setEditTargetTable(entity.target_table || "");
    setEditErpEndpoint(entity.erp_endpoint || "");
  };

  const handleSaveEntity = () => {
    if (!editEntity) return;
    updateEntityMutation.mutate({
      businessEntity: editEntity.business_entity,
      data: {
        description: editDescription,
        target_table: editTargetTable,
        erp_endpoint: editErpEndpoint,
      },
    });
  };

  const filteredEntities = entities?.filter(e => {
    const matchesSearch = !search ||
      e.business_entity.toLowerCase().includes(search.toLowerCase()) ||
      formatEntityName(e.business_entity).toLowerCase().includes(search.toLowerCase()) ||
      e.description?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  }) || [];

  const totalCount = entities?.length || 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2 text-primary" data-testid="text-page-title">
            <Database className="h-5 w-5 text-primary" />
            Manage Master Data
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configure ERP connections, map entity fields, and sync master data
          </p>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => setAddEntityOpen(true)} data-testid="button-add-entity">
          <Plus className="h-4 w-4" />
          Add Entity
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="entities" className="gap-1.5" data-testid="tab-entities">
            <Database className="h-3.5 w-3.5" />
            Entity Mappings ({totalCount})
          </TabsTrigger>
          <TabsTrigger value="connections" className="gap-1.5" data-testid="tab-connections">
            <Link2 className="h-3.5 w-3.5" />
            ERP Connection
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entities" className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs no-default-active-elevate gap-1">
              {totalCount} entities
            </Badge>
          </div>

          <Card>
            <div className="p-3 border-b">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search entities..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-8"
                    data-testid="input-search-entities"
                  />
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              {loadingEntities ? (
                <div className="p-3 space-y-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              ) : filteredEntities.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Database className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No entities found</p>
                  <p className="text-xs mt-1">Try adjusting your search</p>
                </div>
              ) : (
                <>
                  <div className="overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-9 py-2 text-xs font-medium max-w-[260px]">
                            <span className="flex items-center gap-1.5">
                              <Database className="h-3.5 w-3.5" />
                              Entity
                            </span>
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium max-w-[280px]">
                            Description
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                            Status
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[160px]">
                            Last Executed
                          </TableHead>
                          <TableHead className="h-9 py-2 text-xs font-medium w-[120px] text-right">
                            Actions
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredEntities.map((entity) => (
                          <TableRow
                            key={entity.business_entity}
                            className="cursor-pointer hover-elevate"
                            onClick={() => setLocation(`/app/master-data/config/${entity.business_entity}`)}
                            data-testid={`row-entity-${entity.business_entity}`}
                          >
                            <TableCell className="py-1.5 max-w-[260px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate text-sm font-medium">{formatEntityName(entity.business_entity)}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start">
                                  <p>{formatEntityName(entity.business_entity)}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5 max-w-[280px]">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="block truncate text-sm text-muted-foreground">{entity.description || "—"}</span>
                                </TooltipTrigger>
                                <TooltipContent side="top" align="start">
                                  <p>{entity.description || "—"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5">
                              {getStatusBadge(entity.status)}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <span className="text-xs text-muted-foreground">
                                {formatDate(entity.last_execution_date)}
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      onClick={(e) => openEditSheet(entity, e)}
                                      data-testid={`button-edit-${entity.business_entity}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Entity</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      disabled={entity.status === "Syncing" || syncEntityMutation.isPending}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        syncEntityMutation.mutate(entity.business_entity);
                                      }}
                                      data-testid={`button-sync-${entity.business_entity}`}
                                    >
                                      <RefreshCw className={`h-3.5 w-3.5 ${entity.status === "Syncing" ? "animate-spin" : ""}`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Sync Entity</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <span className="text-xs text-muted-foreground" data-testid="text-entity-count">
                      Showing {filteredEntities.length} of {totalCount} entities
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections" className="mt-4">
          {loadingConnections ? (
            <Card>
              <CardContent className="p-4 space-y-3">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </CardContent>
            </Card>
          ) : (
            <ConnectionInlineForm
              existingConnection={connection || null}
              form={form}
              watchAuthType={watchAuthType}
              showPasswords={showPasswords}
              setShowPasswords={setShowPasswords}
              saveConnectionMutation={saveConnectionMutation}
              testConnectionMutation={testConnectionMutation}
              testPreSaveMutation={testPreSaveMutation}
              deleteConnectionMutation={deleteConnectionMutation}
            />
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Connection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this ERP connection? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground"
              onClick={() => deleteTarget && deleteConnectionMutation.mutate()}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <FormSheet
        open={!!editEntity}
        onOpenChange={(open) => !open && setEditEntity(null)}
        title="Edit Entity"
        description={editEntity ? formatEntityName(editEntity.business_entity) : ""}
        onSubmit={handleSaveEntity}
        submitLabel="Save Changes"
        isSubmitting={updateEntityMutation.isPending}
        submitDisabled={updateEntityMutation.isPending}
        widthClassName="sm:max-w-md"
      >
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit-entity-key" className="text-xs text-muted-foreground">Entity Key</Label>
              <Input
                id="edit-entity-key"
                value={editEntity?.business_entity || ""}
                disabled
                className="text-sm bg-muted"
                data-testid="input-edit-entity-key"
              />
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Enter entity description"
                className="text-sm resize-none"
                rows={2}
                data-testid="input-edit-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-target-table">Target Table</Label>
              <Input
                id="edit-target-table"
                value={editTargetTable}
                onChange={(e) => setEditTargetTable(e.target.value)}
                placeholder="e.g., dbo.table_name"
                className="text-sm"
                data-testid="input-edit-target-table"
              />
              <p className="text-xs text-muted-foreground">The database table this entity maps to</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-erp-endpoint">ERP Endpoint</Label>
              <Input
                id="edit-erp-endpoint"
                value={editErpEndpoint}
                onChange={(e) => setEditErpEndpoint(e.target.value)}
                placeholder="e.g., /api/v1/vendors"
                className="text-sm"
                data-testid="input-edit-erp-endpoint"
              />
              <p className="text-xs text-muted-foreground">The ERP API endpoint for syncing data</p>
            </div>
          </div>
      </FormSheet>

      <FormSheet
        open={addEntityOpen}
        onOpenChange={setAddEntityOpen}
        title="Add New Entity"
        description="Create a new master data entity configuration for ERP integration"
        onSubmit={handleCreateEntity}
        submitLabel="Create Entity"
        isSubmitting={createEntityMutation.isPending}
        submitDisabled={!newEntityKey.trim() || createEntityMutation.isPending}
        onCancel={() => {
          setAddEntityOpen(false);
          setNewEntityKey("");
          setNewEntityDescription("");
          setNewEntityTargetTable("");
        }}
        widthClassName="sm:max-w-md"
      >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="new-entity-key">Entity Key <span className="text-destructive">*</span></Label>
              <Input
                id="new-entity-key"
                value={newEntityKey}
                onChange={(e) => setNewEntityKey(e.target.value.toUpperCase().replace(/\s+/g, '_'))}
                placeholder="e.g., ITEM_CATEGORY_MASTER"
                className="text-sm font-mono"
                data-testid="input-new-entity-key"
              />
              <p className="text-xs text-muted-foreground">Unique identifier for this entity (auto-formatted to UPPER_SNAKE_CASE)</p>
            </div>
            <Separator />
            <div className="space-y-1.5">
              <Label htmlFor="new-description">Description</Label>
              <Textarea
                id="new-description"
                value={newEntityDescription}
                onChange={(e) => setNewEntityDescription(e.target.value)}
                placeholder="e.g., Import Item Category Master Data"
                className="text-sm resize-none"
                rows={2}
                data-testid="input-new-description"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-target-table">Target Table</Label>
              <Input
                id="new-target-table"
                value={newEntityTargetTable}
                onChange={(e) => setNewEntityTargetTable(e.target.value)}
                placeholder="e.g., dbo.am_item_category_mst"
                className="text-sm font-mono"
                data-testid="input-new-target-table"
              />
              <p className="text-xs text-muted-foreground">The database table this entity will sync data into</p>
            </div>
            <div className="rounded-md bg-muted p-3 space-y-1">
              <p className="text-xs text-muted-foreground">Sync Mode: Standard (can be changed later)</p>
              <p className="text-xs text-muted-foreground">ERP Endpoint and field mappings can be configured during implementation</p>
            </div>
          </div>
      </FormSheet>
    </div>
  );
}
