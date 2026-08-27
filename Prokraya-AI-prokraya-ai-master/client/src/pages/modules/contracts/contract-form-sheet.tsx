import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent,
  SheetDescription,
  SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ContractFormData {
  title: string;
  description: string;
  owner: string;
  owner_name: string;
  requestor_name: string;
  department: string;
  department_name: string;
  start_date: string;
  end_date: string;
  currency: string;
  project_name: string;
  project_ref_no: string;
  contract_amount: string;
  is_renewable: string;
  template_name: string;
}

interface ContractHeader {
  id: number;
  title: string;
  description: string | null;
  status: string;
  type: string | null;
  version: string | null;
  contr_ref_no: string | null;
  owner: string | null;
  owner_name: string | null;
  requestor: string | null;
  requestor_name: string | null;
  requestor_email: string | null;
  department: string | null;
  department_name: string | null;
  start_date: string | null;
  end_date: string | null;
  currency: string | null;
  contract_amount: string | null;
  is_renewable: string | null;
  project_name: string | null;
  project_ref_no: string | null;
  creation_date: string | null;
  created_by: string | null;
}

const empty: ContractFormData = {
  title: "", description: "", owner: "", owner_name: "",
  requestor_name: "", department: "", department_name: "",
  start_date: "", end_date: "", currency: "USD",
  project_name: "", project_ref_no: "", contract_amount: "", is_renewable: "",
  template_name: "",
};

function toDateInput(val: string | null | undefined): string {
  if (!val) return "";
  return val.slice(0, 10);
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contract?: ContractHeader;
  contractId?: number;
}

