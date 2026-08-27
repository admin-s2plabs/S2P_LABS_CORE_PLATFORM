import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileOutput, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { RfiCampaign } from "./rfi-campaigns";

interface RfiCampaignFormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: number) => void;
  onUpdated?: () => void;
  defaultSourcePrNumber?: string;
  /** Pass an existing campaign to edit it in-place instead of creating a new one. */
  campaign?: { id: number; title: string; description: string; deadline: string };
}

export function RfiCampaignFormSheet({
  open,
  onOpenChange,
  onCreated,
  onUpdated,
  defaultSourcePrNumber,
  campaign,
}: RfiCampaignFormSheetProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = !!campaign;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (campaign) {
      setTitle(campaign.title);
      setDescription(campaign.description);
      setDeadline(campaign.deadline?.slice(0, 10) || "");
    } else {
      setTitle(defaultSourcePrNumber ? `RFI — sourced from ${defaultSourcePrNumber}` : "");
      setDescription("");
      setDeadline("");
    }
    setTouched(false);
  }, [open, campaign, defaultSourcePrNumber]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/rfi/campaigns", {
        title,
        description,
        deadline,
        sourcePrNumber: defaultSourcePrNumber || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns"] });
      toast({ title: "Campaign created as Draft", description: "Add suppliers and questions, then publish." });
      onOpenChange(false);
      onCreated?.(data.campaign.id);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to create campaign", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!campaign) return;
      const res = await apiRequest("PATCH", `/api/rfi/campaigns/${campaign.id}`, {
        title,
        description,
        deadline,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns"] });
      if (campaign) queryClient.invalidateQueries({ queryKey: ["/api/rfi/campaigns", String(campaign.id)] });
      toast({ title: "Campaign updated" });
      onOpenChange(false);
      onUpdated?.();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to update campaign", description: err.message, variant: "destructive" });
    },
  });

  const errors = {
    title: title.trim() ? null : "Title is required",
    description: description.trim() ? null : "Description is required",
    deadline: deadline ? null : "Response deadline is required",
  };
  const isValid = !errors.title && !errors.description && !errors.deadline;
  const pending = createMutation.isPending || updateMutation.isPending;

  const handleSubmit = () => {
    setTouched(true);
    if (!isValid) return;
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[560px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit RFI Campaign" : "Create RFI Campaign"}</SheetTitle>
          <SheetDescription>
            {isEdit
              ? "Suppliers and questions are managed on the campaign page."
              : "Indicates mandatory fields. The campaign will be created as Draft."}
          </SheetDescription>
        </SheetHeader>

        {!isEdit && defaultSourcePrNumber && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <FileOutput className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
            <p>
              Raised from <span className="font-semibold">{defaultSourcePrNumber}</span>
            </p>
          </div>
        )}

        <div className="mt-6 space-y-5">
          <div>
            <Label htmlFor="rfi-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rfi-title"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter campaign title"
              data-testid="input-campaign-title"
            />
            {touched && errors.title && <p className="mt-1 text-xs text-destructive">{errors.title}</p>}
          </div>
          <div>
            <Label htmlFor="rfi-description">
              Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="rfi-description"
              className="mt-1.5 min-h-[110px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What are you trying to find out from these suppliers?"
              data-testid="input-campaign-description"
            />
            {touched && errors.description && (
              <p className="mt-1 text-xs text-destructive">{errors.description}</p>
            )}
          </div>
          <div>
            <Label htmlFor="rfi-deadline">
              Response Deadline <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rfi-deadline"
              type="date"
              className="mt-1.5"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              data-testid="input-campaign-deadline"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Suppliers will be expected to respond by this date.
            </p>
            {touched && errors.deadline && <p className="mt-1 text-xs text-destructive">{errors.deadline}</p>}
          </div>
        </div>

        <SheetFooter className="mt-8">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-campaign">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={pending} data-testid="button-submit-campaign">
            {pending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Save Changes" : "Create Campaign"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
