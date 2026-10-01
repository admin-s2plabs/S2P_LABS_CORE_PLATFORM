import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FormSheet } from "@/components/form-sheet";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { BidHeaderFormFields } from "./bid-header-form-fields";
import {
  formatDateTimeInput,
  toLocalISOString,
  validateBidHeaderForm,
} from "./bid-form-utils";

export interface BidFormData {
  bid_title: string;
  type: string;
  currency: string;
  startdate: string;
  enddate: string;
  org_id: string;
  buyer_id: string;
  buyer_name: string;
  requestor_id: string;
  requestor_name: string;
  payment_terms_id: string;
  paymentterms: string;
  delivery_location_id: string;
  delivertto_location_name: string;
  template_name: string;
  env_open_date: string;
  bid_style: string;
}

export const emptyBidForm: BidFormData = {
  bid_title: "",
  type: "RFQ",
  currency: "",
  startdate: "",
  enddate: "",
  org_id: "",
  buyer_id: "",
  buyer_name: "",
  requestor_id: "",
  requestor_name: "",
  payment_terms_id: "",
  paymentterms: "",
  delivery_location_id: "",
  delivertto_location_name: "",
  template_name: "",
  env_open_date: "",
  bid_style: "",
};

interface BidFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editBidId?: string | number | null;
  initialData?: Partial<BidFormData>;
  publishedEdit?: boolean;
  prNumber?: string | null;
}

export default function BidFormSheet({ open, onOpenChange, editBidId, initialData, publishedEdit = false, prNumber }: BidFormSheetProps) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const isEdit = !!editBidId;

  const [formData, setFormData] = useState<BidFormData>({ ...emptyBidForm });
  const [initialized, setInitialized] = useState(false);
  const orgDetails = JSON.parse(localStorage.getItem("orgDetails") || "{}");

  const { data: bids } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids"],
  });

  const { data: usersData } = useQuery<{ id: number; user_id: string; user_name: string; name: string; email_id: string; department_name: string | null; user_type: number }[]>({
    queryKey: ["/api/users/dropdown"],
  });

  const { data: paymentTermsData } = useQuery<{ data: { id: number; payment_term_id: string; terms_name: string; status: string }[] }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });

  useEffect(() => {
    if (
      isEdit ||
      !orgDetails?.currency ||
      !paymentTermsData?.data.length ||
      !orgDetails?.default_paymentterms
    ) return;
    const defaultTerm = paymentTermsData?.data.find(
      (t) => t.payment_term_id === orgDetails.default_paymentterms
    );
    setFormData((prev: any) => {
      let updated = { ...prev };
      let changed = false;
      if (
        defaultTerm &&
        defaultTerm.status === "Y" &&
        prev.payment_terms_id !== defaultTerm.payment_term_id
      ) {
        updated.payment_terms_id = defaultTerm.payment_term_id;
        updated.paymentterms = defaultTerm.terms_name;
        changed = true;
      }
      return changed ? updated : prev;
    });
  }, [paymentTermsData, orgDetails, isEdit]);

  const users = (usersData || []).filter(u => u.user_type === 0);

  useEffect(() => {
    if (!open) {
      setInitialized(false);
      return;
    }
    if (initialized) return;

    if (isEdit && initialData) {
      const dataWithStyle = { ...emptyBidForm, ...initialData };
      if ((initialData as any).bidStyle) {
        dataWithStyle.bid_style = (initialData as any).bidStyle;
      }
      setFormData({
        ...dataWithStyle,
        startdate: formatDateTimeInput(dataWithStyle.startdate),
        enddate: formatDateTimeInput(dataWithStyle.enddate),
        env_open_date: formatDateTimeInput(dataWithStyle.env_open_date),
      });
      setInitialized(true);
    } else if (!isEdit) {
      const fresh = { ...emptyBidForm };
      if (users.length > 0) {
        const authData = localStorage.getItem("prokraya-auth");
        if (authData) {
          try {
            const auth = JSON.parse(authData);
            const matchedUser = users.find(u => String(u.id) === String(auth.userId));
            if (matchedUser) {
              const userName = matchedUser.name || matchedUser.user_name || "";
              fresh.requestor_id = String(matchedUser.id);
              fresh.requestor_name = userName;
            }
          } catch (e) {
            console.error("Error parsing auth data:", e);
          }
        }
        setInitialized(true);
      }
      setFormData(fresh);
    }
  }, [open, isEdit, initialData, users, initialized]);

  const createBidMutation = useMutation({
    mutationFn: async (data: BidFormData) => {
      const res = await apiRequest("POST", "/api/dbo/bids", data);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      onOpenChange(false);
      toast({ title: "Bid Created", description: `Bid ${data.bid_number} has been created as Draft.` });
      if (data.id) {
        navigate(`/app/bids/${data.id}`);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create bid", variant: "destructive" });
    },
  });

  const updateBidMutation = useMutation({
    mutationFn: async (data: BidFormData) => {
      const res = await apiRequest("PATCH", `/api/dbo/bids/${editBidId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", String(editBidId)] });
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      onOpenChange(false);
      toast({ title: "Updated", description: "Bid details updated successfully." });
      if (publishedEdit) {
        navigate("/app/bids");
      }
    },
    onError: (response: any) => {
      toast({ title: "Error", description: response.message || "Failed to update bid.", variant: "destructive" });
    },
  });

  const mutation = isEdit ? updateBidMutation : createBidMutation;

  const handleSubmit = () => {
    const validationError = validateBidHeaderForm(formData);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    const submitData = { ...formData };
    if (submitData.startdate) submitData.startdate = toLocalISOString(submitData.startdate);
    if (submitData.enddate) submitData.enddate = toLocalISOString(submitData.enddate);
    if (submitData.env_open_date) submitData.env_open_date = toLocalISOString(submitData.env_open_date);
    mutation.mutate(submitData);
  };

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? "Edit Bid" : "Create New Bid"}
      description={`Indicates mandatory fields.${!isEdit ? " Bid number will be auto-generated." : ""}`}
      onSubmit={handleSubmit}
      submitLabel={isEdit ? "Save Changes" : "Create Bid"}
      isSubmitting={mutation.isPending}
      submitDisabled={!formData.bid_title.trim()}
      widthClassName="sm:max-w-3xl"
    >
      <p className="text-xs text-muted-foreground mb-4">
        <span className="text-destructive">*</span> Indicates mandatory fields.{!isEdit && " Bid number will be auto-generated."}
      </p>
      <div className="space-y-5">
        <BidHeaderFormFields
          formData={formData}
          onChange={setFormData}
          fromPr={!!prNumber}
          publishedEdit={publishedEdit}
          variant="sheet"
        />

        {!isEdit && (
          <div>
            <p className="text-sm font-semibold mb-1">Do you want to Create Bid from a Template ?</p>
            <div className="space-y-2">
              <Label>Copy From Template</Label>
              <Select value={formData.template_name || ""} onValueChange={(v) => setFormData({ ...formData, template_name: v })}>
                <SelectTrigger data-testid="select-bid-template"><SelectValue placeholder="Select Copy From Template" /></SelectTrigger>
                <SelectContent>
                  {(bids || [])
                    .filter((b: any) => b.templateName && b.templateName.trim() !== "")
                    .map((b: any) => (
                      <SelectItem key={b.id} value={String(b.id)}>{b.templateName}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>
    </FormSheet>
  );
}
