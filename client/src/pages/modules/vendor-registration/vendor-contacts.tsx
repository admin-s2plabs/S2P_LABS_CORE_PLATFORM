import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getDialCodeByIso,
  getPhoneValidationMessage,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation } from "wouter";
import { z } from "zod";

const contactSchema = z.object({
  contact_name: z.string().min(1, "Contact name is required"),
  contact_category: z.string().min(1, "Contact category is required"),
  email: z.string().email("Valid email is required"),
  mobile: z
    .string().min(1, "Mobile number is required")
    .superRefine((v, ctx) => {
      if (v && !validatePhoneNumber(v)) {
        ctx.addIssue({ code: "custom", message: getPhoneValidationMessage(v) });
      }
    }),
  department: z.string().min(1, "Department is required"),
  designation: z.string().min(1, "Designation is required"),
  is_primary: z.string().optional(),
  is_auth_signatory: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

const referenceSchema = z.object({
  ref_company_name: z.string().min(1, "Company name is required"),
  contact_name: z.string().min(1, "Contact name is required"),
  designation: z.string().min(1, "Department is required"),
  department: z.string().min(1, "Department is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().min(1, "Mobile number is required")
    .superRefine((v, ctx) => {
      if (v && !validatePhoneNumber(v)) {
        ctx.addIssue({ code: "custom", message: getPhoneValidationMessage(v) });
      }
    }),
  ref_city: z.string().optional(),
  ref_country: z.string().optional(),
  scope_work: z.string().optional(),
  ac_amount: z.string().optional(),
  currency: z.string().optional(),
});

type ReferenceFormData = z.infer<typeof referenceSchema>;

const contactCategories = [
  { value: "Sales Services", label: "Sales Services" },
  { value: "Finance", label: "Finance" },
  { value: "Management", label: "Management" },
];

export default function VendorContacts() {
  const [location, setLocation] = useLocation();
  const isVendorRegistrationWizard = location.startsWith("/vendor/register");
  const { toast } = useToast();
  const storedAuthStr = localStorage.getItem("prokraya-auth");
  const parsedAuth = storedAuthStr ? JSON.parse(storedAuthStr) : null;
  const vendorStatus = parsedAuth?.vendorStatus;
  const { data: profile } = useQuery<any>({
    queryKey: ["/api/vendor/profile"],
  });
  const isEditMode =
    profile?.status &&
    ["Approved", "Active", "InActive", "Changes In Draft", "More Info Required", "More Information Required"].includes(
      profile?.status,
    );
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<any>(null);
  const [refSheetOpen, setRefSheetOpen] = useState(false);
  const [editingRef, setEditingRef] = useState<any>(null);

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
  }, []);

  const { data: contacts, isLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor/contacts"],
  });

  const { data: references, isLoading: refsLoading } = useQuery<any[]>({
    queryKey: ["/api/vendor/references"],
  });

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
    defaultValues: {
      contact_name: "",
      contact_category: "",
      email: "",
      mobile: "",
      department: "",
      designation: "",
      is_primary: "No",
      is_auth_signatory: "No",
    },
  });

  const refForm = useForm<ReferenceFormData>({
    resolver: zodResolver(referenceSchema),
    defaultValues: {
      ref_company_name: "",
      contact_name: "",
      designation: "",
      department: "",
      email: "",
      phone: "",
      ref_city: "",
      ref_country: "",
      scope_work: "",
      ac_amount: "",
      currency: "AED",
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ContactFormData) =>
      apiRequest("POST", "/api/vendor/contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      setSheetOpen(false);
      form.reset();
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      }
      toast({ title: "Contact added successfully" });
    },
    onError: () =>
      toast({ title: "Failed to add contact", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: ContactFormData & { id: number }) =>
      apiRequest("PATCH", `/api/vendor/contacts/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
        const storedAuth = localStorage.getItem("prokraya-auth");
        if (storedAuth) {
          const parsed = JSON.parse(storedAuth);
          if (parsed.vendorStatus === "Approved")
            parsed.vendorStatus = "Changes In Draft";
          localStorage.setItem("prokraya-auth", JSON.stringify(parsed));
        }
      }
      setSheetOpen(false);
      setEditingContact(null);
      form.reset();
      toast({
        title: isEditMode
          ? "Contact updated. Submit for approval when ready."
          : "Contact updated successfully",
      });
    },
    onError: () =>
      toast({ title: "Failed to update contact", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      }
      toast({ title: "Contact removed" });
    },
    onError: (error: any) =>
      toast({ title: "Failed to remove contact", description: error.message, variant: "destructive" }),
  });

  const createRefMutation = useMutation({
    mutationFn: (data: ReferenceFormData) =>
      apiRequest("POST", "/api/vendor/references", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      }
      setRefSheetOpen(false);
      refForm.reset();
      toast({ title: "Reference added successfully" });
    },
    onError: () =>
      toast({ title: "Failed to add reference", variant: "destructive" }),
  });

  const updateRefMutation = useMutation({
    mutationFn: (data: ReferenceFormData & { id: number }) =>
      apiRequest("PATCH", `/api/vendor/references/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      setRefSheetOpen(false);
      setEditingRef(null);
      refForm.reset();
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      }
      toast({ title: "Reference updated successfully" });
    },
    onError: () =>
      toast({ title: "Failed to update reference", variant: "destructive" }),
  });

  const deleteRefMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/vendor/references/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      if (isEditMode) {
        const suppId = profile?.id || parsedAuth?.supplierId;
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId] });
        queryClient.invalidateQueries({ queryKey: ["/api/dbo/suppliers", suppId, "changes"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/contacts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/references"] });
      }
      toast({ title: "Reference removed" });
    },
    onError: () =>
      toast({ title: "Failed to remove reference", variant: "destructive" }),
  });

  function openAddSheet() {
    setEditingContact(null);
    form.reset({
      contact_name: "",
      contact_category: "",
      email: "",
      mobile: "",
      department: "",
      designation: "",
      is_primary: "No",
      is_auth_signatory: "No",
    });
    setSheetOpen(true);
  }

  const orgDialCode = getDialCodeByIso(profile?.country);

  function openEditSheet(contact: any) {
    setEditingContact(contact);
    form.reset({
      contact_name: contact.contact_name || "",
      contact_category: contact.contact_category || "",
      email: contact.email || "",
      mobile: contact.mobile || "",
      department: contact.department || "",
      designation: contact.designation || "",
      is_primary: contact.is_primary || "No",
      is_auth_signatory: contact.is_auth_signatory || "No",
    });
    setSheetOpen(true);
  }

  function onSubmit(data: ContactFormData) {
    if (data.is_primary === "Yes") {
      const existingPrimary = contacts?.find(
        (c: any) =>
          c.contact_category === data.contact_category &&
          c.is_primary === "Yes" &&
          c.id !== editingContact?.id,
      );
      if (existingPrimary) {
        toast({
          title: `A primary contact for "${data.contact_category}" already exists`,
          description: `${existingPrimary.contact_name} is already set as the primary contact for this category.`,
          variant: "destructive",
        });
        return;
      }
    }
    if (editingContact) {
      updateMutation.mutate({ ...data, id: editingContact.id });
    } else {
      createMutation.mutate(data);
    }
  }

  function openAddRefSheet() {
    setEditingRef(null);
    refForm.reset({
      ref_company_name: "",
      contact_name: "",
      designation: "",
      department: "",
      email: "",
      phone: "",
      ref_city: "",
      ref_country: "",
      scope_work: "",
      ac_amount: "",
      currency: "AED",
    });
    setRefSheetOpen(true);
  }

  function openEditRefSheet(ref: any) {
    setEditingRef(ref);
    refForm.reset({
      ref_company_name: ref.ref_company_name || "",
      contact_name: ref.contact_name || "",
      designation: ref.designation || "",
      department: ref.department || "",
      email: ref.email || "",
      phone: ref.phone || "",
      ref_city: ref.ref_city || "",
      ref_country: ref.ref_country || "",
      scope_work: ref.scope_work || "",
      ac_amount: ref.ac_amount || "",
      currency: ref.currency || "AED",
    });
    setRefSheetOpen(true);
  }

  function onRefSubmit(data: ReferenceFormData) {
    if (editingRef) {
      updateRefMutation.mutate({ ...data, id: editingRef.id });
    } else {
      createRefMutation.mutate(data);
    }
  }

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {isEditMode && profile?.attribute_4 === "Active" && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const suppId = profile?.id || parsedAuth?.supplierId;
            setLocation(suppId ? `/app/vendors/${suppId}` : "/app/dashboard");
          }}
          data-testid="button-back-to-profile"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Profile
        </Button>
      )}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2
            className="text-base font-semibold tracking-tight"
            data-testid="text-contacts-title"
          >
            Contact Details
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Please provide at least one Sales and one Finance contact.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
          <CardTitle className="text-sm">Contacts</CardTitle>
          <Button
            size="sm"
            onClick={openAddSheet}
            data-testid="button-add-contact"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Contact
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {contacts && contacts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium">Name</TableHead>
                  <TableHead className="text-xs font-medium">
                    Category
                  </TableHead>
                  <TableHead className="text-xs font-medium">Email</TableHead>
                  <TableHead className="text-xs font-medium">Mobile</TableHead>
                  <TableHead className="text-xs font-medium">
                    Department
                  </TableHead>
                  <TableHead className="text-xs font-medium">Primary</TableHead>
                  <TableHead className="text-xs font-medium w-[80px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact: any) => (
                  <TableRow
                    key={contact.id}
                    data-testid={`row-contact-${contact.id}`}
                  >
                    <TableCell className="text-sm py-2 font-medium">
                      {contact.contact_name}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      <Badge variant="secondary">
                        {contact.contact_category}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {contact.email}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {contact.mobile || "-"}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {contact.department || "-"}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {contact.is_primary === "Yes" ? (
                        <Badge>Primary</Badge>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditSheet(contact)}
                          data-testid={`button-edit-contact-${contact.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(contact.id)}
                          data-testid={`button-delete-contact-${contact.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No contacts are added yet!</p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-1 pt-2">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <h2
            className="text-base font-semibold tracking-tight"
            data-testid="text-references-title"
          >
            Reference Details
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">
          Add reference companies you have worked with previously.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 py-3 px-4">
          <CardTitle className="text-sm">References</CardTitle>
          <Button
            size="sm"
            onClick={openAddRefSheet}
            data-testid="button-add-reference"
          >
            <Plus className="h-4 w-4 mr-1" /> Add Reference
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {refsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : references && references.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium">
                    Contact Name
                  </TableHead>
                  <TableHead className="text-xs font-medium">Company</TableHead>
                  <TableHead className="text-xs font-medium">
                    Contact Number
                  </TableHead>
                  <TableHead className="text-xs font-medium">
                    Email ID
                  </TableHead>
                  <TableHead className="text-xs font-medium w-[80px]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {references.map((ref: any) => (
                  <TableRow
                    key={ref.id}
                    data-testid={`row-reference-${ref.id}`}
                  >
                    <TableCell className="text-sm py-2">
                      <div>
                        <span className="font-medium">{ref.contact_name}</span>
                        {(ref.designation || ref.department) && (
                          <span className="text-muted-foreground text-xs block">
                            {[ref.designation, ref.department]
                              .filter(Boolean)
                              .join(", ")}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {ref.ref_company_name}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {ref.phone || "-"}
                    </TableCell>
                    <TableCell className="text-sm py-2">
                      {ref.email || "-"}
                    </TableCell>
                    <TableCell className="py-2">
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditRefSheet(ref)}
                          data-testid={`button-edit-reference-${ref.id}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteRefMutation.mutate(ref.id)}
                          data-testid={`button-delete-reference-${ref.id}`}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Building2 className="h-12 w-12 mb-3 opacity-40" />
              <p className="text-sm">No references are added yet!</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditingContact(null);
            form.reset();
          }
        }}
      >
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-base">
              {editingContact ? "Edit Contact" : "Add Contact"}
            </SheetTitle>
          </SheetHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Contact Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-contact-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="contact_category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Category <span className="text-destructive">*</span>
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-contact-category">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {contactCategories.map((c) => (
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Email <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        data-testid="input-contact-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-contact-department"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-contact-designation"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="mobile"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <PhoneInput
                          value={field.value || ""}
                          onChange={field.onChange}
                          defaultCountryCode={orgDialCode}
                          placeholder="50 123 4567"
                          data-testid="input-contact-mobile"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_primary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Primary Contact</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-is-primary">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="is_auth_signatory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authorized Signatory</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-auth-signatory">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Yes">Yes</SelectItem>
                          <SelectItem value="No">No</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createMutation.isPending || updateMutation.isPending
                  }
                  data-testid="button-save-contact"
                >
                  {(createMutation.isPending || updateMutation.isPending) && (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  {editingContact ? "Update" : "Add"} Contact
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>

      <Sheet
        open={refSheetOpen}
        onOpenChange={(open) => {
          setRefSheetOpen(open);
          if (!open) {
            setEditingRef(null);
            refForm.reset();
          }
        }}
      >
        <SheetContent className="w-[50vw] sm:max-w-[50vw] overflow-y-auto p-4">
          <SheetHeader className="mb-3">
            <SheetTitle className="text-base">
              {editingRef ? "Edit Reference" : "Add Reference"}
            </SheetTitle>
          </SheetHeader>
          <Form {...refForm}>
            <form
              onSubmit={refForm.handleSubmit(onRefSubmit)}
              className="space-y-3"
            >
              <FormField
                control={refForm.control}
                name="ref_company_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Company Name <span className="text-destructive">*</span>
                    </FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-ref-company-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={refForm.control}
                  name="contact_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Contact Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          data-testid="input-ref-contact-name"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={refForm.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation <span className="text-destructive">*</span></FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="input-ref-designation" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={refForm.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Department <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-ref-department" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={refForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        {...field}
                        data-testid="input-ref-email"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={refForm.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone <span className="text-destructive">*</span></FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value || ""}
                        onChange={field.onChange}
                        placeholder="50 123 4567"
                        data-testid="input-ref-phone"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end gap-2 mt-4 pt-3 border-t">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRefSheetOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    createRefMutation.isPending || updateRefMutation.isPending
                  }
                  data-testid="button-save-reference"
                >
                  {(createRefMutation.isPending ||
                    updateRefMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    )}
                  {editingRef ? "Update" : "Add"} Reference
                </Button>
              </div>
            </form>
          </Form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
