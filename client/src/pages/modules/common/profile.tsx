import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Briefcase,
  Building2,
  Calendar,
  Camera, Lock,
  Mail, Phone,
  Save,
  Shield,
  Trash2,
  UserCog
} from "lucide-react";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

interface UserProfile {
  id: number;
  name: string;
  email_id: string;
  user_name: string;
  salutation: string | null;
  designation: string | null;
  department_name: string | null;
  mobile_no: string | null;
  phone_no: string | null;
  mobile_ctry_code: string | null;
  phone_ctry_code: string | null;
  phone_area_code: string | null;
  manager_name: string | null;
  manager_id: string | null;
  photo_path: string | null;
  user_status: number;
  user_type: number;
  org_id: number | null;
  creation_date: string | null;
  last_login_date: string | null;
  roles: { role_name: string; role_display_name: string; description: string }[];
}

interface Department {
  id: number;
  code: string;
  value: string;
}

const profileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  salutation: z.string().optional(),
  designation: z.string().optional(),
  department_name: z.string().optional(),
  mobile_no: z.string().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[!@#$%^&*]/, "Password must contain at least one special character (!@#$%^&*)"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
}).refine((data) => data.currentPassword !== data.newPassword, {
  message: "New password cannot be the same as the current password",
  path: ["newPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function Profile() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  const authData = localStorage.getItem("prokraya-auth");
  const userEmail = authData ? JSON.parse(authData).userId : null;
  const authParsed = authData ? JSON.parse(authData) : null;
  const isSupplier = authParsed?.userRole === "ROLE_SUPPLIER_ADMIN" || authParsed?.userRole === "ROLE_SUPPLIER_USER";

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/profile", userEmail],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/profile/${encodeURIComponent(userEmail)}`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
    enabled: !!userEmail,
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/departments"],
  });

  const form = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: "",
      salutation: "",
      designation: "",
      department_name: "",
      mobile_no: "",
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: ProfileFormData) => {
      const res = await apiRequest("PATCH", `/api/profile/${profile?.id}`, { ...data, userEmail });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Profile updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile", userEmail] });
      setIsEditing(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordFormData) => {
      const res = await apiRequest("POST", `/api/profile/${profile?.id}/change-password`, {
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        userEmail,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to change password");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password changed successfully" });
      setPasswordDialogOpen(false);
      passwordForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async (photo: string) => {
      const res = await apiRequest("POST", `/api/profile/${profile?.id}/photo`, { photo });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Photo updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile", userEmail] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const removePhotoMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/profile/${profile?.id}/photo`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Photo removed successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/profile", userEmail] });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handlePhotoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ title: "Error", description: "Photo must be less than 5MB", variant: "destructive" });
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        uploadPhotoMutation.mutate(base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStartEditing = () => {
    if (profile) {
      form.reset({
        name: profile.name || "",
        salutation: profile.salutation || "",
        designation: profile.designation || "",
        department_name: profile.department_name || "",
        mobile_no: profile.mobile_no || "",
      });
      setIsEditing(true);
    }
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").substring(0, 2).toUpperCase();
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-80" />
          <Skeleton className="h-80 lg:col-span-2" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">My Profile</h1>
        <p className="text-sm text-muted-foreground">
          View and manage your personal information, photo, and password.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex flex-col items-center space-y-4">
            <div className="relative">
              <Avatar className="h-28 w-28">
                <AvatarImage src={profile?.photo_path || undefined} alt={profile?.name || "User"} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {getInitials(profile?.name || null)}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 transition-colors"
                data-testid="button-change-photo"
              >
                <Camera className="h-4 w-4" />
              </button>
              {profile?.photo_path && (
                <button
                  onClick={() => removePhotoMutation.mutate()}
                  disabled={removePhotoMutation.isPending}
                  className="absolute top-0 right-0 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-colors"
                  data-testid="button-remove-photo"
                  title="Remove photo"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoChange}
                data-testid="input-photo-upload"
              />
            </div>

            <div className="text-center space-y-1">
              <h2 className="text-lg font-semibold" data-testid="text-user-name">{profile?.name || "Unknown User"}</h2>
              <p className="text-sm text-muted-foreground" data-testid="text-user-email">{profile?.email_id}</p>
              {profile?.designation && (
                <p className="text-sm text-muted-foreground">{profile.designation}</p>
              )}
            </div>

            <div className="flex flex-wrap justify-center gap-2">
              {profile?.roles.map((role, index) => (
                <Badge key={index} variant="secondary" className="text-xs" data-testid={`badge-role-${index}`}>
                  {role.role_display_name || role.role_name}
                </Badge>
              ))}
            </div>

            <Separator className="my-2" />

            <div className="w-full space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-4 w-4" />
                <span>{profile?.department_name || "No department"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <UserCog className="h-4 w-4" />
                <span>Reports to: {profile?.manager_name || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Last login: {formatDate(profile?.last_login_date || null)}</span>
              </div>
            </div>

            <Sheet open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" className="w-full mt-4" data-testid="button-change-password">
                  <Lock className="h-4 w-4 mr-2" />
                  Change Password
                </Button>
              </SheetTrigger>
              <SheetContent className="w-[400px] sm:w-[450px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Change Password</SheetTitle>
                  <SheetDescription>
                    Enter your current password and a new password to update your credentials.
                  </SheetDescription>
                </SheetHeader>
                <Form {...passwordForm}>
                  <form onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate(data))} className="space-y-3 mt-4">
                    <FormField
                      control={passwordForm.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Enter current password" {...field} data-testid="input-current-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={passwordForm.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Enter new password" {...field} data-testid="input-new-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="rounded-md bg-muted p-2 text-xs">
                      <p className="font-medium text-foreground mb-1">Password Policy:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        <li>Minimum 8 characters</li>
                        <li>At least one uppercase letter (A-Z)</li>
                        <li>At least one lowercase letter (a-z)</li>
                        <li>At least one number (0-9)</li>
                        <li>At least one special character (!@#$%^&*)</li>
                      </ul>
                    </div>
                    <FormField
                      control={passwordForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm New Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="Confirm new password" {...field} data-testid="input-confirm-password" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <SheetFooter className="mt-4 flex gap-2">
                      <SheetClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </SheetClose>
                      <Button type="submit" disabled={changePasswordMutation.isPending} data-testid="button-submit-password">
                        {changePasswordMutation.isPending ? "Changing..." : "Change Password"}
                      </Button>
                    </SheetFooter>
                  </form>
                </Form>
              </SheetContent>
            </Sheet>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 gap-2 pb-4">
            <div>
              <CardTitle className="text-base">Profile Information</CardTitle>
              <CardDescription>Manage your personal details</CardDescription>
            </div>
            {!isEditing ? (
              <div className="flex items-center gap-2">
                <Badge variant={profile?.user_status === 1 ? "default" : "secondary"}>
                  {profile?.user_status === 1 ? "Active" : "Inactive"}
                </Badge>
                <Button variant="outline" size="sm" onClick={handleStartEditing} data-testid="button-edit-profile">
                  Edit Profile
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={form.handleSubmit((data) => updateProfileMutation.mutate(data))}
                  disabled={updateProfileMutation.isPending}
                  data-testid="button-save-profile"
                >
                  <Save className="h-4 w-4 mr-1" />
                  {updateProfileMutation.isPending ? "Saving..." : "Save"}
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {isEditing ? (
              <Form {...form}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="salutation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salutation</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value || ""}>
                          <FormControl>
                            <SelectTrigger data-testid="select-salutation">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Mr.">Mr.</SelectItem>
                            <SelectItem value="Mrs.">Mrs.</SelectItem>
                            <SelectItem value="Ms.">Ms.</SelectItem>
                            <SelectItem value="Dr.">Dr.</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter your name" {...field} data-testid="input-name" />
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
                        <FormLabel>Designation</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter designation" {...field} data-testid="input-designation" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="department_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        {!isSupplier ? 
                          <Select onValueChange={field.onChange} value={field.value || ""}>
                            <FormControl>
                              <SelectTrigger data-testid="select-department">
                                <SelectValue placeholder="Select department" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {departments.map((dept) => (
                                <SelectItem key={dept.id} value={dept.value}>
                                  {dept.value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select> : 
                          <FormControl>
                            <Input placeholder="Enter Department" {...field} data-testid="input-department" />
                          </FormControl>
                        }
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="mobile_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number</FormLabel>
                        <FormControl>
                          <PhoneInput
                            value={field.value || ""}
                            onChange={field.onChange}
                            placeholder="Enter mobile number"
                            data-testid="input-mobile"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div>
                    <Label className="text-sm font-medium">Reports To</Label>
                    <Input
                      value={profile?.manager_name || "Not assigned"}
                      disabled
                      className="mt-2 bg-muted"
                      data-testid="input-manager-readonly"
                    />
                  </div>
                </div>
              </Form>
            ) : (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Full Name</Label>
                    <p className="text-sm font-medium">{profile?.salutation} {profile?.name || "N/A"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email</Label>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Mail className="h-3.5 w-3.5" />
                      {profile?.email_id || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Designation</Label>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5" />
                      {profile?.designation || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Department</Label>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Building2 className="h-3.5 w-3.5" />
                      {profile?.department_name || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Mobile</Label>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      {profile?.mobile_ctry_code} {profile?.mobile_no || "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Reports To</Label>
                    <p className="text-sm font-medium flex items-center gap-1">
                      <UserCog className="h-3.5 w-3.5" />
                      {profile?.manager_name || "N/A"}
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <Label className="text-xs text-muted-foreground">Assigned Roles</Label>
                  <div className="mt-2 space-y-2">
                    {profile?.roles.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No roles assigned</p>
                    ) : (
                      profile?.roles.map((role, index) => (
                        <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                          <Shield className="h-4 w-4 text-primary" />
                          <div>
                            <p className="text-sm font-medium">{role.role_display_name || role.role_name}</p>
                            {role.description && (
                              <p className="text-xs text-muted-foreground">{role.description}</p>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <Separator />

                {/* <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Account Created</Label>
                    <p className="text-sm font-medium">{formatDate(profile?.creation_date || null)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Last Login</Label>
                    <p className="text-sm font-medium">{formatDate(profile?.last_login_date || null)}</p>
                  </div>
                </div> */}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
