import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import type { BidFormData } from "./bid-form-sheet";
import { clampDateTimeLocal, getCurrentLocalDateTime } from "./bid-form-utils";

interface Organization {
  id: number;
  organization_name: string;
}

export interface BidHeaderFormFieldsProps {
  formData: BidFormData;
  onChange: (next: BidFormData) => void;
  fromPr?: boolean;
  publishedEdit?: boolean;
  variant?: "sheet" | "inline";
}

export function BidHeaderFormFields({
  formData,
  onChange,
  fromPr = false,
  publishedEdit = false,
  variant = "sheet",
}: BidHeaderFormFieldsProps) {
  const { toast } = useToast();
  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : null;
  const userRole: string = parsedAuth?.userRole || "";
  const userOrgIds: string[] = parsedAuth?.orgIds
    ? parsedAuth.orgIds.split(",").map((id: string) => id.trim())
    : [];
  const isSuperadmin = userRole === "ROLE_SUPERADMIN" || userRole === "ROLE_SYSADMIN";

  const { data: usersData } = useQuery<
    {
      id: number;
      user_name: string;
      name: string;
      user_type: number;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
  });

  const roles = ["ROLE_PROCUREMENT_OFFICER", "ROLE_PROCUREMENT_MANAGER"];
  const { data: buyersData } = useQuery<
    {
      id: number;
      user_name: string;
      name: string;
      org_id: string;
    }[]
  >({
    queryKey: ["/api/users/dropdown", roles],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("roles", roles.join(","));
      const res = await apiRequest("GET", `/api/users/dropdown?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch users");
      return res.json();
    },
  });

  const { data: locationsData } = useQuery<
    { id: number; location_name: string; status: string }[]
  >({
    queryKey: ["/api/locations"],
  });

  const { data: currencyOptions = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/vendor/lookups/currencies"],
  });

  const { data: paymentTermsData } = useQuery<{
    data: { id: number; payment_term_id: string; terms_name: string; status: string }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const users = (usersData || []).filter((u) => u.user_type === 0);
  const buyers = buyersData || [];
  const locations = (locationsData || []).filter((loc) => loc.status === "Y");
  const paymentTerms = (paymentTermsData?.data || []).filter((pt) => pt.status === "Y");
  const visibleOrgs = organizations.filter((org) =>
    !isSuperadmin ? userOrgIds.includes(String(org.id)) : true,
  );

  const buyersForOrg = buyers.filter((item) =>
    item.org_id
      ?.split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .includes(String(formData.org_id).trim()),
  );

  const handleDateChange = (field: keyof BidFormData, value: string) => {
    if (!value) {
      onChange({ ...formData, [field]: value });
      return;
    }
    const finalValue = clampDateTimeLocal(value);
    if (finalValue !== value) {
      toast({
        title: "Invalid Time",
        description: "You cannot select a time in the past.",
        variant: "destructive",
      });
    }
    onChange({ ...formData, [field]: finalValue });
  };

  const labelClass = variant === "inline" ? "text-xs" : undefined;
  const gridClass =
    variant === "inline" ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : "grid grid-cols-2 gap-4";

  return (
    <div className="space-y-4">
      <div className={gridClass}>
        <div className={variant === "sheet" ? "col-span-2 space-y-2" : "sm:col-span-2 space-y-1.5"}>
          <Label className={labelClass}>
            Bid Title <span className="text-destructive">*</span>
          </Label>
          <Input
            placeholder="Enter bid title"
            value={formData.bid_title}
            onChange={(e) => onChange({ ...formData, bid_title: e.target.value })}
            data-testid="input-bid-title"
          />
        </div>

        <div className="space-y-1.5">
          <Label className={labelClass}>
            Bid Type <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.type}
            onValueChange={(v) =>
              onChange({
                ...formData,
                type: v,
                bid_style: v === "Tender" ? "Sealed" : "Open",
              })
            }
            disabled={publishedEdit}
          >
            <SelectTrigger data-testid="select-bid-type">
              <SelectValue placeholder="Select Bid Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="RFQ">RFQ</SelectItem>
              <SelectItem value="RFP">RFP</SelectItem>
              <SelectItem value="Tender">Tender</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className={labelClass}>
            Business Entity <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.org_id}
            onValueChange={(value) => {
              onChange({ ...formData, org_id: value, buyer_id: "", buyer_name: "" });
            }}
            disabled={fromPr}
          >
            <SelectTrigger data-testid="select-pr-business-entity">
              <SelectValue placeholder="Select business entity..." />
            </SelectTrigger>
            <SelectContent>
              {visibleOrgs.map((org) => (
                <SelectItem key={org.id} value={String(org.id)}>
                  {org.organization_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className={labelClass}>
            Buyer <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.buyer_id}
            onValueChange={(v) => {
              const selectedUser = buyersForOrg.find((u) => String(u.id) === v);
              onChange({
                ...formData,
                buyer_id: v,
                buyer_name: selectedUser?.name || selectedUser?.user_name || "",
              });
            }}
            disabled={publishedEdit || fromPr || !formData.org_id}
          >
            <SelectTrigger data-testid="select-bid-buyer">
              <SelectValue placeholder="Select Buyer" />
            </SelectTrigger>
            <SelectContent>
              {buyersForOrg
                .filter((u) => u.id)
                .map((buyer) => (
                  <SelectItem key={buyer.id} value={String(buyer.id)}>
                    {buyer.name || buyer.user_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className={labelClass}>
            Requestor <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.requestor_id}
            onValueChange={(v) => {
              const selectedUser = users.find((u) => String(u.id) === v);
              onChange({
                ...formData,
                requestor_id: v,
                requestor_name: selectedUser?.name || selectedUser?.user_name || "",
              });
            }}
            disabled={!isSuperadmin}
          >
            <SelectTrigger data-testid="select-bid-requestor">
              <SelectValue placeholder="Select Requestor" />
            </SelectTrigger>
            <SelectContent>
              {users
                .filter((u) => u.id)
                .map((user) => (
                  <SelectItem key={user.id} value={String(user.id)}>
                    {user.name || user.user_name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className={labelClass}>
            Currency <span className="text-destructive">*</span>
          </Label>
          <Select
            value={formData.currency}
            onValueChange={(v) => onChange({ ...formData, currency: v })}
            disabled={publishedEdit || fromPr}
          >
            <SelectTrigger data-testid="select-bid-currency">
              <SelectValue placeholder="Select Currency" />
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
      </div>

      <div>
        {variant === "sheet" && <h3 className="text-sm font-semibold mb-3">Timelines</h3>}
        <div className={gridClass}>
          <div className="space-y-1.5">
            <Label className={labelClass}>
              Bid Open Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={formData.startdate}
              onChange={(e) => handleDateChange("startdate", e.target.value)}
              disabled={publishedEdit}
              data-testid="input-bid-start-date"
              min={getCurrentLocalDateTime()}
              max={formData.enddate || undefined}
            />
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>
              Bid Close Date <span className="text-destructive">*</span>
            </Label>
            <Input
              type="datetime-local"
              value={formData.enddate}
              onChange={(e) => handleDateChange("enddate", e.target.value)}
              data-testid="input-bid-end-date"
              min={formData.startdate || getCurrentLocalDateTime()}
            />
          </div>
          {formData.type === "Tender" && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={labelClass}>
                Envelope Open Date <span className="text-destructive">*</span>
              </Label>
              <Input
                type="datetime-local"
                value={formData.env_open_date}
                onChange={(e) => handleDateChange("env_open_date", e.target.value)}
                data-testid="input-bid-env-open-date"
                min={formData.enddate || getCurrentLocalDateTime()}
              />
            </div>
          )}
        </div>
      </div>

      <div>
        {variant === "sheet" && <h3 className="text-sm font-semibold mb-3">General Terms</h3>}
        <div className={gridClass}>
          <div className="space-y-1.5">
            <Label className={labelClass}>Payment Terms</Label>
            <Select
              value={formData.payment_terms_id}
              onValueChange={(v) => {
                const selectedTerm = paymentTerms.find((pt) => String(pt.id) === v);
                onChange({
                  ...formData,
                  payment_terms_id: v,
                  paymentterms: selectedTerm?.terms_name || "",
                });
              }}
              disabled={publishedEdit}
            >
              <SelectTrigger data-testid="select-bid-payment-terms">
                <SelectValue placeholder="Select Payment Terms" />
              </SelectTrigger>
              <SelectContent>
                {paymentTerms.map((pt) => (
                  <SelectItem key={pt.id} value={String(pt.id)}>
                    {pt.terms_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className={labelClass}>Delivery Location</Label>
            <Select
              value={formData.delivery_location_id}
              onValueChange={(v) => {
                const selectedLoc = locations.find((l) => String(l.id) === v);
                onChange({
                  ...formData,
                  delivery_location_id: v,
                  delivertto_location_name: selectedLoc?.location_name || "",
                });
              }}
              disabled={publishedEdit}
            >
              <SelectTrigger data-testid="select-bid-delivery-location">
                <SelectValue placeholder="Select Delivery Location" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={String(loc.id)}>
                    {loc.location_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  );
}
