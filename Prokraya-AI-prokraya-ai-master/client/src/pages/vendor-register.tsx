import prokrayaLogoDark from "@/assets/images/prokraya-logo-dark.png";
import prokrayaLogoLight from "@/assets/images/prokraya-logo-light.png";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PhoneInput,
  getPhoneValidationMessage,
  parsePhoneValue,
  countryOptions as phoneCountryOptions,
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  CheckCircle,
  Clock,
  Eye,
  EyeOff,
  FileCheck,
  Globe,
  Info,
  Mail,
  RefreshCw,
  Sparkles
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { z } from "zod";
import TermsConditions from "./modules/common/terms-conditions";

const vendorFeatures = [
  {
    icon: FileCheck,
    title: "Simple Onboarding",
    description: "AI-guided document upload and verification process",
  },
  {
    icon: Clock,
    title: "Fast Approval",
    description: "Streamlined review workflow with real-time status updates",
  },
  {
    icon: Globe,
    title: "Business Opportunities",
    description: "Access RFQs, tenders, and purchase orders from enterprises",
  },
  {
    icon: Briefcase,
    title: "Invoice & Payment Tracking",
    description: "Upload invoices and track payment status in real-time",
  },
];

const generateCaptcha = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const passwordPolicy = {
  minLength: 8,
  maxLength: 16,
  requireUppercase: true,
  requireNumber: true,
  requireSpecial: true,
};

function validatePasswordStrength(password: string): {
  valid: boolean;
  message: string;
} {
  if (!password) return { valid: false, message: "Please enter a password" };
  if (password.length < passwordPolicy.minLength)
    return {
      valid: false,
      message: "Password must contain a minimum of 8 characters",
    };
  if (password.length > passwordPolicy.maxLength)
    return { valid: false, message: "Password must not exceed 16 characters" };
  if (!/[A-Z]/.test(password))
    return {
      valid: false,
      message: "Password must contain at least one capital letter",
    };
  if (!/\d/.test(password))
    return {
      valid: false,
      message: "Password must contain at least one number",
    };
  if (!/[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]/.test(password))
    return {
      valid: false,
      message: "Password must contain at least one special character",
    };
  return { valid: true, message: "" };
}

