import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FormSheet } from "@/components/form-sheet";
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
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency, formatDate } from "@/lib/common-functions";
import {
  InviteSuppliersSheet,
  mapApprovedSupplierToInvitePayload,
  type ApprovedSupplierRow,
} from "@/components/invite-suppliers-sheet";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  ClipboardList,
  Clock,
  DollarSign,
  Edit,
  File,
  FolderTree,
  Gavel,
  Loader2,
  Mail,
  MapPin,
  Package,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Save,
  Scale,
  ScrollText,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import BidFormSheet from "./bid-form-sheet";

const statusColors: Record<string, string> = {
  Draft: "secondary",
  Published: "default",
  Closed: "outline",
  Awarded: "default",
  Cancelled: "destructive",
  "In review": "secondary",
};

function StatusBadge({ status }: { status: string }) {
  const variant = (statusColors[status] || "secondary") as any;
  return <Badge variant={variant}>{status}</Badge>;
}

const bidTypeLabels: Record<string, string> = {
  RFQ: "Request for Quotation",
  RFP: "Request for Proposal",
  Tender: "Open Tender",
};


function formatDateTime(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

interface Organization {
  id: number;
  organization_name: string;
}

interface LookupItem {
  value: string;
  label: string;
}

export default function BidDetail() {
  const [, params] = useRoute("/app/bids/:id");
  const bidId = params?.id;
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState("lines");
  const [addLineSheetOpen, setAddLineSheetOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<any>(null);
  const [itemEntryMode, setItemEntryMode] = useState<"master" | "freetext">(
    "master",
  );
  const [itemOpen, setItemOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [showAddSupplierDialog, setShowAddSupplierDialog] = useState(false);
  const [showAddRequirementDialog, setShowAddRequirementDialog] =
    useState(false);
  const [editingRequirement, setEditingRequirement] = useState<any>(null);
  const [showAddClauseDialog, setShowAddClauseDialog] = useState(false);
  const [teamSearchOpen, setTeamSearchOpen] = useState<Record<string, boolean>>(
    {},
  );
  const [teamSearchQuery, setTeamSearchQuery] = useState<
    Record<string, string>
  >({});
  const [showAddAttachmentDialog, setShowAddAttachmentDialog] = useState(false);
  const [showCriteriaAttachmentDialog, setShowCriteriaAttachmentDialog] =
    useState(false);
  const [showEditHeaderDialog, setShowEditHeaderDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    type: string;
    id: number;
  } | null>(null);
  const [, navigate] = useLocation();
  const [editAutoOpened, setEditAutoOpened] = useState(false);

  const [lineForm, setLineForm] = useState({
    linetype: "Goods",
    description: "",
    uom: "EA",
    quantity: "1",
    currentprice: "0",
    currency: "INR",
    categoryCode: "",
    categoryName: "",
    itemId: "",
    itemName: "",
    needbyfrom: "",
    needbyto: "",
    itemCode: "",
  });

  const sanitizeDecimalInput = (value: string) =>
    value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
  const sanitizeIntegerInput = (value: string) => value.replace(/\D/g, "");
  const preventInvalidNumberKey = (
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (["e", "E", "-", "+"].includes(e.key)) {
      e.preventDefault();
    }
  };
  const [reqForm, setReqForm] = useState({
    category: "",
    question: "",
    qvoption: "Required",
    qvtype: "Text",
    weight: "100",
    lovOptions: [] as string[],
  });
  const [newLovOption, setNewLovOption] = useState("");
  const [clauseForm, setClauseForm] = useState({
    type: "terms",
    class_desc: "",
    class_ref: "",
  });
  const [attachForm, setAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Lines",
    attach_type: "application/pdf",
  });
  const [criteriaAttachForm, setCriteriaAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Requirements",
    attach_type: "application/pdf",
  });
  const [selectedCriteriaFile, setSelectedCriteriaFile] =
    useState<globalThis.File | null>(null);
  const [showTermsAttachmentDialog, setShowTermsAttachmentDialog] =
    useState(false);
  const [termsAttachForm, setTermsAttachForm] = useState({
    attach_name: "",
    attach_desc: "",
    attach_source: "Terms",
    attach_type: "application/pdf",
  });
  const [selectedTermsFile, setSelectedTermsFile] =
    useState<globalThis.File | null>(null);
  const [editBidInitialData, setEditBidInitialData] = useState<any>(null);

  const [showProxySheet, setShowProxySheet] = useState(false);
  const [proxySupplier, setProxySupplier] = useState<any>(null);
  const [proxyLines, setProxyLines] = useState<Record<number, { bidprice: string; discprice: string; promisedDate: string }>>({});
  const [proxyRequirements, setProxyRequirements] = useState<Record<number, { answer: string; remarks: string }>>({});
  const [proxyComments, setProxyComments] = useState("");
  const [proxyRefNumber, setProxyRefNumber] = useState("");
  const [proxyActiveTab, setProxyActiveTab] = useState("financial");

  const { data: bid, isLoading } = useQuery<any>({
    queryKey: ["/api/dbo/bids", bidId],
    enabled: !!bidId,
  });

  const { data: businessCategories } = useQuery<LookupItem[]>({
    queryKey: ["/api/lookups/by-property/BID_REQ_CATEGORIES"],
    select: (data: any[]) => data.map(d => ({ value: d.lookup_key, label: d.description })),
  });

  const [taskId, setTaskId] = useState<string | null>(null);

  useEffect(() => {
    const storedTaskId = sessionStorage.getItem("currentTaskId");
    setTaskId(storedTaskId);
  }, []);

  const processApprovalMutation = useMutation({
    mutationFn: async ({
      result,
      comments,
    }: {
      result: string;
      comments: string;
    }) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/processBidApprovalStep/${taskId}?result=${result}&comments=${comments}&bidRefNo=${bidId}`,
        {},
      );
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Approval step processed successfully.",
      });
      sessionStorage.removeItem("currentTaskId");
      navigate("/app/dashboard");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const { data: lines } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "lines"],
    enabled: !!bidId,
  });

  const { data: suppliers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "suppliers"],
    enabled: !!bidId,
  });

  const { data: requirements } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "requirements"],
    enabled: !!bidId,
  });

  const { data: clauses } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "clauses"],
    enabled: !!bidId,
  });

  const { data: approvers } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "approvers"],
    enabled: !!bidId,
  });

  const { data: allUsers } = useQuery<any[]>({
    queryKey: ["/api/users/dropdown"],
    enabled: !!bidId,
  });

  const { data: attachments } = useQuery<any[]>({
    queryKey: ["/api/dbo/bids", bidId, "attachments"],
    enabled: !!bidId,
  });

  const { data: usersData } = useQuery<
    {
      id: number;
      user_id: string;
      user_name: string;
      name: string;
      email_id: string;
      department_name: string | null;
      user_type: number;
    }[]
  >({
    queryKey: ["/api/users/dropdown"],
  });
  const { data: locationsData } = useQuery<
    { id: number; location_name: string; location_id: string }[]
  >({
    queryKey: ["/api/locations"],
  });
  const { data: paymentTermsData } = useQuery<{
    data: {
      id: number;
      payment_term_id: string;
      terms_name: string;
      status: string;
    }[];
  }>({
    queryKey: ["/api/payment-terms?limit=100"],
  });
  const users = (usersData || []).filter((u) => u.user_type === 0);
  const locations = locationsData || [];
  const paymentTerms = (paymentTermsData?.data || []).filter(
    (pt) => pt.status === "Y",
  );

  const { data: categoryTypeLookups = [] } = useQuery<any[]>({
    queryKey: ["/api/lookups/by-property/CATEGORY_TYPE"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/organizations"],
  });

  const categoryTypeLookup = categoryTypeLookups.find(
    (l) => l.lookup_key === "CATEGORY",
  );
  const isNonUnspsc = categoryTypeLookup?.lookup_value === "NON-UNSPSC";

  const { data: productCategories = [] } = useQuery<any[]>({
    queryKey: ["/api/product-categories"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/product-categories");
      if (!res.ok) throw new Error("Failed to fetch product categories");
      return res.json();
    },
    enabled: isNonUnspsc && (addLineSheetOpen || showAddSupplierDialog),
  });

  const { data: categoriesData } = useQuery<
    { id: string; code: string; name: string; level: string }[]
  >({
    queryKey: ["/api/categories"],
    enabled: !isNonUnspsc && (addLineSheetOpen || showAddSupplierDialog),
  });

  const categories = isNonUnspsc
    ? productCategories.map((pc: any) => ({
      id: String(pc.category_id || pc.categoryId || pc.id),
      code: pc.category_code || pc.categoryCode || String(pc.category_id || pc.categoryId || pc.id),
      name: pc.category_name || pc.categoryName || pc.name,
      level: "1",
    }))
    : categoriesData || [];

  const { data: itemsData } = useQuery<
    {
      id: string;
      itemCode: string;
      name: string;
      categoryCode: string;
      categoryName: string;
      unitOfMeasure: string;
      standardPrice: number | null;
    }[]
  >({
    queryKey: ["/api/items"],
    enabled: addLineSheetOpen && itemEntryMode === "master",
  });
  const items = itemsData || [];

  const { data: uomData } = useQuery<{ id: number; description: string }[]>({
    queryKey: ["/api/lookups/by-property/UOM"],
    enabled: addLineSheetOpen,
  });
  const uomOptions = uomData || [];

  const resetLineForm = () => {
    setLineForm({
      linetype: "Goods",
      description: "",
      uom: "EA",
      quantity: "1",
      currentprice: "0",
      currency: bid?.currency || "INR",
      categoryCode: "",
      categoryName: "",
      itemId: "",
      itemName: "",
      needbyfrom: "",
      needbyto: "",
      itemCode: "",
    });
    setItemEntryMode("master");
  };

  const addLineMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/lines`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      toast({ title: "Line Added", description: "Bid line has been added." });
      setAddLineSheetOpen(false);
      resetLineForm();
    },
    onError: (response: any) => {
      toast({
        title: "Error",
        description: response.message,
        variant: "destructive",
      });
    },
  });

  const deleteLineMutation = useMutation({
    mutationFn: async (lineId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/lines/${lineId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      toast({
        title: "Line Removed",
        description: "Bid line has been removed.",
      });
    },
  });

  const updateLineMutation = useMutation({
    mutationFn: async ({ lineId, data }: { lineId: number; data: any }) => {
      const response = await apiRequest(
        "PUT",
        `/api/dbo/bids/${bidId}/lines/${lineId}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "lines"],
      });
      toast({ title: "Line Updated", description: "Bid line has been updated." });
      setAddLineSheetOpen(false);
      setEditingLine(null);
      resetLineForm();
    },
    onError: (response: any) => {
      toast({
        title: "Error",
        description: response.message,
        variant: "destructive",
      });
    },
  });

  const addSupplierMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/suppliers`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "suppliers"],
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to invite supplier.",
        variant: "destructive",
      });
    },
  });

  const inviteSelectedSuppliers = async (selected: ApprovedSupplierRow[]) => {
    for (const s of selected) {
      await addSupplierMutation.mutateAsync(mapApprovedSupplierToInvitePayload(s));
    }
    toast({
      title: "Suppliers Invited",
      description: `${selected.length} supplier(s) have been invited to this bid.`,
    });
    setShowAddSupplierDialog(false);
  };

  const deleteSupplierMutation = useMutation({
    mutationFn: async (suppId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/suppliers/${suppId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "suppliers"],
      });
      toast({
        title: "Supplier Removed",
        description: "Supplier has been removed.",
      });
    },
  });

  const addRequirementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/requirements`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      toast({
        title: "Criteria Added",
        description: "Evaluation criteria has been added.",
      });
      setShowAddRequirementDialog(false);
      setReqForm({
        category: "",
        question: "",
        qvoption: "Required",
        qvtype: "Text",
        weight: "100",
        lovOptions: [],
      });
      setNewLovOption("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add criteria.",
        variant: "destructive",
      });
    },
  });

  const updateRequirementMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "PUT",
        `/api/dbo/bids/${bidId}/requirements/${editingRequirement.id}`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      toast({
        title: "Criteria Updated",
        description: "Evaluation criteria has been updated.",
      });
      setShowAddRequirementDialog(false);
      setEditingRequirement(null);
      setReqForm({
        category: "",
        question: "",
        qvoption: "Required",
        qvtype: "Text",
        weight: "100",
        lovOptions: [],
      });
      setNewLovOption("");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update criteria.",
        variant: "destructive",
      });
    },
  });

  const deleteRequirementMutation = useMutation({
    mutationFn: async (reqId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/requirements/${reqId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "requirements"],
      });
      toast({
        title: "Criteria Removed",
        description: "Evaluation criteria has been removed.",
      });
    },
  });

  const addClauseMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/clauses`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "clauses"],
      });
      toast({
        title: "Clause Added",
        description: "Terms/Instructions clause has been added.",
      });
      setShowAddClauseDialog(false);
      setClauseForm({ type: "terms", class_desc: "", class_ref: "" });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add clause.",
        variant: "destructive",
      });
    },
  });

  const deleteClauseMutation = useMutation({
    mutationFn: async (clauseId: number) => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}/clauses/${clauseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "clauses"],
      });
      toast({
        title: "Clause Removed",
        description: "Clause has been removed.",
      });
    },
  });

  const addTeamMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/team`,
        data,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "approvers"],
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to add team member.",
        variant: "destructive",
      });
    },
  });

  const deleteApproverMutation = useMutation({
    mutationFn: async (approverId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/approvers/${approverId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "approvers"],
      });
      toast({
        title: "Member Removed",
        description: "Team member has been removed.",
      });
    },
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const addAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedFile) {
        formData.append("file", selectedFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", data.attach_source || "Lines");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      toast({
        title: "Attachment Added",
        description: "Document has been attached successfully.",
      });
      setShowAddAttachmentDialog(false);
      setAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Lines",
        attach_type: "application/pdf",
      });
      setSelectedFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const addCriteriaAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedCriteriaFile) {
        formData.append("file", selectedCriteriaFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", "Requirements");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      toast({
        title: "Attachment Added",
        description: "Criteria document has been attached successfully.",
      });
      setShowCriteriaAttachmentDialog(false);
      setCriteriaAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Requirements",
        attach_type: "application/pdf",
      });
      setSelectedCriteriaFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const addTermsAttachmentMutation = useMutation({
    mutationFn: async (data: any) => {
      const formData = new FormData();
      if (selectedTermsFile) {
        formData.append("file", selectedTermsFile);
      }
      formData.append("attach_desc", data.attach_desc || "");
      formData.append("attach_source", "Terms");
      formData.append("attach_name", data.attach_name || "");
      formData.append("attach_type", data.attach_type || "application/pdf");
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/attachments`, formData);
      if (!response.ok) throw new Error("Upload failed");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      toast({
        title: "Attachment Added",
        description: "Terms document has been attached successfully.",
      });
      setShowTermsAttachmentDialog(false);
      setTermsAttachForm({
        attach_name: "",
        attach_desc: "",
        attach_source: "Terms",
        attach_type: "application/pdf",
      });
      setSelectedTermsFile(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to add attachment.",
        variant: "destructive",
      });
    },
  });

  const deleteAttachmentMutation = useMutation({
    mutationFn: async (attachId: number) => {
      await apiRequest(
        "DELETE",
        `/api/dbo/bids/${bidId}/attachments/${attachId}`,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/dbo/bids", bidId, "attachments"],
      });
      toast({
        title: "Attachment Removed",
        description: "Attachment has been removed.",
      });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/dbo/bids/${bidId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Bid Deleted",
        description: "The bid has been permanently deleted.",
      });
      navigate("/app/bids");
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete bid.",
        variant: "destructive",
      });
    },
  });

  const handlePublish = () => {
    if (!bid.startdate) return;

    const now = new Date();
    const startDate = new Date(bid.startdate);

    if (startDate < now) {
      toast({
        title: "Invalid Start Date",
        description: "Bid start date cannot be in the past.",
        variant: "destructive",
      });
      return;
    }

    publishBidMutation.mutate();
  };

  const publishBidMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/publish`,
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Bid Published",
        description: "The bid has been published to suppliers successfully.",
      });
      setPublishConfirmOpen(false);
      navigate("/app/bids");
    },
    onError: (error: any) => {
      toast({
        title: "Cannot Publish",
        description: error?.message || "Failed to publish bid.",
        variant: "destructive",
      });
      setPublishConfirmOpen(false);
    },
  });

  const saveAsTemplateMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await apiRequest(
        "POST",
        `/api/dbo/bids/${bidId}/save-template`,
        { templateName: name },
      );
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids"] });
      toast({
        title: "Saved as Template",
        description: "This bid has been saved as a reusable template.",
      });
      setShowTemplateDialog(false);
      setTemplateName("");
      navigate("/app/bids");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save as template.",
        variant: "destructive",
      });
    },
  });

  const placeProxyMutation = useMutation({
    mutationFn: async (payload: {
      supplierId: number;
      lines: Array<{ bidLineId: number; bidprice: number | null; discprice: number | null; promisedDate: string | null }>;
      requirements: Array<{ reqId: number; answer: string; remarks: string }>;
      comments: string;
      refNumber: string;
    }) => {
      const response = await apiRequest("POST", `/api/dbo/bids/${bidId}/proxy-response`, payload);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "Proxy Response Placed", description: "The proxy bid response has been submitted successfully." });
      setShowProxySheet(false);
      setProxySupplier(null);
      setProxyLines({});
      setProxyRequirements({});
      setProxyComments("");
      setProxyRefNumber("");
      setProxyActiveTab("financial");
      queryClient.invalidateQueries({ queryKey: ["/api/dbo/bids", bidId, "suppliers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to place proxy response.", variant: "destructive" });
    },
  });

  const handleSubmitProxy = () => {
    if (!proxySupplier) {
      toast({ title: "Validation", description: "Please select a vendor.", variant: "destructive" });
      return;
    }
    if (!proxyRefNumber.trim()) {
      toast({ title: "Validation", description: "Please enter a reference number.", variant: "destructive" });
      return;
    }
    if (!proxyComments.trim()) {
      toast({ title: "Validation", description: "Please enter comments.", variant: "destructive" });
      return;
    }
    const linesPayload = (lines || []).map((l: any) => {
      const entry = proxyLines[l.id] || { bidprice: "", discprice: "", promisedDate: "" };
      return {
        bidLineId: l.id,
        bidprice: entry.bidprice !== "" ? Number(entry.bidprice) : null,
        discprice: entry.discprice !== "" ? Number(entry.discprice) : null,
        promisedDate: entry.promisedDate || null,
      };
    });
    const reqsPayload = (requirements || []).map((r: any) => {
      const entry = proxyRequirements[r.id] || { answer: "", remarks: "" };
      return { reqId: r.id, answer: entry.answer, remarks: entry.remarks };
    });
    placeProxyMutation.mutate({
      supplierId: proxySupplier.supplier_id,
      lines: linesPayload,
      requirements: reqsPayload,
      comments: proxyComments,
      refNumber: proxyRefNumber,
    });
  };

  const handleConfirmDelete = () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    if (type === "line") deleteLineMutation.mutate(id);
    else if (type === "supplier") deleteSupplierMutation.mutate(id);
    else if (type === "requirement") deleteRequirementMutation.mutate(id);
    else if (type === "clause") deleteClauseMutation.mutate(id);
    else if (type === "approver") deleteApproverMutation.mutate(id);
    else if (type === "attachment") deleteAttachmentMutation.mutate(id);
    setDeleteConfirm(null);
  };

  const handleEditHeader = () => {
    if (bid) {
      console.log("Bid Data for Editing:", bid);
      const buyerEmail = bid.buyer || "";
      const buyerName = bid.buyer_name || "";
      const matchedBuyer = users.find(
        (u) =>
          (buyerEmail && u.email_id === buyerEmail) ||
          (buyerName && (u.name === buyerName || u.user_name === buyerName)),
      );
      console.log("Matched Buyer:", matchedBuyer);
      const requestorName = bid.requestor_name || "";
      const requestorVal = bid.requestor || "";
      const matchedRequestor = users.find(
        (u) =>
          (requestorVal && String(u.id) === String(requestorVal)) ||
          (requestorName &&
            (u.name === requestorName || u.user_name === requestorName)),
      );

      const paymentTermsName = bid.paymentterms || bid.paymentTerms || "";
      const matchedPT = paymentTerms.find(
        (pt) => pt.terms_name === paymentTermsName,
      );

      const locationId = bid.delivertto_location_id;
      const matchedLoc = locations.find(
        (l) => l.id === locationId || String(l.id) === String(locationId),
      );

      setEditBidInitialData({
        bid_title: bid.bid_title || "",
        type: bid.type || "RFQ",
        currency: bid.currency || "USD",
        org_id: bid.org_id ? String(bid.org_id) : "",
        bid_style: bid.bid_style || "Sealed",
        startdate: bid.startdate
          ? bid.startdate
          : "",
        enddate: bid.enddate
          ? bid.enddate
          : "",
        buyer_id: matchedBuyer ? String(matchedBuyer.id) : "",
        buyer_name: buyerName,
        requestor_id: matchedRequestor ? String(matchedRequestor.id) : "",
        requestor_name: requestorName,
        payment_terms_id: matchedPT ? String(matchedPT.id) : "",
        paymentterms: paymentTermsName,
        delivery_location_id: matchedLoc ? String(matchedLoc.id) : "",
        delivertto_location_name:
          bid.delivertto_location_name || bid.shiptoaddress || "",
        env_open_date: bid.env_open_date
          ? bid.env_open_date
          : "",
      });
      setShowEditHeaderDialog(true);
    }
  };

  useEffect(() => {
    if (editAutoOpened || !bid || !users.length) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("edit") === "1") {
      setEditAutoOpened(true);
      handleEditHeader();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [bid, users, editAutoOpened]);

  const invitedSupplierIds = suppliers?.map((s: any) => s.supplier_id) || [];

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-48" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="p-4">
        <Card>
          <CardContent className="p-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-lg font-medium mb-2">Bid Not Found</h2>
            <p className="text-sm text-muted-foreground mb-4">
              The requested bid could not be found.
            </p>
            <Link href="/app/bids">
              <Button variant="outline">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Bids
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isDraft = bid.status === "Draft";
  const isPrCancelled = bid.attribute_15 === "PR Cancelled";
  const bidType = bid.type || "RFQ";
  const typeLabel = bidTypeLabels[bidType] || bidType;
  const bidNumber = bid.bid_number || bid.attribute_4 || `BID-${bid.id}`;

  const termsClauses = clauses?.filter((c: any) => c.type === "terms") || [];
  const instructionsClauses =
    clauses?.filter((c: any) => c.type === "instructions") || [];

  const teamTypes =
    bidType === "Tender"
      ? [
        "Technical Review Team",
        "Technical Approve Team",
        "Commercial Review Team",
        "Commercial Approve Team",
        "Committee Team",
      ]
      : bidType === "RFP"
        ? ["Technical Review Team", "Commercial Review Team"]
        : [];

  const groupedApprovers: Record<string, any[]> = {};
  teamTypes.forEach((tt) => {
    groupedApprovers[tt] = [];
  });
  (approvers || []).forEach((a: any) => {
    if (!groupedApprovers[a.teamtype]) groupedApprovers[a.teamtype] = [];
    groupedApprovers[a.teamtype].push(a);
  });

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link href="/app/bids">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex h-9 w-9 items-center justify-center rounded bg-primary/10">
            <Gavel className="h-4 w-4 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1
                className="text-xl font-semibold"
                data-testid="text-bid-number"
              >
                {bidNumber}
              </h1>
              <StatusBadge status={bid.status} />
              <Badge variant="outline">{bidType}</Badge>
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-testid="text-bid-title"
            >
              {bid.bid_title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {taskId && !isDraft && (
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    className="bg-[#3b1c71] hover:bg-[#2d1556] text-white flex items-center gap-2 h-9 px-4 transition-all"
                    disabled={processApprovalMutation.isPending}
                    data-testid="button-approve-dropdown"
                  >
                    {processApprovalMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                    <span className="font-medium">Approve</span>
                    <ChevronDown className="h-4 w-4 opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36 p-1">
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer text-green-600 focus:text-green-700 focus:bg-green-50"
                    onClick={() =>
                      processApprovalMutation.mutate({
                        result: "Approved",
                        comments: "",
                      })
                    }
                    data-testid="menu-item-approve"
                  >
                    <ThumbsUp className="h-4 w-4" />
                    <span className="font-semibold">Approve</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="flex items-center gap-2 cursor-pointer text-red-600 focus:text-red-700 focus:bg-red-50"
                    onClick={() =>
                      processApprovalMutation.mutate({
                        result: "Rejected",
                        comments: "",
                      })
                    }
                    data-testid="menu-item-reject"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    <span className="font-semibold">Reject</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          {bid.status === "Published" && bidType === "RFQ" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setProxySupplier(null);
                setProxyLines({});
                setProxyRequirements({});
                setProxyComments("");
                setProxyRefNumber("");
                setProxyActiveTab("financial");
                setShowProxySheet(true);
              }}
              data-testid="button-place-proxy"
            >
              <ClipboardList className="h-4 w-4 mr-2" />
              Place Proxy
            </Button>
          )}
          {isDraft && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="button-delete-bid"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Bid</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this bid? The bid will be
                      marked as deleted and the linked requisition reference
                      will be cleared.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-delete-bid-cancel">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteBidMutation.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-delete-bid-confirm"
                    >
                      {deleteBidMutation.isPending && (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      )}
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
          )}
          {isDraft && !isPrCancelled && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditHeader}
                data-testid="button-edit-header"
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setTemplateName(bid.template_name || bid.bid_title || "");
                  setShowTemplateDialog(true);
                }}
                data-testid="button-save-template"
              >
                <Save className="h-4 w-4 mr-2" />
                Save As Template
              </Button>

              <Button
                size="sm"
                onClick={() => setPublishConfirmOpen(true)}
                disabled={publishBidMutation.isPending}
                data-testid="button-publish-bid"
              >
                {publishBidMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Publish to Suppliers
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Gavel className="h-4 w-4" />
              Bid Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Start Date
                </p>
                <p className="text-sm font-medium">
                  {formatDateTime(bid.startdate)}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  End Date
                </p>
                <p className="text-sm font-medium">{formatDateTime(bid.enddate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Currency
                </p>
                <p className="text-sm font-medium">{bid.currency || "INR"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  Payment Terms
                </p>
                <p className="text-sm font-medium">
                  {bid.paymentTerms || bid.paymentterms || "-"}
                </p>
              </div>
            </div>
            {bid.pr_number && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Linked PR
                  </p>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-sm">
                      {bid.pr_number}
                    </Badge>
                    {isPrCancelled && (
                      <Badge variant="destructive" className="text-xs" data-testid="badge-pr-cancelled">
                        PR Cancelled
                      </Badge>
                    )}
                  </div>
                </div>
              </>
            )}
            {bid.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Description
                  </p>
                  <p className="text-sm">{bid.description}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <User className="h-4 w-4" />
              People & Timelines
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4 pt-0">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Buyer</p>
                <p className="text-sm font-medium">
                  {bid.buyer_name || bid.buyer || "-"}
                </p>
                {bid.buyer_email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />
                    {bid.buyer_email}
                  </p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">
                  Requestor
                </p>
                <p className="text-sm font-medium">
                  {bid.requestor_name || "-"}
                </p>
                {bid.requestor_email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="h-3 w-3" />
                    {bid.requestor_email}
                  </p>
                )}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Delivery Location
                </p>
                <p className="text-sm font-medium">
                  {bid.delivertto_location_name || bid.shiptoaddress || "-"}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <FolderTree className="h-3 w-3" />
                  Business Entity
                </p>
                <p className="text-sm font-medium">
                  {organizations?.find(org => String(org.id) === bid.org_id)?.organization_name || "-"}
                </p>
              </div>
              {bid.budget_name ? <div>
                <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />
                  Budget
                </p>
                <div className="text-sm font-medium">
                  {bid.budget_name}
                </div>
              </div> : <></>}
            </div>

            {bidType === "Tender" && (
              <>
                <Separator />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Envelope Open Date
                    </p>
                    <p className="text-sm font-medium">
                      {formatDate(bid.env_open_date)}
                    </p>
                  </div>
                </div>
              </>
            )}

            {bid.notes_to_supplier && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">
                    Notes to Supplier
                  </p>
                  <p className="text-sm">{bid.notes_to_supplier}</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {!isDraft && (
        <div className="bg-muted/50 border rounded-md p-3 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            This bid is {bid.status}. Editing is limited.
          </span>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className={cn("grid w-full", bidType === "RFQ" ? "grid-cols-3" : "grid-cols-5")}>
          <TabsTrigger value="lines" className="gap-1" data-testid="tab-lines">
            <Package className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Scope of Work</span> (
            {lines?.length || 0})
          </TabsTrigger>
          <TabsTrigger
            value="suppliers"
            className="gap-1"
            data-testid="tab-suppliers"
          >
            <Users className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Suppliers</span> (
            {suppliers?.length || 0})
          </TabsTrigger>
          {bidType !== "RFQ" && (
            <>
              <TabsTrigger
                value="criteria"
                className="gap-1"
                data-testid="tab-criteria"
              >
                <Scale className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Evaluation Criteria</span> (
                {requirements?.length || 0})
              </TabsTrigger>
              <TabsTrigger value="team" className="gap-1" data-testid="tab-team">
                <ClipboardList className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Evaluation Team</span> (
                {approvers?.length || 0})
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="terms" className="gap-1" data-testid="tab-terms">
            <ScrollText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Terms & Instructions</span> (
            {clauses?.length || 0})
          </TabsTrigger>
        </TabsList>

        {/* LINES TAB */}
        <TabsContent value="lines" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Package className="h-4 w-4" />
                Bid Lines ({lines?.length || 0})
              </CardTitle>
              {isDraft && !bid.pr_number && (
                <Button
                  size="sm"
                  onClick={() => setAddLineSheetOpen(true)}
                  data-testid="button-add-line"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Line
                </Button>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {!lines || lines.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No lines added yet</p>
                  {isDraft && !isPrCancelled && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setAddLineSheetOpen(true)}
                      data-testid="button-add-first-line"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add First Line
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[180px]">S.No</TableHead>
                        <TableHead className="min-w-[180px]">Item</TableHead>
                        <TableHead className="min-w-[150px]">
                          Category
                        </TableHead>
                        <TableHead className="w-20 text-center">Qty</TableHead>
                        <TableHead className="w-16 text-center">UoM</TableHead>
                        <TableHead className="text-right whitespace-nowrap">
                          Unit/Expected/Indicative
                        </TableHead>
                        <TableHead className="min-w-[110px] whitespace-nowrap">
                          Required From
                        </TableHead>
                        <TableHead className="min-w-[110px] whitespace-nowrap">
                          Required By
                        </TableHead>
                        <TableHead className="min-w-[120px]">
                          Requestor
                        </TableHead>
                        {isDraft && !bid.pr_number && (
                          <TableHead className="w-12"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line: any, idx: number) => (
                        <TableRow
                          key={line.id}
                          data-testid={`row-line-${line.id}`}
                        >
                          <TableCell>
                            {idx+1 || "-"}
                          </TableCell>
                          <TableCell
                            className="font-medium max-w-[180px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[180px] cursor-default">
                                  {line.description}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.description}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell
                            className="max-w-[150px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[150px] cursor-default">
                                  {line.product_category || ""}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.product_category || ""}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-center font-medium">
                            {line.quantity || 0}
                          </TableCell>
                          <TableCell className="text-center">
                            {line.uom || "-"}
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            {formatCurrency(line.currentprice, line.currency)}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {line.needbyfrom
                              ? formatDate(line.needbyfrom)
                              : "-"}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {line.needbyto ? formatDate(line.needbyto) : "-"}
                          </TableCell>
                          <TableCell
                            className="max-w-[120px] truncate"
                          >
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-sm block truncate max-w-[180px] cursor-default">
                                  {line.created_by || "-"}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                <p>{line.created_by || "-"}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          {isDraft && !bid.pr_number && (
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {isDraft && !bid.pr_number && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => {
                                      setEditingLine(line);
                                      setLineForm({
                                        linetype: line.linetype || "Goods",
                                        description: line.description || "",
                                        uom: line.uom || "EA",
                                        quantity: String(line.quantity || 1),
                                        currentprice: String(line.currentprice || 0),
                                        currency: line.currency || bid?.currency || "INR",
                                        categoryCode: line.product_category_id || "",
                                        categoryName: line.product_category || "",
                                        itemId: line.item_id || "",
                                        itemName: line.description || "",
                                        needbyfrom: line.needbyfrom ? line.needbyfrom.substring(0, 10) : "",
                                        needbyto: line.needbyto ? line.needbyto.substring(0, 10) : "",
                                        itemCode: line.itemCode || "",
                                      });
                                      setItemEntryMode(line.item_id ? "master" : "freetext");
                                      setAddLineSheetOpen(true);
                                    }}
                                    data-testid={`button-edit-line-${line.id}`}
                                  >
                                    <Pencil className="h-4 w-4" />
                                  </Button>
                                )}
                                {isDraft && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "line",
                                        id: line.id,
                                      })
                                    }
                                    data-testid={`button-delete-line-${line.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-6 pt-4 border-t">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div>
                    <span className="text-sm font-semibold flex items-center gap-2">
                      <Paperclip className="h-4 w-4" />
                      Technical Specification Documents
                    </span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Attach technical specification documents related to
                      Products, Services added as part of Scope of Work.
                    </p>
                  </div>
                  {isDraft && !isPrCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowAddAttachmentDialog(true)}
                      data-testid="button-attach-document"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const lineAttachments =
                    attachments?.filter(
                      (a: any) =>
                        a.attach_source === "Lines" || !a.attach_source,
                    ) || [];
                  return lineAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {isDraft && (
                              <TableHead className="w-10"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {lineAttachments.map((att: any) => (
                            <TableRow
                              key={att.id}
                              data-testid={`row-attachment-${att.id}`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {att.attach_name}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {att.attach_desc || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {att.attach_source || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {att.created_by || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(att.created_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  Active
                                </Badge>
                              </TableCell>
                              {isDraft && (
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "attachment",
                                        id: att.id,
                                      })
                                    }
                                    data-testid={`button-delete-attachment-${att.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SUPPLIERS TAB */}
        <TabsContent value="suppliers" className="mt-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Users className="h-4 w-4" />
                Invited Suppliers ({suppliers?.length || 0})
              </CardTitle>
              {(isDraft || bid.status === "Published") && !isPrCancelled && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowAddSupplierDialog(true)}
                    data-testid="button-add-supplier"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Invite Supplier
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0">
              {!suppliers || suppliers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No suppliers invited yet</p>
                  {(isDraft || bid.status === "Published") && !isPrCancelled && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setShowAddSupplierDialog(true)}
                      data-testid="button-invite-first"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Invite First Supplier
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {suppliers.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-start justify-between p-3 rounded-md border"
                      data-testid={`card-supplier-${s.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm">{s.supplier_name}</p>
                        {s.supplier_site && (
                          <p className="text-sm text-muted-foreground">
                            {s.supplier_site}
                          </p>
                        )}
                        <div className="flex flex-col gap-1 mt-2">
                          {s.supplier_contact && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> {s.supplier_contact}
                            </span>
                          )}
                          {s.supplier_contact_email && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />{" "}
                              {s.supplier_contact_email}
                            </span>
                          )}
                          {s.supplier_contact_no && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Phone className="h-3 w-3" />{" "}
                              {s.supplier_contact_no}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 ml-2">
                        <Badge
                          variant={
                            s.status === "Submitted" ? "default" : "outline"
                          }
                        >
                          {s.status}
                        </Badge>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setDeleteConfirm({ type: "supplier", id: s.id })
                            }
                            data-testid={`button-remove-supplier-${s.id}`}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* EVALUATION CRITERIA TAB */}
        {bidType !== "RFQ" && (
          <TabsContent value="criteria" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Scale className="h-4 w-4" />
                    Evaluation Criteria ({requirements?.length || 0})
                  </CardTitle>
                  {/* Weight budget indicator */}
                  {(() => {
                    const totalWeight = (requirements || []).reduce(
                      (sum: number, r: any) => {
                        const w = parseInt(r.weight || "0", 10);
                        return sum + (isNaN(w) ? 0 : w);
                      },
                      0,
                    );
                    const remaining = 100 - totalWeight;
                    const isComplete = totalWeight === 100;
                    const isOver = totalWeight > 100;
                    return (
                      <p
                        className={`text-xs ${
                          isOver
                            ? "text-destructive font-medium"
                            : isComplete
                              ? "text-green-600 dark:text-green-400 font-medium"
                              : "text-muted-foreground"
                        }`}
                      >
                        {isOver
                          ? "Total evaluation weightage cannot exceed 100."
                          : isComplete
                            ? "Total weight 100/100 — weight allocation complete"
                            : `Total weight ${totalWeight}/100 — ${remaining} remaining`}
                      </p>
                    );
                  })()}
                </div>
                {isDraft && !isPrCancelled && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() => setShowAddRequirementDialog(true)}
                      data-testid="button-add-criteria"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Criteria
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                {!requirements || requirements.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Scale className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No evaluation criteria added yet</p>
                    {isDraft && !isPrCancelled && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        onClick={() => setShowAddRequirementDialog(true)}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add First Criteria
                      </Button>
                    )}
                  </div>
                ) : (
                  <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs font-medium">#</TableHead>
                        <TableHead className="text-xs font-medium">
                          Category
                        </TableHead>
                        <TableHead className="text-xs font-medium w-[40%]">
                          Question / Requirement
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Option
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Type
                        </TableHead>
                        <TableHead className="text-xs font-medium text-center">
                          Weight
                        </TableHead>
                        {isDraft && !isPrCancelled && (
                          <TableHead className="w-10"></TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requirements.map((req: any, idx: number) => (
                        <TableRow
                          key={req.id}
                          data-testid={`row-criteria-${req.id}`}
                        >
                          <TableCell className="text-muted-foreground">
                            {idx + 1}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                req.category === "General"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {req.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium text-sm">
                            {req.question}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.qvoption || "-"}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.qvtype || "-"}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {req.weight || "-"}
                          </TableCell>
                          {isDraft && !isPrCancelled && (
                            <TableCell className="flex gap-1 justify-end">
                              {isDraft && !isPrCancelled && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => {
                                    setEditingRequirement(req);
                                    setReqForm({
                                      category: req.category || "Technical",
                                      question: req.question || "",
                                      qvoption: req.qvoption || "Required",
                                      qvtype: req.qvtype || "Text",
                                      weight: String(req.weight || "100"),
                                      lovOptions: req.lov ? req.lov.split(",") : [],
                                    });
                                    setShowAddRequirementDialog(true);
                                  }}
                                  data-testid={`button-edit-criteria-${req.id}`}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {isDraft && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() =>
                                    setDeleteConfirm({
                                      type: "requirement",
                                      id: req.id,
                                    })
                                  }
                                  data-testid={`button-delete-criteria-${req.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              )}
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                <div className="mt-6 pt-4 border-t">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div>
                      <span className="text-sm font-semibold flex items-center gap-2">
                        <Paperclip className="h-4 w-4" />
                        Evaluation Criteria Documents
                      </span>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Attach any detail Evaluation Criteria documents to be used
                        during evaluation.
                      </p>
                    </div>
                    {isDraft && !isPrCancelled && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCriteriaAttachmentDialog(true)}
                        data-testid="button-attach-criteria-document"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Attach Document
                      </Button>
                    )}
                  </div>
                  {(() => {
                    const criteriaAttachments =
                      attachments?.filter(
                        (a: any) => a.attach_source === "Requirements",
                      ) || [];
                    return criteriaAttachments.length === 0 ? (
                      <div className="text-center py-4 text-muted-foreground">
                        <p className="text-sm">No documents attached yet</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                          <TableHeader>
                            <TableRow>
                              <TableHead>File Name</TableHead>
                              <TableHead>Description</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead>Last Updated By</TableHead>
                              <TableHead>Last Updated Date</TableHead>
                              <TableHead>Status</TableHead>
                              {isDraft && (
                                <TableHead className="w-10"></TableHead>
                              )}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {criteriaAttachments.map((att: any) => (
                              <TableRow
                                key={att.id}
                                data-testid={`row-criteria-attachment-${att.id}`}
                              >
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                    {att.attach_path ? (
                                      <a
                                        href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                        download
                                        className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                        data-testid={`link-download-criteria-attachment-${att.id}`}
                                      >
                                        {att.attach_name}
                                      </a>
                                    ) : (
                                      <span className="font-medium text-sm">
                                        {att.attach_name}
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="text-sm">
                                  {att.attach_desc || "-"}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="text-xs">
                                    {att.attach_source || "-"}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {att.created_by || "-"}
                                </TableCell>
                                <TableCell className="text-sm">
                                  {formatDate(att.created_date)}
                                </TableCell>
                                <TableCell>
                                  <Badge variant="secondary" className="text-xs">
                                    Active
                                  </Badge>
                                </TableCell>
                                {isDraft && (
                                  <TableCell>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() =>
                                        setDeleteConfirm({
                                          type: "attachment",
                                          id: att.id,
                                        })
                                      }
                                      data-testid={`button-delete-criteria-attachment-${att.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TEAM TAB */}
        {bidType !== "RFQ" && (
          <TabsContent value="team" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Evaluation Team ({approvers?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 space-y-4">
                <div className="text-sm text-muted-foreground space-y-1">
                  <p>
                    ** For RFP, Please add Technical and Commercial review team
                    members.
                  </p>
                  <p>
                    ** For Tender, Please add Technical, Commercial, Committee
                    review team members.
                  </p>
                </div>

                <div
                  className={cn(
                    "grid grid-cols-1 md:grid-cols-2 gap-6",
                    bidType === "Tender"
                      ? "lg:grid-cols-5"
                      : bidType === "RFP"
                        ? "lg:grid-cols-2"
                        : "lg:grid-cols-4",
                  )}
                >
                  {teamTypes.map((tt) => {
                    const members = groupedApprovers[tt] || [];
                    if (!isDraft && members.length === 0) return null;
                    const allApproverUserIds = new Set(
                      (approvers || []).map((a: any) => a.user_id),
                    );
                    const filteredUsers = (allUsers || []).filter((u: any) => {
                      if (allApproverUserIds.has(u.id)) return false;
                      const q = (teamSearchQuery[tt] || "").toLowerCase();
                      if (!q) return true;
                      return (
                        (u.name || "").toLowerCase().includes(q) ||
                        (u.user_name || "").toLowerCase().includes(q) ||
                        (u.email_id || "").toLowerCase().includes(q)
                      );
                    });

                    return (
                      <div
                        key={tt}
                        data-testid={`team-section-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                      >
                        <h4 className="text-sm font-semibold mb-3">{tt}</h4>
                        {isDraft && !isPrCancelled && (
                          <Popover
                            open={teamSearchOpen[tt] || false}
                            onOpenChange={(open) =>
                              setTeamSearchOpen((prev) => ({
                                ...prev,
                                [tt]: open,
                              }))
                            }
                          >
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className="w-full justify-between mb-3"
                                data-testid={`button-select-member-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                              >
                                <span className="text-muted-foreground">
                                  Select Member
                                </span>
                                <Search className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent
                              className="w-[300px] p-0"
                              align="start"
                            >
                              <Command>
                                <CommandInput
                                  placeholder="Search members..."
                                  value={teamSearchQuery[tt] || ""}
                                  onValueChange={(v) =>
                                    setTeamSearchQuery((prev) => ({
                                      ...prev,
                                      [tt]: v,
                                    }))
                                  }
                                  data-testid={`input-search-member-${tt.replace(/\s+/g, "-").toLowerCase()}`}
                                />
                                <CommandList>
                                  <CommandEmpty>No members found.</CommandEmpty>
                                  <CommandGroup>
                                    {filteredUsers.map((u: any) => (
                                      <CommandItem
                                        key={u.id}
                                        value={`${u.name} ${u.user_name} ${u.email_id}`}
                                        onSelect={() => {
                                          addTeamMutation.mutate({
                                            bid_team_type: tt,
                                            bid_apprs_list: String(u.id),
                                          });
                                          setTeamSearchOpen((prev) => ({
                                            ...prev,
                                            [tt]: false,
                                          }));
                                          setTeamSearchQuery((prev) => ({
                                            ...prev,
                                            [tt]: "",
                                          }));
                                        }}
                                        data-testid={`option-member-${u.id}`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                          <div className="min-w-0">
                                            <p className="text-sm font-medium truncate">
                                              {u.name || u.user_name}
                                            </p>
                                            {u.department_name && (
                                              <p className="text-xs text-muted-foreground">
                                                {u.department_name}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        )}

                        <div className="space-y-2">
                          {members.map((m: any) => (
                            <div
                              key={m.id}
                              className="flex items-center gap-2 rounded-md border px-3 py-2 w-full"
                              data-testid={`tag-member-${m.id}`}
                            >
                              <User className="h-4 w-4 text-muted-foreground shrink-0" />
                              <div className="min-w-0 flex-1">
                                <p
                                  className="text-sm font-medium truncate"
                                  title={m.user_name || `User #${m.user_id}`}
                                >
                                  {m.user_name || `User #${m.user_id}`}
                                </p>
                                <p
                                  className="text-xs text-muted-foreground truncate"
                                  title={m.user_department || "Member"}
                                >
                                  {m.user_department || "Member"}
                                </p>
                              </div>
                              {isDraft && (
                                <button
                                  onClick={() =>
                                    deleteApproverMutation.mutate(m.id)
                                  }
                                  className="text-destructive hover:text-destructive/80 ml-1 shrink-0"
                                  data-testid={`button-remove-member-${m.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          ))}
                          {members.length === 0 && !isDraft && (
                            <p className="text-sm text-muted-foreground py-2">
                              No members assigned
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {/* TERMS & INSTRUCTIONS TAB */}
        <TabsContent value="terms" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <ScrollText className="h-4 w-4" />
                Terms & Instructions ({clauses?.length || 0})
              </CardTitle>
              {isDraft && !isPrCancelled && (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowAddClauseDialog(true)}
                    data-testid="button-add-clause"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Term / Instruction
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <ScrollText className="h-3.5 w-3.5" />
                    Terms ({termsClauses.length})
                  </h4>
                  {termsClauses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No terms added
                    </p>
                  ) : (
                    termsClauses.map((c: any, idx: number) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between p-3 rounded-md border"
                        data-testid={`card-term-${c.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteConfirm({ type: "clause", id: c.id })
                            }
                            data-testid={`button-delete-term-${c.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <BookOpen className="h-3.5 w-3.5" />
                    Instructions ({instructionsClauses.length})
                  </h4>
                  {instructionsClauses.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No instructions added
                    </p>
                  ) : (
                    instructionsClauses.map((c: any, idx: number) => (
                      <div
                        key={c.id}
                        className="flex items-start justify-between p-3 rounded-md border"
                        data-testid={`card-instruction-${c.id}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{c.class_desc}</p>
                          {c.class_ref && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Ref: {c.class_ref}
                            </p>
                          )}
                        </div>
                        {isDraft && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() =>
                              setDeleteConfirm({ type: "clause", id: c.id })
                            }
                            data-testid={`button-delete-instruction-${c.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border-t pt-4 space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-2">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5" />
                    Attachments
                  </h4>
                  {isDraft && !isPrCancelled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowTermsAttachmentDialog(true)}
                      data-testid="button-add-terms-attachment"
                    >
                      <Paperclip className="h-4 w-4 mr-2" />
                      Attach Document
                    </Button>
                  )}
                </div>
                {(() => {
                  const termsAttachments =
                    attachments?.filter(
                      (a: any) => a.attach_source === "Terms",
                    ) || [];
                  return termsAttachments.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground">
                      <p className="text-sm">No documents attached yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table className="[&_td]:py-2 [&_td]:px-3 [&_th]:py-2 [&_th]:px-3">
                        <TableHeader>
                          <TableRow>
                            <TableHead>File Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Last Updated By</TableHead>
                            <TableHead>Last Updated Date</TableHead>
                            <TableHead>Status</TableHead>
                            {isDraft && (
                              <TableHead className="w-10"></TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {termsAttachments.map((att: any) => (
                            <TableRow
                              key={att.id}
                              data-testid={`row-terms-attachment-${att.id}`}
                            >
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <File className="h-4 w-4 text-muted-foreground shrink-0" />
                                  {att.attach_path ? (
                                    <a
                                      href={`/api/dbo/bids/${bidId}/attachments/${att.id}/download`}
                                      download
                                      className="font-medium text-sm text-primary hover:underline cursor-pointer"
                                      data-testid={`link-download-terms-attachment-${att.id}`}
                                    >
                                      {att.attach_name}
                                    </a>
                                  ) : (
                                    <span className="font-medium text-sm">
                                      {att.attach_name}
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-sm">
                                {att.attach_desc || "-"}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {att.attach_source || "-"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {att.created_by || "-"}
                              </TableCell>
                              <TableCell className="text-sm">
                                {formatDate(att.created_date)}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary" className="text-xs">
                                  Active
                                </Badge>
                              </TableCell>
                              {isDraft && (
                                <TableCell>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() =>
                                      setDeleteConfirm({
                                        type: "attachment",
                                        id: att.id,
                                      })
                                    }
                                    data-testid={`button-delete-terms-attachment-${att.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  );
                })()}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ADD / EDIT LINE SHEET */}
      <FormSheet
        open={addLineSheetOpen}
        onOpenChange={(open) => {
          setAddLineSheetOpen(open);
          if (!open) {
            setEditingLine(null);
            resetLineForm();
          }
        }}
        title={editingLine ? "Edit Line Item" : "Add Line Item"}
        description={editingLine ? "Update the line item details." : "Add a new line item to this bid."}
        onSubmit={() => {
          if (!lineForm.description) {
            toast({
              title: "Required",
              description: "Description is required.",
              variant: "destructive",
            });
            return;
          }
          const payload = {
            linetype: lineForm.linetype,
            description: lineForm.description,
            uom: lineForm.uom || "EA",
            quantity: parseInt(lineForm.quantity) || 1,
            currentprice: parseFloat(lineForm.currentprice) || 0,
            currency: bid?.currency || "INR",
            product_category: lineForm.categoryName || null,
            product_category_id: lineForm.categoryCode || null,
            item_id: lineForm.itemId || null,
            needbyfrom: lineForm.needbyfrom || null,
            needbyto: lineForm.needbyto || null,
          };
          if (editingLine) {
            updateLineMutation.mutate({ lineId: editingLine.id, data: payload });
          } else {
            addLineMutation.mutate(payload);
          }
        }}
        submitLabel={editingLine ? "Update Line" : "Add Line"}
        isSubmitting={addLineMutation.isPending || updateLineMutation.isPending}
        submitDisabled={!lineForm.description}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <div className="space-y-6 pb-6">
            <div className="space-y-4">
              {/* <h4 className="text-sm font-medium">Item Details</h4> */}

              {/* <div className="flex gap-2">
                <Button
                  type="button"
                  variant={itemEntryMode === "master" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setItemEntryMode("master");
                    setLineForm((f) => ({
                      ...f,
                      description: "",
                      categoryCode: "",
                      categoryName: "",
                      uom: "EA",
                      itemId: "",
                      itemName: "",
                    }));
                  }}
                  data-testid="button-item-master-mode"
                >
                  Item Master
                </Button>
                <Button
                  type="button"
                  variant={itemEntryMode === "freetext" ? "default" : "outline"}
                  size="sm"
                  onClick={() => {
                    setItemEntryMode("freetext");
                    setLineForm((f) => ({ ...f, itemId: "", itemName: "" }));
                  }}
                  data-testid="button-freetext-mode"
                >
                  Free Text
                </Button>
              </div> */}

              <div className="grid grid-cols-2 gap-4">
                {itemEntryMode === "master" ? (
                  <div className="col-span-2">
                    <Label htmlFor="line-item">Item</Label>
                    <Popover open={itemOpen} onOpenChange={setItemOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={itemOpen}
                          className="w-full justify-between font-normal"
                          data-testid="select-line-item"
                        >
                          {lineForm.itemId
                            ? `${lineForm.itemCode} - ${lineForm.itemName}`
                            : "Select Item..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[400px] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Search item..." />
                          <CommandList>
                            <CommandEmpty>No item found.</CommandEmpty>
                            <CommandGroup>
                              {items.map((item) => (
                                <CommandItem
                                  key={item.id}
                                  value={item.name}
                                  onSelect={() => {
                                    setLineForm((f) => ({
                                      ...f,
                                      itemId: item.id,
                                      itemName: item.name,
                                      description: item.name,
                                      categoryCode: item.categoryCode || "",
                                      categoryName: item.categoryName || "",
                                      uom: item.unitOfMeasure || "EA",
                                      currentprice: item.standardPrice
                                        ? String(item.standardPrice)
                                        : "0",
                                      itemCode: item.itemCode || "",
                                    }));
                                    setItemOpen(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      lineForm.itemId === item.id
                                        ? "opacity-100"
                                        : "opacity-0",
                                    )}
                                  />
                                  {item.itemCode} - {item.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {lineForm.itemId && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Category:{" "}
                        {items.find((i) => i.id === lineForm.itemId)
                          ?.categoryName || "N/A"}
                      </p>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="col-span-2">
                      <Label htmlFor="line-category">Category</Label>
                      <Popover
                        open={categoryOpen}
                        onOpenChange={setCategoryOpen}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            role="combobox"
                            aria-expanded={categoryOpen}
                            className="w-full justify-between font-normal"
                            data-testid="select-line-category"
                          >
                            {lineForm.categoryCode
                              ? categories.find(
                                (cat) => cat.code === lineForm.categoryCode,
                              )?.name
                              : "Select Category..."}
                            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[400px] p-0" align="start">
                          <Command>
                            <CommandInput placeholder="Search category..." />
                            <CommandList>
                              <CommandEmpty>No category found.</CommandEmpty>
                              <CommandGroup>
                                {categories.map((cat) => (
                                  <CommandItem
                                    key={cat.id}
                                    value={cat.name}
                                    onSelect={() => {
                                      setLineForm((f) => ({
                                        ...f,
                                        categoryCode: cat.code,
                                        categoryName: cat.name,
                                      }));
                                      setCategoryOpen(false);
                                    }}
                                  >
                                    <Check
                                      className={cn(
                                        "mr-2 h-4 w-4",
                                        lineForm.categoryCode === cat.code
                                          ? "opacity-100"
                                          : "opacity-0",
                                      )}
                                    />
                                    {cat.name}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            </CommandList>
                          </Command>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="col-span-2">
                      <Label htmlFor="line-description">Description</Label>
                      <Input
                        id="line-description"
                        placeholder="Item description"
                        value={lineForm.description}
                        onChange={(e) =>
                          setLineForm((f) => ({
                            ...f,
                            description: e.target.value,
                          }))
                        }
                        data-testid="input-line-description"
                      />
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="line-linetype">Line Type</Label>
                  <Select
                    value={lineForm.linetype}
                    onValueChange={(v) =>
                      setLineForm((f) => ({ ...f, linetype: v }))
                    }
                  >
                    <SelectTrigger
                      id="line-linetype"
                      data-testid="select-linetype"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Goods">Goods</SelectItem>
                      <SelectItem value="Service">Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="line-quantity">Quantity</Label>
                  <Input
                    id="line-quantity"
                    type="number"
                    min="1"
                    value={lineForm.quantity}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, quantity: e.target.value }))
                    }
                    data-testid="input-line-quantity"
                  />
                </div>

                <div>
                  <Label htmlFor="line-uom">Unit of Measure</Label>
                  <Select
                    value={lineForm.uom}
                    onValueChange={(value) =>
                      setLineForm((f) => ({ ...f, uom: value }))
                    }
                  >
                    <SelectTrigger id="line-uom" data-testid="select-line-uom">
                      <SelectValue placeholder="Select UoM" />
                    </SelectTrigger>
                    <SelectContent>
                      {uomOptions.length > 0 ? (
                        uomOptions.map((uom) => (
                          <SelectItem
                            key={uom.id}
                            value={uom.description || "EA"}
                          >
                            {uom.description}
                          </SelectItem>
                        ))
                      ) : (
                        <>
                          <SelectItem value="EA">Each</SelectItem>
                          <SelectItem value="KG">Kilogram</SelectItem>
                          <SelectItem value="LTR">Litre</SelectItem>
                          <SelectItem value="MTR">Metre</SelectItem>
                          <SelectItem value="PCS">Pieces</SelectItem>
                          <SelectItem value="SET">Set</SelectItem>
                          <SelectItem value="BOX">Box</SelectItem>
                          <SelectItem value="TON">Ton</SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="line-price">
                    Unit Price ({bid?.currency || "INR"})
                  </Label>
                  <Input
                    id="line-price"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    inputMode="decimal"
                    value={lineForm.currentprice}
                    onChange={(e) =>
                      setLineForm((f) => ({
                        ...f,
                        currentprice: sanitizeDecimalInput(e.target.value),
                      }))
                    }
                    onKeyDown={preventInvalidNumberKey}
                    data-testid="input-line-price"
                  />
                </div>

                <div>
                  <Label htmlFor="line-needbyfrom">Required From</Label>
                  <Input
                    id="line-needbyfrom"
                    type="date"
                    value={lineForm.needbyfrom}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, needbyfrom: e.target.value }))
                    }
                    data-testid="input-line-needbyfrom"
                  />
                </div>

                <div>
                  <Label htmlFor="line-needbyto">Required By</Label>
                  <Input
                    id="line-needbyto"
                    type="date"
                    value={lineForm.needbyto}
                    onChange={(e) =>
                      setLineForm((f) => ({ ...f, needbyto: e.target.value }))
                    }
                    data-testid="input-line-needbyto"
                  />
                </div>
              </div>
            </div>
          </div>
      </FormSheet>

      <InviteSuppliersSheet
        open={showAddSupplierDialog}
        onOpenChange={setShowAddSupplierDialog}
        excludeSupplierIds={invitedSupplierIds}
        onConfirm={inviteSelectedSuppliers}
        isConfirming={addSupplierMutation.isPending}
      />

      {/* ADD CRITERIA SHEET */}
      <FormSheet
        open={showAddRequirementDialog}
        onOpenChange={(open) => {
          setShowAddRequirementDialog(open);
          if (!open) {
            setEditingRequirement(null);
            setReqForm({
              category: "",
              question: "",
              qvoption: "Required",
              qvtype: "Text",
              weight: "100",
              lovOptions: [],
            });
            setNewLovOption("");
          }
        }}
        title={editingRequirement ? "Edit Evaluation Criteria" : "Add Evaluation Criteria"}
        description={
          editingRequirement
            ? "Update the evaluation criteria details."
            : "Add evaluation criteria used to evaluate and score bid responses."
        }
        onSubmit={() => {
          if (!reqForm.category) {
            toast({
              title: "Required",
              description: "Category is required.",
              variant: "destructive",
            });
            return;
          }
          if (!reqForm.question) {
            toast({
              title: "Required",
              description: "Requirement is required.",
              variant: "destructive",
            });
            return;
          }
          if (!reqForm.weight) {
            toast({
              title: "Required",
              description: "Weightage is required.",
              variant: "destructive",
            });
            return;
          }
          const parsedWeight = Number(reqForm.weight);
          if (
            !Number.isInteger(parsedWeight) ||
            parsedWeight < 1 ||
            parsedWeight > 100
          ) {
            toast({
              title: "Invalid Weightage",
              description: "Weightage must be between 1 and 100.",
              variant: "destructive",
            });
            return;
          }
          if (
            reqForm.qvtype === "Dropdown" &&
            reqForm.lovOptions.length === 0
          ) {
            toast({
              title: "Required",
              description: "Add at least one dropdown option.",
              variant: "destructive",
            });
            return;
          }
          const payload = {
            category: reqForm.category,
            question: reqForm.question,
            qvoption: reqForm.qvoption,
            qvtype: reqForm.qvtype,
            weight: reqForm.weight,
            lov:
              reqForm.qvtype === "Dropdown"
                ? reqForm.lovOptions.join(",")
                : null,
          };
          if (editingRequirement) {
            updateRequirementMutation.mutate(payload);
          } else {
            addRequirementMutation.mutate(payload);
          }
        }}
        submitLabel={editingRequirement ? "Update" : "Submit"}
        isSubmitting={addRequirementMutation.isPending || updateRequirementMutation.isPending}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive">*</span> Indicates mandatory fields
          </p>
          <div className="space-y-4 pb-6">
            <div>
              <Label htmlFor="criteria-category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={reqForm.category}
                onValueChange={(v) =>
                  setReqForm((f) => ({ ...f, category: v }))
                }
              >
                <SelectTrigger
                  id="criteria-category"
                  data-testid="select-criteria-category"
                >
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {businessCategories?.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="criteria-requirement">
                Requirement <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="criteria-requirement"
                placeholder="Enter Requirement"
                value={reqForm.question}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, question: e.target.value }))
                }
                rows={3}
                data-testid="input-criteria-question"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="criteria-value">
                  Value <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={reqForm.qvoption}
                  onValueChange={(v) =>
                    setReqForm((f) => ({ ...f, qvoption: v }))
                  }
                >
                  <SelectTrigger
                    id="criteria-value"
                    data-testid="select-criteria-option"
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Required">Required</SelectItem>
                    <SelectItem value="Optional">Optional</SelectItem>
                    <SelectItem value="Desirable">Desirable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="criteria-valuetype">
                  Value Type <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={reqForm.qvtype}
                  onValueChange={(v) =>
                    setReqForm((f) => ({
                      ...f,
                      qvtype: v,
                      lovOptions: v === "Text" ? [] : f.lovOptions,
                    }))
                  }
                >
                  <SelectTrigger
                    id="criteria-valuetype"
                    data-testid="select-criteria-valuetype"
                  >
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Text">Text</SelectItem>
                    <SelectItem value="Dropdown">Dropdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {reqForm.qvtype === "Dropdown" && (
              <div>
                <Label>
                  Dropdown Options <span className="text-destructive">*</span>
                </Label>
                <div className="border rounded-md">
                  {reqForm.lovOptions.length > 0 && (
                    <div className="divide-y">
                      {reqForm.lovOptions.map((opt, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-3 py-2 gap-2"
                        >
                          <span
                            className="text-sm truncate"
                            data-testid={`text-lov-option-${idx}`}
                          >
                            {opt}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={() =>
                              setReqForm((f) => ({
                                ...f,
                                lovOptions: f.lovOptions.filter(
                                  (_, i) => i !== idx,
                                ),
                              }))
                            }
                            data-testid={`button-remove-lov-${idx}`}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 p-2 border-t">
                    <Input
                      placeholder="Enter option"
                      value={newLovOption}
                      onChange={(e) => setNewLovOption(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newLovOption.trim()) {
                          e.preventDefault();
                          setReqForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                      data-testid="input-lov-option"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!newLovOption.trim()}
                      onClick={() => {
                        if (newLovOption.trim()) {
                          setReqForm((f) => ({
                            ...f,
                            lovOptions: [...f.lovOptions, newLovOption.trim()],
                          }));
                          setNewLovOption("");
                        }
                      }}
                      data-testid="button-add-lov-option"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <Label htmlFor="criteria-weight">
                Weightage (Max Points){" "}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="criteria-weight"
                type="number"
                placeholder="e.g. 20"
                min={1}
                max={90}
                step={1}
                value={reqForm.weight}
                onChange={(e) =>
                  setReqForm((f) => ({ ...f, weight: e.target.value }))
                }
                data-testid="input-criteria-weight"
              />
            </div>
          </div>
      </FormSheet>

      {/* ADD CLAUSE DIALOG */}
      <FormSheet
        open={showAddClauseDialog}
        onOpenChange={(open) => {
          setShowAddClauseDialog(open);
          if (!open) {
            setClauseForm({ type: "terms", class_desc: "", class_ref: "" });
          }
        }}
        title="Add Term / Instruction"
        description="Add a term or instruction clause to this bid."
        onSubmit={() => {
          if (!clauseForm.class_desc) {
            toast({
              title: "Required",
              description: "Description is required.",
              variant: "destructive",
            });
            return;
          }
          addClauseMutation.mutate(clauseForm);
        }}
        submitLabel="Add"
        isSubmitting={addClauseMutation.isPending}
        widthClassName="w-full sm:max-w-[420px]"
      >
          <div className="space-y-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="clause-type">Type</Label>
              <Select
                value={clauseForm.type}
                onValueChange={(v) => setClauseForm((f) => ({ ...f, type: v }))}
              >
                <SelectTrigger
                  id="clause-type"
                  data-testid="select-clause-type"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="instructions">Instructions</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clause-desc">Description</Label>
              <Textarea
                id="clause-desc"
                value={clauseForm.class_desc}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_desc: e.target.value }))
                }
                data-testid="input-clause-desc"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clause-ref">Reference (Optional)</Label>
              <Input
                id="clause-ref"
                value={clauseForm.class_ref}
                onChange={(e) =>
                  setClauseForm((f) => ({ ...f, class_ref: e.target.value }))
                }
                data-testid="input-clause-ref"
              />
            </div>
          </div>
      </FormSheet>

      {/* ATTACH DOCUMENT SHEET */}
      <FormSheet
        open={showAddAttachmentDialog}
        onOpenChange={(open) => {
          setShowAddAttachmentDialog(open);
          if (!open) {
            setAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Lines",
              attach_type: "application/pdf",
            });
            setSelectedFile(null);
          }
        }}
        title="Attach Document"
        description="Attach a technical specification document to this bid."
        onSubmit={() => {
          if (!attachForm.attach_desc) {
            toast({
              title: "Required",
              description: "Description is required.",
              variant: "destructive",
            });
            return;
          }
          if (!attachForm.attach_name) {
            toast({
              title: "Required",
              description: "Please select a file.",
              variant: "destructive",
            });
            return;
          }
          addAttachmentMutation.mutate(attachForm);
        }}
        submitLabel="Attach"
        isSubmitting={addAttachmentMutation.isPending}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <div className="space-y-6 pb-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="attach-desc">Description</Label>
                <Input
                  id="attach-desc"
                  value={attachForm.attach_desc}
                  onChange={(e) =>
                    setAttachForm((f) => ({
                      ...f,
                      attach_desc: e.target.value,
                    }))
                  }
                  placeholder="Enter description"
                  data-testid="input-attach-desc"
                />
              </div>
              <div>
                <Label htmlFor="attach-file">Attach File</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="attach-file"
                    value={attachForm.attach_name}
                    readOnly
                    placeholder="No File Chosen"
                    className="flex-1"
                    data-testid="input-attach-name"
                  />
                  <input
                    type="file"
                    className="hidden"
                    data-testid="file-input-attach"
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 5 * 1024 * 1024) {
                          toast({
                            title: "File Too Large",
                            description: "Maximum allowed size is 5MB.",
                            variant: "destructive",
                          });
                          e.target.value = "";
                          return;
                        }
                        setSelectedFile(file);
                        setAttachForm((f) => ({
                          ...f,
                          attach_name: file.name,
                          attach_type: file.type || "application/octet-stream",
                        }));
                      }
                    }}
                  />
                  <Button
                    variant="default"
                    onClick={() => {
                      const fileInput = document.querySelector(
                        '[data-testid="file-input-attach"]',
                      ) as HTMLInputElement;
                      fileInput?.click();
                    }}
                    data-testid="button-select-file"
                  >
                    Select
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum allowed size is 5MB
                </p>
              </div>
            </div>
          </div>
      </FormSheet>

      {/* CRITERIA ATTACHMENT SHEET */}
      <FormSheet
        open={showCriteriaAttachmentDialog}
        onOpenChange={(open) => {
          setShowCriteriaAttachmentDialog(open);
          if (!open) {
            setCriteriaAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Requirements",
              attach_type: "application/pdf",
            });
            setSelectedCriteriaFile(null);
          }
        }}
        title="Attach Criteria Document"
        description="Attach evaluation criteria documents to be used during bid evaluation."
        onSubmit={() => {
          if (!criteriaAttachForm.attach_desc) {
            toast({
              title: "Required",
              description: "Description is required.",
              variant: "destructive",
            });
            return;
          }
          if (!criteriaAttachForm.attach_name) {
            toast({
              title: "Required",
              description: "Please select a file.",
              variant: "destructive",
            });
            return;
          }
          addCriteriaAttachmentMutation.mutate(criteriaAttachForm);
        }}
        submitLabel="Attach"
        isSubmitting={addCriteriaAttachmentMutation.isPending}
        widthClassName="w-full sm:max-w-[600px]"
      >
          <div className="space-y-4 pb-6">
            <div>
              <Label htmlFor="criteria-attach-desc">Description</Label>
              <Input
                id="criteria-attach-desc"
                value={criteriaAttachForm.attach_desc}
                onChange={(e) =>
                  setCriteriaAttachForm((f) => ({
                    ...f,
                    attach_desc: e.target.value,
                  }))
                }
                placeholder="Enter description"
                data-testid="input-criteria-attach-desc"
              />
            </div>
            <div>
              <Label htmlFor="criteria-attach-file">Attach File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="criteria-attach-file"
                  value={criteriaAttachForm.attach_name}
                  readOnly
                  placeholder="No File Chosen"
                  className="flex-1"
                  data-testid="input-criteria-attach-name"
                />
                <input
                  type="file"
                  className="hidden"
                  data-testid="file-input-criteria-attach"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast({
                          title: "File Too Large",
                          description: "Maximum allowed size is 5MB.",
                          variant: "destructive",
                        });
                        e.target.value = "";
                        return;
                      }
                      setSelectedCriteriaFile(file);
                      setCriteriaAttachForm((f) => ({
                        ...f,
                        attach_name: file.name,
                        attach_type: file.type || "application/octet-stream",
                      }));
                    }
                  }}
                />
                <Button
                  variant="default"
                  onClick={() => {
                    const fileInput = document.querySelector(
                      '[data-testid="file-input-criteria-attach"]',
                    ) as HTMLInputElement;
                    fileInput?.click();
                  }}
                  data-testid="button-select-criteria-file"
                >
                  Select
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Maximum allowed size is 5MB
              </p>
            </div>

          </div>
      </FormSheet>

      {/* TERMS ATTACHMENT SHEET */}
      <FormSheet
        open={showTermsAttachmentDialog}
        onOpenChange={(open) => {
          setShowTermsAttachmentDialog(open);
          if (!open) {
            setTermsAttachForm({
              attach_name: "",
              attach_desc: "",
              attach_source: "Terms",
              attach_type: "application/pdf",
            });
            setSelectedTermsFile(null);
          }
        }}
        title="Attach Terms Document"
        description="Attach terms and instructions documents to this bid."
        onSubmit={() => {
          if (!termsAttachForm.attach_desc) {
            toast({
              title: "Required",
              description: "Description is required.",
              variant: "destructive",
            });
            return;
          }
          if (!termsAttachForm.attach_name) {
            toast({
              title: "Required",
              description: "Please select a file.",
              variant: "destructive",
            });
            return;
          }
          addTermsAttachmentMutation.mutate(termsAttachForm);
        }}
        submitLabel="Attach"
        isSubmitting={addTermsAttachmentMutation.isPending}
        widthClassName="w-full sm:max-w-[420px]"
      >
          <div className="space-y-4 pb-6">
            <div className="space-y-1.5">
              <Label htmlFor="terms-attach-desc">Description</Label>
              <Input
                id="terms-attach-desc"
                value={termsAttachForm.attach_desc}
                onChange={(e) =>
                  setTermsAttachForm((f) => ({
                    ...f,
                    attach_desc: e.target.value,
                  }))
                }
                placeholder="Enter description"
                data-testid="input-terms-attach-desc"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="terms-attach-file">Attach File</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="terms-attach-file"
                  value={termsAttachForm.attach_name}
                  readOnly
                  placeholder="No File Chosen"
                  className="flex-1"
                  data-testid="input-terms-attach-name"
                />
                <input
                  type="file"
                  className="hidden"
                  data-testid="file-input-terms-attach"
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg,.txt"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast({
                          title: "File Too Large",
                          description: "Maximum allowed size is 5MB.",
                          variant: "destructive",
                        });
                        e.target.value = "";
                        return;
                      }
                      setSelectedTermsFile(file);
                      setTermsAttachForm((f) => ({
                        ...f,
                        attach_name: file.name,
                        attach_type: file.type || "application/octet-stream",
                      }));
                    }
                  }}
                />
                <Button
                  variant="default"
                  onClick={() => {
                    const fileInput = document.querySelector(
                      '[data-testid="file-input-terms-attach"]',
                    ) as HTMLInputElement;
                    fileInput?.click();
                  }}
                  data-testid="button-select-terms-file"
                >
                  Select
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Maximum allowed size is 5MB
              </p>
            </div>
          </div>
      </FormSheet>

      {/* EDIT HEADER SHEET */}
      <BidFormSheet
        open={showEditHeaderDialog}
        onOpenChange={setShowEditHeaderDialog}
        editBidId={bidId}
        initialData={editBidInitialData}
        prNumber={bid?.pr_number}
      />

      {/* DELETE CONFIRMATION */}
      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove this {deleteConfirm?.type}? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* PUBLISH CONFIRMATION */}
      <AlertDialog
        open={publishConfirmOpen}
        onOpenChange={setPublishConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish Bid to Suppliers</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to publish this bid? Once published, invited
              suppliers will be able to view and respond. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-publish-cancel">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handlePublish()}
              data-testid="button-publish-confirm"
            >
              {publishBidMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SAVE AS TEMPLATE DIALOG */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save As Template</DialogTitle>
            <DialogDescription>
              Save this bid as a reusable template. Future bids can be created
              from this template.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Enter a descriptive template name"
                data-testid="input-template-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowTemplateDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!templateName.trim()) {
                  toast({
                    title: "Required",
                    description: "Template name is required.",
                    variant: "destructive",
                  });
                  return;
                }
                saveAsTemplateMutation.mutate(templateName.trim());
              }}
              disabled={saveAsTemplateMutation.isPending}
              data-testid="button-submit-template"
            >
              {saveAsTemplateMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Place Proxy Sheet */}
      <FormSheet
        open={showProxySheet}
        onOpenChange={(open) => { if (!open) setShowProxySheet(false); }}
        title="Place Proxy Bid Response"
        description="Submit a bid response on behalf of an invited vendor."
        onSubmit={
          (requirements?.length ?? 0) > 0 && proxyActiveTab === "technical"
            ? () => setProxyActiveTab("financial")
            : handleSubmitProxy
        }
        submitLabel={
          (requirements?.length ?? 0) > 0 && proxyActiveTab === "technical"
            ? "Next"
            : "Submit Response"
        }
        isSubmitting={placeProxyMutation.isPending}
        submitDisabled={
          (requirements?.length ?? 0) > 0 && proxyActiveTab === "technical"
            ? false
            : !proxySupplier
        }
        widthClassName="w-full sm:max-w-3xl"
      >
          <div className="space-y-4">
            {/* Vendor Select */}
            <div className="space-y-1">
              <Label>
                Vendor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={proxySupplier ? String(proxySupplier.supplier_id) : ""}
                onValueChange={(val) => {
                  const s = (suppliers || []).find((s: any) => String(s.supplier_id) === val);
                  setProxySupplier(s || null);
                  setProxyLines({});
                  setProxyRequirements({});
                  setProxyActiveTab("financial");
                }}
              >
                <SelectTrigger data-testid="select-proxy-vendor">
                  <SelectValue placeholder="Select vendor..." />
                </SelectTrigger>
                <SelectContent>
                  {(suppliers || []).map((s: any) => (
                    <SelectItem key={s.id} value={String(s.supplier_id)}>
                      {s.supplier_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {proxySupplier && (
              <Tabs value={proxyActiveTab} onValueChange={setProxyActiveTab}>
                <TabsList className={cn("grid w-full", (requirements?.length ?? 0) > 0 ? "grid-cols-2" : "grid-cols-1")}>
                  {(requirements?.length ?? 0) > 0 && (
                    <TabsTrigger value="technical">Technical Response</TabsTrigger>
                  )}
                  <TabsTrigger value="financial">Financial Response</TabsTrigger>
                </TabsList>

                {/* Technical Response Tab */}
                {(requirements?.length ?? 0) > 0 && (
                  <TabsContent value="technical" className="mt-3">
                    <div className="border rounded-md overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Category</TableHead>
                            <TableHead>Requirement</TableHead>
                            <TableHead className="w-32">Response</TableHead>
                            <TableHead>Remarks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {(requirements || []).map((req: any) => {
                            const entry = proxyRequirements[req.id] || { answer: "", remarks: "" };
                            return (
                              <TableRow key={req.id}>
                                <TableCell className="text-sm">{req.category}</TableCell>
                                <TableCell className="text-sm max-w-[200px] whitespace-normal">{req.question}</TableCell>
                                <TableCell>
                                  <Select
                                    value={entry.answer}
                                    onValueChange={(val) =>
                                      setProxyRequirements((prev) => ({
                                        ...prev,
                                        [req.id]: { ...entry, answer: val },
                                      }))
                                    }
                                  >
                                    <SelectTrigger className="h-8 text-xs">
                                      <SelectValue placeholder="Select..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="Yes">Yes</SelectItem>
                                      <SelectItem value="No">No</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell>
                                  <Input
                                    className="h-8 text-xs"
                                    placeholder="Remarks"
                                    value={entry.remarks}
                                    onChange={(e) =>
                                      setProxyRequirements((prev) => ({
                                        ...prev,
                                        [req.id]: { ...entry, remarks: e.target.value },
                                      }))
                                    }
                                  />
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                )}

                {/* Financial Response Tab */}
                <TabsContent value="financial" className="mt-3 space-y-4">
                  <div className="border rounded-md overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item</TableHead>
                          <TableHead className="w-20">Qty</TableHead>
                          <TableHead className="w-20">UOM</TableHead>
                          <TableHead className="w-32">Unit Price <span className="text-destructive">*</span></TableHead>
                          <TableHead className="w-32">Disc. Unit Price</TableHead>
                          <TableHead className="w-36">Promised Date <span className="text-destructive">*</span></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(lines || []).map((line: any) => {
                          const entry = proxyLines[line.id] || { bidprice: "", discprice: "", promisedDate: "" };
                          return (
                            <TableRow key={line.id}>
                              <TableCell className="text-sm">{line.description}</TableCell>
                              <TableCell className="text-sm">{line.quantity}</TableCell>
                              <TableCell className="text-sm">{line.uom}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-28"
                                  placeholder="0.00"
                                  value={entry.bidprice}
                                  min={0}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, bidprice: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  className="h-8 text-xs w-28"
                                  placeholder="0.00"
                                  value={entry.discprice}
                                  min={0}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, discprice: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="date"
                                  className="h-8 text-xs w-36"
                                  value={entry.promisedDate}
                                  min={new Date().toISOString().split("T")[0]}
                                  onChange={(e) =>
                                    setProxyLines((prev) => ({
                                      ...prev,
                                      [line.id]: { ...entry, promisedDate: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Reference & Comments */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>
                        Reference Number <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        placeholder="Enter reference number"
                        value={proxyRefNumber}
                        onChange={(e) => setProxyRefNumber(e.target.value)}
                        data-testid="input-proxy-ref-number"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>
                        Comments <span className="text-destructive">*</span>
                      </Label>
                      <Textarea
                        placeholder="Enter comments"
                        rows={2}
                        value={proxyComments}
                        onChange={(e) => setProxyComments(e.target.value)}
                        data-testid="input-proxy-comments"
                      />
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            )}

            {!proxySupplier && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Select a vendor to begin entering the proxy response.</p>
              </div>
            )}
          </div>
      </FormSheet>
    </div>
  );
}