export default function ContractFormSheet({ open, onOpenChange, contract, contractId }: Props) {
  const { toast } = useToast();
  const isEdit = !!contract && !!contractId;
  const [form, setForm] = useState<ContractFormData>({ ...empty });
  const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");

  type UserDropdownItem = {
    id: number;
    user_id: string;
    user_name: string;
    name: string;
    email_id: string;
    department_name: string | null;
  };

  const { data: usersData } = useQuery<{ id: number; user_id: string; user_name: string; name: string; email_id: string; department_name: string | null }[]>({
    queryKey: ["/api/users/dropdown"],
  });
  const { data: templatesData } = useQuery<any>({
    queryKey: ["/api/contracts/templates"],
    queryFn: () => apiRequest("GET", "/api/contracts/templates?limit=100").then(r => r.json()),
    enabled: !isEdit,
  });
  const templates: { id: number; template_name: string }[] = templatesData?.records || [];
  const { data: departmentsRaw } = useQuery<{ data: { id: number; code: string; value: string; status: string }[] }>({
    queryKey: ["/api/cost-centers/3/items?limit=100"],
  });
  const { data: currencyOptions = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/vendor/lookups/currencies"],
  });
  const { data: orgCurrencyData } = useQuery<{ currency: string }>({
    queryKey: ["/api/approvers/org-currency"],
  });
  
  const initializeBaseValues = useRef(false);
    
  useEffect(() => {
    if (initializeBaseValues.current) return;
    if (isEdit || !orgDetails?.currency || !currencyOptions.length) return;
    initializeBaseValues.current = true;
    const defaultCurrency = currencyOptions.find(
      (t) => t.value === orgDetails.currency
    );
    if (defaultCurrency) {
      setForm((prev: any) => ({
        ...prev,
        currency: defaultCurrency.value,
      }));
    }
  }, [currencyOptions, orgDetails.currency, isEdit]);

  const users: UserDropdownItem[] = Array.isArray(usersData)
    ? usersData
    : (((usersData as any)?.data ?? []) as UserDropdownItem[]);
  const departmentsData = departmentsRaw?.data?.filter((d: any) => d.status === 'Y') || [];

  const storedAuth = (() => {
    try { return JSON.parse(localStorage.getItem("prokraya-auth") || "{}"); } catch { return {}; }
  })();

  useEffect(() => {
    if (!open) { setForm({ ...empty }); return; }

    if (isEdit && contract) {
      const displayName = storedAuth.userName || "";
      const userNameId = storedAuth.userNameId || storedAuth.userId || storedAuth.userName || storedAuth.email || "";
      setForm({
        title: contract.title || "",
        description: contract.description || "",
        owner: userNameId || contract.owner || "",
        owner_name: displayName || contract.owner_name || "",
        requestor_name: displayName || contract.requestor_name || "",
        department: contract.department || "",
        department_name: contract.department_name || "",
        start_date: toDateInput(contract.start_date),
        end_date: toDateInput(contract.end_date),
        currency: contract.currency || "USD",
        project_name: contract.project_name || "",
        project_ref_no: contract.project_ref_no || "",
        contract_amount: contract.contract_amount || "",
        is_renewable: contract.is_renewable || "",
        template_name: "",
      });
      return;
    }

    const fresh = { ...empty, currency: orgCurrencyData?.currency || "USD" };
    const displayName = storedAuth.userName || "";
    // Backend contract list visibility checks `cm_header.owner` against:
    // - sessionUser.id (numeric user id) OR
    // - sessionUser.userName (login name)
    // So we prefer username, but fall back to userId/email if username is missing.
    const userNameId =
      storedAuth.userNameId || storedAuth.userId || storedAuth.userName || storedAuth.email || "";
    fresh.owner = userNameId;
    fresh.owner_name = displayName;
    fresh.requestor_name = displayName;

    const me = users.find((u: any) =>
      u.email_id?.toLowerCase() === (storedAuth.email || "").toLowerCase() ||
      u.user_name?.toLowerCase() === userNameId.toLowerCase() ||
      String(u.id) === String(storedAuth.userId)
    );
    const deptName = me?.department_name;
    if (deptName) {
      const matchedDept = departmentsData.find(
        (d: any) => d.value?.toLowerCase() === deptName.toLowerCase()
      );
      if (matchedDept) {
        fresh.department = String(matchedDept.id);
        fresh.department_name = matchedDept.value;
      }
    }

    setForm(fresh);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof ContractFormData, v: string) => setForm(f => ({ ...f, [k]: v }));

  const createMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const res = await apiRequest("POST", "/api/contracts", {
        ...data,
        contract_amount: data.contract_amount ? parseFloat(data.contract_amount) : null,
      });
      // Some APIs respond with an empty body or non-JSON payload even on success.
      // Consume the body safely to avoid "Unexpected token ..." JSON parse errors.
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json().catch(() => ({}));
      }
      await res.text().catch(() => "");
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list/stats"] });
      onOpenChange(false);
      toast({ title: "Contract Created", description: "New contract created as Draft." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create contract", variant: "destructive" });
    },
  });

  const editMutation = useMutation({
    mutationFn: async (data: ContractFormData) => {
      const res = await apiRequest("PATCH", `/api/contracts/${contractId}`, {
        ...data,
        contract_amount: data.contract_amount ? parseFloat(data.contract_amount) : null,
      });
      // See createMutation() for why we parse defensively.
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        return res.json().catch(() => ({}));
      }
      await res.text().catch(() => "");
      return {};
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/contracts", String(contractId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracts/list"] });
      onOpenChange(false);
      toast({ title: "Contract Updated", description: "Contract details have been saved." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to update contract", variant: "destructive" });
    },
  });

  const mutation = isEdit ? editMutation : createMutation;

  const handleSubmit = () => {
    if (!form.title.trim()) return toast({ title: "Title is required", variant: "destructive" });
    if (!form.start_date)   return toast({ title: "Start Date is required", variant: "destructive" });
    if (!form.end_date)     return toast({ title: "End Date is required", variant: "destructive" });
    mutation.mutate(form);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Contract" : "Create New Contract"}</SheetTitle>
          <SheetDescription>
            <span className="text-destructive">*</span>{" "}
            {isEdit
              ? "Update the contract details below."
              : "Indicates mandatory fields. Contract will be created as Draft."}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5">

          <div className="grid grid-cols-2 gap-4">

            <div className="col-span-2 space-y-2">
              <Label>Title <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Enter contract title"
                value={form.title}
                onChange={e => set("title", e.target.value)}
                data-testid="input-contract-title"
              />
            </div>

            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea
                placeholder="Enter contract description"
                value={form.description}
                onChange={e => set("description", e.target.value)}
                className="resize-none"
                rows={3}
                data-testid="input-contract-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Buyer <span className="text-destructive">*</span></Label>
              <Input
                value={form.owner_name}
                disabled
                data-testid="input-contract-buyer"
              />
            </div>

            <div className="space-y-2">
              <Label>Requestor <span className="text-destructive">*</span></Label>
              <Input
                value={form.requestor_name}
                disabled
                data-testid="input-contract-requestor"
              />
            </div>

            <div className="space-y-2">
              <Label>Department <span className="text-destructive">*</span></Label>
              <Select
                key={`dept-${departmentsData.length}-${form.department_name}`}
                value={form.department_name}
                onValueChange={v => {
                  const d = departmentsData.find(d => d.value === v);
                  set("department_name", v);
                  if (d) set("department", String(d.id));
                }}
              >
                <SelectTrigger data-testid="select-contract-department">
                  <SelectValue placeholder="Select Department" />
                </SelectTrigger>
                <SelectContent>
                  {form.department_name && !departmentsData.find(d => d.value === form.department_name) && (
                    <SelectItem value={form.department_name}>{form.department_name}</SelectItem>
                  )}
                  {departmentsData.map(d => (
                    <SelectItem key={d.id} value={d.value}>{d.value}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Currency <span className="text-destructive">*</span></Label>
              <Select value={form.currency} onValueChange={v => set("currency", v)}>
                <SelectTrigger data-testid="select-contract-currency">
                  <SelectValue placeholder="Select Currency" />
                </SelectTrigger>
                <SelectContent>
                  {currencyOptions.length > 0
                    ? currencyOptions.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))
                    : ["USD", "EUR", "GBP", "AED", "INR"].map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))
                  }
                </SelectContent>
              </Select>
            </div>

          </div>

          <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>
              Start Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set("start_date", e.target.value)}
              data-testid="input-contract-start-date"
            />
          </div>

          <div className="space-y-2">
            <Label>
              End Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => set("end_date", e.target.value)}
              disabled={!form.start_date}
              min={form.start_date || undefined}
              data-testid="input-contract-end-date"
            />
          </div>
        </div>

          <div className="grid grid-cols-2 gap-4">
            {/* <div className="space-y-2">
              <Label>Contract Amount</Label>
              <Input
                type="number"
                placeholder="Enter contract amount"
                value={form.contract_amount}
                onChange={e => set("contract_amount", e.target.value)}
                data-testid="input-contract-amount"
              />
            </div> */}
            <div className="space-y-2">
              <Label>Renewable</Label>
              <Select value={form.is_renewable} onValueChange={v => set("is_renewable", v)}>
                <SelectTrigger data-testid="select-contract-renewable">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Yes">Yes</SelectItem>
                  <SelectItem value="No">No</SelectItem>
                  <SelectItem value="Auto">Auto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {!isEdit && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label>Select Template <span className="text-xs text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={form.template_name || "__none__"} onValueChange={v => set("template_name", v === "__none__" ? "" : v)}>
                  <SelectTrigger data-testid="select-contract-template">
                    <SelectValue placeholder="Choose a template…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— No template —</SelectItem>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.template_name}>{t.template_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending} data-testid="button-contract-cancel">
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={mutation.isPending || !form.title.trim()}
              data-testid={isEdit ? "button-contract-save" : "button-contract-create"}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {isEdit ? "Save Changes" : "Create Contract"}
            </Button>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