const registerSchema = z
  .object({
    companyName: z.string().min(2, "Organization name is required"),
    contactName: z.string().min(2, "Contact name is required"),
    email: z.string().email("Please enter a valid email"),
    phone: z
      .string()
      .min(1, "Mobile number is required")
      .superRefine((val, ctx) => {
        if (!validatePhoneNumber(val)) {
          ctx.addIssue({
            code: "custom",
            message: getPhoneValidationMessage(val),
          });
        }
      }),
    country: z.string().min(1, "Please select country"),
    designation: z.string().optional(),
    department: z.string().optional(),
    password: z.string().refine((val) => validatePasswordStrength(val).valid, {
      message: "Password does not meet requirements",
    }),
    confirmPassword: z.string(),
    captchaValue: z.string().min(1, "Please enter captcha value"),
    acceptTerms: z
      .boolean()
      .refine((val) => val === true, "You must accept the terms"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Password and Confirm Password did not match",
    path: ["confirmPassword"],
  });

type RegisterFormData = z.infer<typeof registerSchema>;

export default function VendorRegister() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaError, setCaptchaError] = useState("");
  const { toast } = useToast();

  const [invitationId, setInvitationId] = useState<string | null>(null);
  const [tenantDomain, setTenantDomain] = useState<string | null>(null);
  const [companyNameReadOnly, setCompanyNameReadOnly] = useState(false);
  const [emailReadOnly, setEmailReadOnly] = useState(false);

  const [orgVerified, setOrgVerified] = useState<boolean | null>(null);
  const [emailVerified, setEmailVerified] = useState<boolean | null>(null);
  const [mobileVerified, setMobileVerified] = useState<boolean | null>(null);
  const [passwordError, setPasswordError] = useState("");

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaError("");
  }, []);

  const form = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      companyName: "",
      contactName: "",
      email: "",
      phone: "",
      country: "",
      designation: "",
      department: "",
      password: "",
      confirmPassword: "",
      captchaValue: "",
      acceptTerms: false,
    },
  });

  const { data: countries = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/countries"],
    queryFn: async () => {
      const res = await fetch("/api/countries");
      if (!res.ok) return [];
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    }))
  });

  useEffect(() => {
    if (countries.length === 0) return;
    let orgDetails: { org_country?: string; org_phone_no?: string } | null = null;
    try {
      const raw = localStorage.getItem("orgDetails");
      if (raw) orgDetails = JSON.parse(raw);
    } catch {
      orgDetails = null;
    }
    if (!orgDetails) return;
    if (orgDetails.org_country && !form.getValues("country")) {
      form.setValue("country", orgDetails.org_country);
    }
    if (orgDetails.org_phone_no && !form.getValues("phone")) {
      const { countryCode } = parsePhoneValue(orgDetails.org_phone_no);
      form.setValue("phone", countryCode ?? "");
    }
  }, [countries, form]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const enc = searchParams.get("enc");
    if (enc) {
      fetch(`/api/auth/invitation/${encodeURIComponent(enc)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.error) {
            toast({
              title: "Invitation Error",
              description: data.error,
              variant: "destructive",
            });
            return;
          }
          if (data.email) {
            form.setValue("email", data.email);
            setEmailReadOnly(true);
            setEmailVerified(true);
          }
          if (data.companyName) {
            form.setValue("companyName", data.companyName);
            setCompanyNameReadOnly(true);
            setOrgVerified(true);
          }
          if (data.invitationId) {
            setInvitationId(data.invitationId);
          }
          if (data.domain) {
            setTenantDomain(data.domain);
          }
        })
        .catch(() => {
          toast({ title: "Invalid invitation link", variant: "destructive" });
        });
    }
  }, []);

  const verifyOrgName = async () => {
    const val = form.getValues("companyName").trim();
    if (!val || invitationId) return;
    try {
      const res = await fetch("/api/auth/check-org-name", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: val, domain: tenantDomain }),
      });
      const data = await res.json();
      if (data.exists) {
        setOrgVerified(false);
        toast({
          title: "Organization Name Already Exists",
          variant: "destructive",
        });
      } else {
        setOrgVerified(true);
      }
    } catch {
      setOrgVerified(null);
    }
  };

  const verifyEmail = async () => {
    const val = form.getValues("email").trim();
    if (!val || invitationId) return;
    try {
      const res = await fetch("/api/auth/check-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: val, domain: tenantDomain }),
      });
      const data = await res.json();
      if (data.exists) {
        setEmailVerified(false);
        toast({ title: "Email Id Already Exists", variant: "destructive" });
      } else {
        setEmailVerified(true);
      }
    } catch {
      setEmailVerified(null);
    }
  };

  const verifyMobile = async () => {
    const val = form.getValues("phone").trim();
    if (!val) return;
    try {
      const res = await fetch("/api/auth/check-mobile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobile: val, domain: tenantDomain }),
      });
      const data = await res.json();
      if (data.exists) {
        setMobileVerified(false);
        toast({
          title: "Mobile Number Already Exists",
          variant: "destructive",
        });
      } else {
        setMobileVerified(true);
      }
    } catch {
      setMobileVerified(null);
    }
  };

  const handlePasswordBlur = () => {
    const pwd = form.getValues("password");
    const result = validatePasswordStrength(pwd);
    if (!result.valid) {
      setPasswordError(result.message);
    } else {
      setPasswordError("");
    }
  };

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const response = await apiRequest("POST", "/api/auth/register-vendor", {
        companyName: data.companyName,
        contactName: data.contactName,
        email: data.email,
        phone: data.phone,
        country: data.country,
        designation: data.designation || null,
        department: data.department || null,
        password: data.password,
        invitationId: invitationId || null,
        domain: tenantDomain || null,
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setIsComplete(true);
      } else {
        toast({
          title: "Registration failed",
          description: data.error || "Please try again",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Registration failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    if (orgVerified === false) {
      toast({
        title: "Organization Name Already Exists",
        variant: "destructive",
      });
      return;
    }
    if (emailVerified === false) {
      toast({ title: "Email Id Already Exists", variant: "destructive" });
      return;
    }
    if (mobileVerified === false) {
      toast({ title: "Mobile Number Already Exists", variant: "destructive" });
      return;
    }
    const pwdResult = validatePasswordStrength(data.password);
    if (!pwdResult.valid) {
      setPasswordError(pwdResult.message);
      return;
    }
    if (data.captchaValue !== captcha) {
      setCaptchaError("Captcha value does not match");
      refreshCaptcha();
      form.setValue("captchaValue", "");
      return;
    }
    setCaptchaError("");
    registerMutation.mutate(data);
  });

  if (isComplete) {
    return (
      <div className="min-h-screen flex">
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
          <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

          <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
            <div className="flex flex-col">
              <img
                src={prokrayaLogoLight}
                alt="Prokraya"
                className="h-10 object-contain object-left"
              />
              <span className="text-xs text-white/90 font-semibold uppercase tracking-wider ml-[48px] mt-1">
                Supplier Portal
              </span>
            </div>

            <div className="flex-1 flex flex-col justify-center max-w-md">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/20 mx-auto mb-6">
                <CheckCircle className="h-10 w-10" />
              </div>
              <h1 className="text-3xl font-bold mb-4 text-center">
                Registration Complete!
              </h1>
              <p className="text-lg text-white/80 text-center">
                Congratulations! Your account has been created successfully.
                Please check your email to activate it.
              </p>
            </div>

            <div className="flex items-center gap-8 pt-6 border-t border-white/20">
              <div>
                <p className="text-2xl font-bold">100+</p>
                <p className="text-sm text-white/70">Categories</p>
              </div>
              <div>
                <p className="text-2xl font-bold">AI</p>
                <p className="text-sm text-white/70">Powered Review</p>
              </div>
              <div>
                <p className="text-2xl font-bold">24hr</p>
                <p className="text-sm text-white/70">Fast Approval</p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-1/2 flex flex-col bg-background">
          <header className="flex items-center justify-end px-6 py-4 lg:hidden">
            <div className="flex flex-col">
              <img
                src={prokrayaLogoDark}
                alt="Prokraya"
                className="h-8 object-contain object-left"
              />
            </div>
          </header>

          <main className="flex-1 flex items-center justify-center p-6">
            <Card className="w-full max-w-md text-center">
              <CardContent className="pt-8 pb-8">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10 mx-auto mb-6">
                  <CheckCircle className="h-8 w-8 text-emerald-500" />
                </div>
                <h2
                  className="text-2xl font-bold mb-2"
                  data-testid="text-registration-success"
                >
                  Registration Submitted!
                </h2>
                <p className="text-muted-foreground mb-6">
                  Congratulations! Your account has been created successfully.
                  Please check your email to activate it.
                </p>
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 mb-6">
                  <div className="flex items-center gap-2 justify-center text-sm">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="font-medium">What happens next?</span>
                  </div>
                  <ul className="text-xs text-muted-foreground mt-2 space-y-1 text-left">
                    <li>1. You'll receive login credentials via email</li>
                    <li>
                      2. Log in to complete your profile and upload documents
                    </li>
                    <li>
                      3. Our AI will validate and guide you through the process
                    </li>
                    <li>4. Once complete, submit for final approval</li>
                  </ul>
                </div>
                <Link href="/login">
                  <Button className="w-full" data-testid="button-go-to-login">
                    Go to Login
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
        <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <div className="flex flex-col">
            <img
              src={prokrayaLogoLight}
              alt="Prokraya"
              className="h-10 object-contain object-left"
            />
            <span className="text-xs text-white/90 font-semibold uppercase tracking-wider ml-[48px] mt-1">
              Supplier Portal
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-md mt-[-40px]">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4 leading-tight">
                Join Our Supplier Network
              </h1>
              <p className="text-lg text-white/80">
                Register to access procurement opportunities from leading
                enterprises.
              </p>
            </div>

            <div className="space-y-4">
              {vendorFeatures.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur"
                >
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-white/70">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 pt-6 border-t border-white/20">
            <div>
              <p className="text-2xl font-bold">100+</p>
              <p className="text-sm text-white/70">Categories</p>
            </div>
            <div>
              <p className="text-2xl font-bold">AI</p>
              <p className="text-sm text-white/70">Powered Review</p>
            </div>
            <div>
              <p className="text-2xl font-bold">24hr</p>
              <p className="text-sm text-white/70">Fast Approval</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col bg-background">
        <header className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="ghost"
                size="icon"
                data-testid="button-back-to-login"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div className="flex flex-col lg:hidden">
              <img
                src={prokrayaLogoDark}
                alt="Prokraya"
                className="h-8 object-contain object-left"
              />
            </div>
          </div>
          <Link
            href="/login"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Already a member?{" "}
            <span className="text-primary font-medium">Sign In</span>
          </Link>
        </header>

        <main className="flex-1 flex items-start justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-lg">
            <div className="mb-6">
              <h1
                className="text-2xl font-bold text-primary mb-1"
                data-testid="text-register-title"
              >
                Sign Up
              </h1>
              {invitationId && (
                <p className="text-sm text-muted-foreground">
                  You've been invited to register. Some fields are pre-filled.
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Organization Name */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="companyName"
                  className="text-sm flex items-center gap-1.5"
                >
                  Organization Name <span className="text-destructive">*</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Organization Name as per your Trade License
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <div className="relative">
                  <Input
                    id="companyName"
                    placeholder="Enter your organization name"
                    className={`h-10 ${companyNameReadOnly ? "bg-muted text-muted-foreground cursor-not-allowed select-none" : ""}`}
                    {...form.register("companyName")}
                    readOnly={companyNameReadOnly}
                    onBlur={verifyOrgName}
                    data-testid="input-company-name"
                  />
                  {orgVerified === true && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                  {orgVerified === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {form.formState.errors.companyName && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.companyName.message}
                  </p>
                )}
                {orgVerified === false && (
                  <p className="text-xs text-destructive">
                    Organization Name Already Exists
                  </p>
                )}
              </div>

              {/* Contact Name */}
              <div className="space-y-1.5">
                <Label htmlFor="contactName" className="text-sm">
                  Contact Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="contactName"
                  placeholder="Enter your full name"
                  className="h-10"
                  {...form.register("contactName")}
                  data-testid="input-contact-name"
                />
                {form.formState.errors.contactName && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.contactName.message}
                  </p>
                )}
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label
                  htmlFor="email"
                  className="text-sm flex items-center gap-1.5"
                >
                  Email Id <span className="text-destructive">*</span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>Email Id is your Username!</TooltipContent>
                  </Tooltip>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="supplier@company.com"
                    className={`pl-9 h-10 ${emailReadOnly ? "bg-muted text-muted-foreground cursor-not-allowed select-none" : ""}`}
                    {...form.register("email")}
                    readOnly={emailReadOnly}
                    onBlur={verifyEmail}
                    data-testid="input-email"
                  />
                  {emailVerified === true && (
                    <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                  )}
                  {emailVerified === false && (
                    <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                  )}
                </div>
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {form.formState.errors.email.message}
                  </p>
                )}
                {emailVerified === false && (
                  <p className="text-xs text-destructive">
                    Email Id Already Exists
                  </p>
                )}
              </div>

              {/* Mobile Number & Country */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Mobile Number <span className="text-destructive">*</span>
                  </Label>
                  <PhoneInput
                    value={form.watch("phone")}
                    onChange={(v) => {
                      form.setValue("phone", v, { shouldValidate: true });
                      setMobileVerified(null);
                    }}
                    onBlur={async () => {
                      const val = form.getValues("phone");
                      if (val) {
                        if (!validatePhoneNumber(val)) {
                          form.setError("phone", {
                            type: "manual",
                            message: getPhoneValidationMessage(val),
                          });
                          setMobileVerified(null);
                        } else {
                          form.clearErrors("phone");
                          await verifyMobile();
                        }
                      } else {
                        setMobileVerified(null);
                      }
                    }}
                    placeholder="50 123 4567"
                    data-testid="input-phone"
                  />
                  {form.formState.errors.phone && (
                    <p className="text-xs text-destructive">
                      {String(form.formState.errors.phone.message)}
                    </p>
                  )}
                  {mobileVerified === false && (
                    <p className="text-xs text-destructive">
                      Mobile Number Already Exists
                    </p>
                  )}
                  {mobileVerified === true && (
                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> Verified
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Country <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={form.watch("country")}
                    onValueChange={(v) => form.setValue("country", v)}
                  >
                    <SelectTrigger
                      className="h-10"
                      data-testid="select-country"
                    >
                      <SelectValue placeholder="Select country" />
                    </SelectTrigger>
                    <SelectContent>
                      {countries.map((country) => (
                        <SelectItem key={country.value} value={country.value}>
                          {country.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.formState.errors.country && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.country.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Designation & Department */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="designation" className="text-sm">
                    Designation
                  </Label>
                  <Input
                    id="designation"
                    placeholder="e.g. Manager"
                    className="h-10"
                    {...form.register("designation")}
                    data-testid="input-designation"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="department" className="text-sm">
                    Department
                  </Label>
                  <Input
                    id="department"
                    placeholder="e.g. Sales"
                    className="h-10"
                    {...form.register("department")}
                    data-testid="input-department"
                  />
                </div>
              </div>

              {/* Password & Confirm Password */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="password"
                    className="text-sm flex items-center gap-1.5"
                  >
                    Password <span className="text-destructive">*</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[280px]">
                        Password should be 8-16 Characters, 1 Numerical
                        Character, 1 Upper Case and at least one Special
                        Character
                      </TooltipContent>
                    </Tooltip>
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Create password"
                      className="pr-10 h-10"
                      {...form.register("password")}
                      onBlur={handlePasswordBlur}
                      data-testid="input-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {passwordError && (
                    <p className="text-xs text-destructive">{passwordError}</p>
                  )}
                  {form.formState.errors.password && !passwordError && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirmPassword" className="text-sm">
                    Confirm Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm password"
                      className="pr-10 h-10"
                      {...form.register("confirmPassword")}
                      data-testid="input-confirm-password"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-xs text-destructive">
                      {form.formState.errors.confirmPassword.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Captcha */}
              <div className="grid grid-cols-2 gap-4 items-start">
                <div className="space-y-1.5">
                  <Label className="text-sm">Captcha</Label>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-10 bg-muted rounded-md flex items-center justify-center select-none overflow-hidden relative">
                      <div className="absolute inset-0 opacity-20">
                        <svg className="w-full h-full">
                          <line
                            x1="0"
                            y1="50%"
                            x2="100%"
                            y2="30%"
                            stroke="currentColor"
                            strokeWidth="1"
                          />
                          <line
                            x1="0"
                            y1="30%"
                            x2="100%"
                            y2="70%"
                            stroke="currentColor"
                            strokeWidth="1"
                          />
                          <line
                            x1="20%"
                            y1="0"
                            x2="80%"
                            y2="100%"
                            stroke="currentColor"
                            strokeWidth="1"
                          />
                        </svg>
                      </div>
                      <span
                        className="text-lg font-mono tracking-[0.2em] font-bold text-foreground relative z-10"
                        style={{
                          fontStyle: "italic",
                          textShadow: "1px 1px 2px rgba(0,0,0,0.1)",
                        }}
                      >
                        {captcha}
                      </span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={refreshCaptcha}
                      data-testid="button-refresh-captcha"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">
                    Enter Captcha Value{" "}
                    <span className="text-destructive">*</span>
                  </Label>
                  {/* preserve react-hook-form handlers while adding our own blur/change behavior */}
                  {(() => {
                    const captchaRegister = form.register("captchaValue");

                    return (
                      <Input
                        placeholder="Enter captcha"
                        className="h-10"
                        {...captchaRegister}
                        onChange={(e) => {
                          captchaRegister.onChange?.(e);
                          if (captchaError) {
                            setCaptchaError("");
                          }
                        }}
                        onBlur={(e) => {
                          captchaRegister.onBlur?.(e);
                          const val = form.getValues("captchaValue");
                          if (!val) return;
                          if (val !== captcha) {
                            setCaptchaError("Captcha value does not match");
                          } else {
                            setCaptchaError("");
                          }
                        }}
                        data-testid="input-captcha"
                      />
                    );
                  })()}
                  {(captchaError || form.formState.errors.captchaValue) && (
                    <p className="text-xs text-destructive">
                      {captchaError ||
                        form.formState.errors.captchaValue?.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Terms & Submit */}
              <div className="flex items-center justify-between gap-4 flex-wrap pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={form.watch("acceptTerms")}
                    onCheckedChange={(checked) =>
                      form.setValue("acceptTerms", checked as boolean)
                    }
                    data-testid="checkbox-terms"
                  />
                  <Label
                    htmlFor="acceptTerms"
                    className="text-sm cursor-pointer"
                  >
                    I accept{" "}
                    <TermsConditions type="Signup" dataTestId="signup-link-terms" />
                  </Label>
                </div>
                <Button
                  type="submit"
                  disabled={registerMutation.isPending}
                  data-testid="button-signup"
                >
                  {registerMutation.isPending ? "Signing Up..." : "Sign Up"}
                </Button>
              </div>
              {form.formState.errors.acceptTerms && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.acceptTerms.message}
                </p>
              )}
            </form>
          </div>
        </main>

        <footer className="px-6 py-3 text-[11px] text-muted-foreground text-center border-t">
          Copyright &copy; {new Date().getFullYear()} Prokraya Tech Private
          Limited. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
