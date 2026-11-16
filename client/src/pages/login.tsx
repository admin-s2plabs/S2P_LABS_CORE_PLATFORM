import s2pLabsLogo from "@/assets/images/s2plabs_logo.jpeg";
import { AuthFooter } from "@/components/auth-footer";
import { AuthSideArt } from "@/components/auth-illustrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { encryptPassword } from "@/lib/password-crypto";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Globe,
  Loader2,
  Lock,
  Mail,
  Smartphone
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const otpSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  otp: z.string().optional(),
}).refine((data) => {
  if (data.otp) {
    return data.otp.length === 6 ? true : false;
  }
  return true;
}, {
  message: "OTP must be 6 digits",
  path: ["otp"],
});

type LoginFormData = z.infer<typeof loginSchema>;

type OTPFormData = z.infer<typeof otpSchema>;

interface LoginProps {
  onLogin: (role: "vendor" | "staff", userId: string, orgId?: string, userName?: string, vendorStatus?: string, email?: string, userNameId?: string, supplierId?: string) => void;
}

function getDomainFromHostname(): { domain: string; isSubdomain: boolean; isLocal: boolean; baseDomain: string } {
  const hostname = window.location.hostname;
  const parts = hostname.split(".");

  const isLocal = hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "prokraya" ||
    hostname === "prokrayaai" ||
    hostname.endsWith(".replit.dev") ||
    hostname.endsWith(".replit.app");

  let domain = "";
  let isSubdomain = false;
  let baseDomain = hostname;

  if (parts.length > 2 && parts[0] !== "www") {
    domain = parts[0];
    isSubdomain = true;
    baseDomain = parts.slice(1).join(".");
  } else if (parts.length === 2 && (parts[1] === "localhost" || parts[1] === "local" || parts[1] === "prokraya" || parts[1] === "prokrayaai")) {
    domain = parts[0];
    isSubdomain = true;
    baseDomain = parts[1];
  } else if (parts.length === 1 || isLocal) {
    baseDomain = hostname;
  }

  return { domain, isSubdomain, isLocal, baseDomain };
}

// ──────────────────────────────────────────────────────────────
// DEVELOPER CONFIG: Set to true to show the domain field on the
// login page. When false, domain is auto-resolved from the URL
// subdomain (production) or skipped entirely (localhost/dev).
// Useful for testing multi-tenant login on localhost.
const SHOW_DOMAIN_FIELD = true;

// Show the "Other signin options" block (Sign in with OTP, Google, Microsoft).
// Hidden for S2P; set to true to bring it back.
const SHOW_ALTERNATE_SIGNIN = false;
// ──────────────────────────────────────────────────────────────

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M23.52 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.87c2.27-2.09 3.58-5.17 3.58-8.82Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.46 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.11A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.6H1.27a12 12 0 0 0 0 10.8l4-3.11Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.6l4 3.11C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export default function Login({ onLogin }: LoginProps) {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const hostInfo = useMemo(() => getDomainFromHostname(), []);

  const [domainName, setDomainName] = useState(hostInfo.domain);
  const [domainLocked, setDomainLocked] = useState(hostInfo.isSubdomain);
  const [domainVerified, setDomainVerified] = useState(hostInfo.isLocal);
  const [domainError, setDomainError] = useState("");
  const [tenantInfo, setTenantInfo] = useState<{ companyName?: string } | null>(null);
  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"send" | "verify">("send");
  const [otpTimer, setOtpTimer] = useState(0);

  const domainFieldVisible = SHOW_DOMAIN_FIELD || (!hostInfo.isLocal && !hostInfo.isSubdomain);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const otpForm = useForm<OTPFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { email: "", otp: "" },
  });

  const verifyDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const response = await apiRequest("GET", `/api/auth/verify-domain/${encodeURIComponent(domain)}`);
      return response.json();
    },
    onSuccess: (data) => {
      if (data.valid) {
        const targetDomain = data.domain;
        const currentUrl = new URL(window.location.href);

        // If we are not yet on the target subdomain, redirect (skip for localhost/127.0.0.1 for testing)
        const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        if (!isLocalhost && (!hostInfo.isSubdomain || hostInfo.domain !== targetDomain)) {
          const newHostname = `${targetDomain}.${hostInfo.baseDomain}`;
          window.location.href = `${currentUrl.protocol}//${newHostname}${currentUrl.port ? ':' + currentUrl.port : ''}${currentUrl.pathname}`;
          return;
        }

        setDomainVerified(true);
        setDomainError("");
        setTenantInfo({ companyName: data.companyName });
        localStorage.setItem("tenantDomain", data.domain);
      } else {
        const errorMsg = data.message || "Domain not registered. Please check your domain name or contact your administrator.";
        setDomainError(errorMsg);
        setDomainVerified(false);
        toast({
          title: "Domain Error",
          description: errorMsg,
          variant: "destructive",
        });
      }
    },
    onError: () => {
      const errorMsg = "Unable to verify domain. Please try again.";
      setDomainError(errorMsg);
      setDomainVerified(false);
      toast({
        title: "Domain Error",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (hostInfo.isLocal) {
      setDomainVerified(true);
      return;
    }
    const initialDomain = hostInfo.domain || domainName || localStorage.getItem("tenantDomain") || "";
    const trimmed = initialDomain.trim().toLowerCase();
    if (trimmed && /^[a-z][a-z0-9-]*$/.test(trimmed)) {
      setDomainName(trimmed);
      verifyDomainMutation.mutate(trimmed);
    }
  }, []);

  useEffect(() => {
    if (loginMode === "otp") {
      if (otpTimer <= 0) return;
      const interval = setInterval(() => {
        setOtpTimer((t) => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [otpTimer, loginMode]);

  const applyLoginSuccess = (data: any) => {
    if (!data) return;
    toast({ title: "Welcome back!", description: "Login successful" });
    queryClient.invalidateQueries();
    localStorage.setItem("prokraya-auth", JSON.stringify({
      isAuthenticated: true,
      role: data.role,
      userRole: data.userRole,
      userId: data.userId,
      email: data.email,
      userNameId: data.userName,
      orgId: data.orgId || null,
      supplierId: data.supplierId || null,
      userName: data.name || null,
      vendorStatus: data.vendorStatus || null,
      domain: domainName || null,
      orgIds: data.orgIds || null,
      department: data.department || null,
      access_token: data.token_type ? data.token_type.concat(" ") + data.access_token : data.access_token,
      refresh_token: data.refresh_token ?? data.refreshToken,
      token_type: data.token_type ?? "Bearer",
    }));
    onLogin(data.role, data.userId, data.orgId, data.name, data.vendorStatus, data.email, data.userName, data.supplierId);
    if (data.role === "vendor") {
      const status = data.vendorStatus;
      if (!status || status === "Draft") {
        setLocation("/vendor/register/company-details");
      } else if (status === 'Pending Approval') {
        setLocation("/vendor/register/review");
      } else {
        setLocation("/app/dashboard");
      }
    } else {
      setLocation("/app/dashboard");
    }
  };

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const [encryptedEmail, encryptedPwd] = await Promise.all([
        encryptPassword(data.email),
        encryptPassword(data.password),
      ]);
      const response = await apiRequest("POST", "/api/auth/login", {
        email: encryptedEmail,
        password: encryptedPwd,
        encrypted: true,
        domain: hostInfo.isLocal ? (domainName || undefined) : domainName,
        include_tokens: true,
      });
      if (!response.ok) {
        toast({ title: "Login failed", description: (await response.json()).error || "Invalid login credentials", variant: "destructive" });
        return;
      }
      return response.json();
    },
    onSuccess: applyLoginSuccess,
    onError: (error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const SSO_ERROR_MESSAGES: Record<string, string> = {
    not_registered: "This account isn't registered. Please register or contact your administrator.",
    account_inactive: "Your account is inactive. Please contact your administrator.",
    email_not_verified: "Your Google account's email isn't verified.",
    invalid_domain: "Unable to resolve your organization's domain.",
  };

  const ssoExchangeMutation = useMutation({
    mutationFn: async (handoffCode: string) => {
      const response = await apiRequest("GET", `/api/auth/sso/exchange?code=${encodeURIComponent(handoffCode)}`);
      return response.json();
    },
    onSuccess: applyLoginSuccess,
    onError: () => {
      toast({ title: "Sign-in failed", description: "Please try signing in again.", variant: "destructive" });
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const handoffCode = params.get("hc");
    const ssoError = params.get("ssoError");
    if (!handoffCode && !ssoError) return;

    if (handoffCode) {
      ssoExchangeMutation.mutate(handoffCode);
    } else if (ssoError) {
      toast({
        title: "Sign-in failed",
        description: SSO_ERROR_MESSAGES[ssoError] || "Sign-in failed. Please try again.",
        variant: "destructive",
      });
    }

    const url = new URL(window.location.href);
    url.searchParams.delete("hc");
    url.searchParams.delete("ssoError");
    window.history.replaceState({}, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSsoLogin = (provider: "google" | "microsoft") => {
    window.location.href = `/api/auth/sso/${provider}/start?domain=${encodeURIComponent(domainName)}`;
  };

  const handleProceedDomain = () => {
    const trimmed = domainName.trim().toLowerCase();
    if (!trimmed) {
      setDomainError("Please enter your domain name");
      return;
    }
    if (!/^[a-z][a-z0-9-]*$/.test(trimmed)) {
      setDomainError("Domain can only contain lowercase letters, numbers, and hyphens");
      return;
    }
    setDomainName(trimmed);
    verifyDomainMutation.mutate(trimmed);
  };

  const handleLogin = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const sendOtpMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/send-login-otp", {
        email,
        domain: hostInfo.isLocal ? (domainName || undefined) : domainName,
      });
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "OTP Sent", description: "OTP sent to registered email address" });
      setOtpStep("verify");
      setOtpTimer(60);
    },
    onError: (error: Error) => {
      toast({ title: "Sending OTP Failed", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    const otp = otpForm.watch("otp");
    if (otp?.length === 6 && otpStep === "verify") {
      otpForm.clearErrors("otp");
      verifyOtpMutation.mutate({
        email: otpForm.getValues("email"),
        otp,
      });
    } else {
      otpForm.clearErrors("otp");
    }
  }, [otpForm.watch("otp")]);

  const verifyOtpMutation = useMutation({
    mutationFn: async (data: OTPFormData) => {
      if (!data.otp || !/^\d{6}$/.test(data.otp)) {
        otpForm.setError("otp", {
          type: "manual",
          message: "OTP must be exactly 6 digits",
        });
        throw new Error("OTP must be exactly 6 digits");
      }
      const response = await apiRequest("POST", "/api/auth/verify-login-otp", {
        ...data,
        domain: domainName,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Welcome back!", description: "Login successful" });
      queryClient.invalidateQueries();
      localStorage.setItem("prokraya-auth", JSON.stringify({
        isAuthenticated: true,
        role: data.role,
        userRole: data.userRole,
        userId: data.userId,
        email: data.email,
        userNameId: data.userName,
        orgId: data.orgId || null,
        supplierId: data.supplierId || null,
        userName: data.name || null,
        vendorStatus: data.vendorStatus || null,
        domain: domainName || null,
        access_token: data.token_type ? data.token_type.concat(" ") + data.access_token : data.access_token,
        refresh_token: data.refresh_token ?? data.refreshToken,
        token_type: data.token_type ?? "Bearer",
      }));
      onLogin(data.role, data.userId, data.orgId, data.name, data.vendorStatus, data.email, data.userName, data.supplierId);
      if (data.role === "vendor") {
        const status = data.vendorStatus;
        if (!status || status === "Draft") {
          setLocation("/vendor/register/company-details");
        } else if (status === 'Pending Approval') {
          setLocation("/vendor/register/review");
        } else {
          setLocation("/app/dashboard");
        }
      } else {
        setLocation("/app/dashboard");
      }
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const showCredentials = domainFieldVisible
    ? (hostInfo.isLocal || domainVerified)
    : true;
  const headerText = showCredentials ? "Sign In" : "Welcome";
  const subText = showCredentials
    ? (tenantInfo?.companyName ? `Sign in to ${tenantInfo.companyName}` : "Sign in to your account to continue")
    : "Enter your organization domain to continue";

  return (
    <div className="min-h-screen flex flex-col s2p-auth s2p-auth-surface">
      <main className="flex-1 flex items-center justify-center gap-10 2xl:gap-16 px-4 py-4">
        <AuthSideArt side="left" />
        <div className="w-full max-w-md">
          <div className="rounded-2xl border bg-card px-6 py-5 sm:px-8 sm:py-6 shadow-xl shadow-violet-900/5">
            <div className="flex justify-center mb-3">
              <img src={s2pLabsLogo} alt="S2P Labs" className="h-10 object-contain" />
            </div>
            <div className="mb-4 text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-1" data-testid="text-login-title">
                {headerText}
              </h2>
              <p className="text-muted-foreground">
                {subText}
              </p>
            </div>

            <div className="space-y-3">
              {/* ── Domain Field ── Visible when SHOW_DOMAIN_FIELD=true or on main domain (no subdomain, not localhost) */}
              {domainFieldVisible && (
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain Name</Label>
                  <div className="relative">
                    <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="domain"
                      type="text"
                      placeholder="your-company"
                      className={`pl-9 pr-32 h-11 ${domainVerified && !hostInfo.isLocal ? 'bg-muted' : ''}`}
                      value={domainName}
                      onChange={(e) => {
                        setDomainName(e.target.value.toLowerCase());
                        setDomainError("");
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !showCredentials) {
                          e.preventDefault();
                          handleProceedDomain();
                        }
                      }}
                      disabled={domainLocked || domainVerified}
                      data-testid="input-domain"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                      .{hostInfo.baseDomain}
                    </span>
                  </div>
                  {domainError && (
                    <div className="flex items-center gap-1.5 text-sm text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>{domainError}</span>
                    </div>
                  )}

                </div>
              )}

              {showCredentials ? (
                loginMode === "password" ? (
                  <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          placeholder="Enter your email"
                          className="pl-9 h-11"
                          {...form.register("email")}
                          data-testid="input-email"
                        />
                      </div>
                      {form.formState.errors.email && (
                        <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative flex items-center">
                        <Lock className="absolute left-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          placeholder="Enter your password"
                          className="pl-9 pr-10 h-11"
                          {...form.register("password")}
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          className="absolute right-3 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowPassword(!showPassword)}
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {form.formState.errors.password && (
                        <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                      )}
                      <div className="text-right">
                        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 border-primary/40 text-primary hover:text-primary"
                        data-testid="link-register-vendor"
                        onClick={() => setLocation("/register")}
                      >
                        Register as Supplier
                      </Button>
                      <Button
                        type="submit"
                        className="h-11"
                        disabled={loginMutation.isPending}
                        data-testid="button-login"
                      >
                        {loginMutation.isPending ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Signing in...
                          </>
                        ) : (
                          "Sign In"
                        )}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form
                    onSubmit={otpForm.handleSubmit((data) => {
                      if (otpStep === "send") {
                        sendOtpMutation.mutate(data.email);
                      } else {
                        verifyOtpMutation.mutate(data);
                      }
                    })}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="otp-email"
                          type="email"
                          className="pl-9 h-11"
                          placeholder="Enter your email"
                          disabled={otpStep === "verify"}
                          {...otpForm.register("email")}
                        />
                      </div>
                      {otpForm.formState.errors.email && (
                        <p className="text-sm text-destructive">{otpForm.formState.errors.email.message}</p>
                      )}
                    </div>
                    {otpStep === "verify" && (
                      <>
                        <div className="space-y-2">
                          <Label>One Time Password</Label>
                          <InputOTP
                            maxLength={6}
                            value={otpForm.watch("otp")}
                            onChange={(val) => otpForm.setValue("otp", val)}
                            onPaste={(e) => {
                              const pasted = e.clipboardData.getData("text").slice(0, 6);
                              otpForm.setValue("otp", pasted);
                            }}
                          >
                            <InputOTPGroup>
                              <InputOTPSlot index={0} />
                              <InputOTPSlot index={1} />
                              <InputOTPSlot index={2} />
                              <InputOTPSlot index={3} />
                              <InputOTPSlot index={4} />
                              <InputOTPSlot index={5} />
                            </InputOTPGroup>
                          </InputOTP>
                        </div>
                        {otpForm.formState.errors.otp && (
                          <p className="text-sm text-destructive">{otpForm.formState.errors.otp.message}</p>
                        )}
                        <div className="text-sm text-center text-muted-foreground">
                          {otpTimer > 0 ? (
                            `Resend OTP in ${otpTimer}s`
                          ) : (
                            <button
                              type="button"
                              onClick={() => sendOtpMutation.mutate(otpForm.getValues("email"))}
                              className="text-primary"
                              data-testid="button-resend-otp"
                            >
                              Resend OTP
                            </button>
                          )}
                        </div>
                      </>
                    )}
                    <Button
                      type="submit"
                      className="w-full h-11"
                      disabled={sendOtpMutation.isPending || verifyOtpMutation.isPending}
                      data-testid="button-otp-send-verify"
                    >
                      {(sendOtpMutation.isPending || verifyOtpMutation.isPending) ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : otpStep === "send" ? (
                        "Send OTP"
                      ) : (
                        "Verify & Login"
                      )}
                    </Button>
                  </form>
                )
              ) : (
                <Button
                  className="w-full h-11"
                  onClick={handleProceedDomain}
                  disabled={verifyDomainMutation.isPending}
                  data-testid="button-proceed-domain"
                >
                  {verifyDomainMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Proceed
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </>
                  )}
                </Button>
              )}

              {showCredentials && SHOW_ALTERNATE_SIGNIN && (
                <>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-background px-2 text-muted-foreground">Other Signin Options</span>
                    </div>
                  </div>
                  {loginMode === "password" ? (
                    <Button
                      variant="outline"
                      className="w-full h-11 gap-2"
                      onClick={() => {
                        setLoginMode("otp");
                        setOtpStep("send");
                        form.reset();
                        otpForm.setValue("email", form.getValues("email"));
                      }}
                      data-testid="button-otp-login"
                    >
                      <Smartphone className="h-4 w-4" />
                      Sign in With OTP
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="w-full h-11 gap-2"
                      onClick={() => {
                        setLoginMode("password");
                        setOtpStep("send");
                        otpForm.reset();
                        form.setValue("email", form.getValues("email"));
                      }}
                      data-testid="button-otp-login"
                    >
                      <Lock className="h-4 w-4" />
                      Sign in With Password
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 gap-2"
                      onClick={() => handleSsoLogin("google")}
                      data-testid="button-sso-google"
                    >
                      <GoogleIcon className="h-4 w-4" />
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 gap-2"
                      onClick={() => handleSsoLogin("microsoft")}
                      data-testid="button-sso-microsoft"
                    >
                      <MicrosoftIcon className="h-4 w-4" />
                      Microsoft
                    </Button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
        <AuthSideArt side="right" />
      </main>

      <AuthFooter />
    </div>
  );
}
