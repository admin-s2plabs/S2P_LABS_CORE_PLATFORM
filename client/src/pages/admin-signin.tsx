import s2pLabsLogo from "@/assets/images/s2plabs_logo.jpeg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Eye, EyeOff,
  Loader2,
  Lock,
  Mail,
  Shield, Smartphone,
  Workflow, Zap
} from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";
import TermsConditions from "./modules/common/terms-conditions";
import PrivacyPolicy from "./modules/common/privacy-policy";

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

interface AdminSigninProps {
  onLogin: (role: "vendor" | "staff", userId: string, orgId?: string, userName?: string, vendorStatus?: string, email?: string, userNameId?: string, supplierId?: string) => void;
}

const features = [
  {
    icon: Bot,
    title: "6 Specialized AI Agents",
    description: "Sourcing, Vendor, Contract, Invoice, Spend & Compliance agents working together"
  },
  {
    icon: Workflow,
    title: "Agentic Workflows",
    description: "Configure trigger-based automation that executes procurement tasks autonomously"
  },
  {
    icon: Zap,
    title: "Natural Language Interface",
    description: "Describe what you need in plain English - AI handles the execution"
  },
  {
    icon: Shield,
    title: "Enterprise Ready",
    description: "Built for scale with compliance, security, and audit trails"
  }
];

export default function AdminSignin({ onLogin }: AdminSigninProps) {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const [loginMode, setLoginMode] = useState<"password" | "otp">("password");
  const [otpStep, setOtpStep] = useState<"send" | "verify">("send");
  const [otpTimer, setOtpTimer] = useState(0);

  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const otpForm = useForm<OTPFormData>({
    resolver: zodResolver(otpSchema),
    defaultValues: { email: "", otp: "" },
  });

  useEffect(() => {
    if (loginMode === "otp") {
      if (otpTimer <= 0) return;
      const interval = setInterval(() => {
        setOtpTimer((t) => t - 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [otpTimer, loginMode]);

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const response = await apiRequest("POST", "/api/auth/login", {
        ...data,
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Welcome back!", description: "Admin Login successful" });
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
        orgIds: data.orgIds || null,
        department: data.department || null,
        access_token: data.token_type ? data.token_type.concat(" ") + data.access_token : data.access_token,
        refresh_token: data.refresh_token ?? data.refreshToken,
        token_type: data.token_type ?? "Bearer",
      }));
      onLogin(data.role, data.userId, data.orgId, data.name, data.vendorStatus, data.email, data.userName, data.supplierId);
      setLocation("/app/dashboard");
    },
    onError: (error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  const handleLogin = (data: LoginFormData) => {
    loginMutation.mutate(data);
  };

  const sendOtpMutation = useMutation({
    mutationFn: async (email: string) => {
      const response = await apiRequest("POST", "/api/auth/send-login-otp", {
        email,
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
      });
      return response.json();
    },
    onSuccess: (data) => {
      toast({ title: "Welcome back!", description: "Admin Login successful" });
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
        access_token: data.token_type ? data.token_type.concat(" ") + data.access_token : data.access_token,
        refresh_token: data.refresh_token ?? data.refreshToken,
        token_type: data.token_type ?? "Bearer",
      }));
      onLogin(data.role, data.userId, data.orgId, data.name, data.vendorStatus, data.email, data.userName, data.supplierId);
      setLocation("/app/dashboard");
    },
    onError: (error: Error) => {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    },
  });

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
        <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <div>
            <Link href="/">
              <div className="flex items-center gap-2 mb-2 cursor-pointer group">
                <ArrowLeft className="h-4 w-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">Back to home</span>
              </div>
            </Link>
            <img src={s2pLabsLogo} alt="S2P Labs" className="h-10 object-contain object-left" />
            <span className="text-xs text-white/90 font-semibold uppercase tracking-wider ml-[48px] mt-1">AI Agentic Procurement</span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4 leading-tight">
                Admin Portal access
              </h1>
              <p className="text-lg text-white/80">
                Authorized access for S2P Labs procurement administrators and system managers.
              </p>
            </div>

            <div className="space-y-4">
              {features.map((feature, i) => (
                <div key={i} className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur">
                  <div className="w-10 h-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold mb-1">{feature.title}</h3>
                    <p className="text-sm text-white/70">{feature.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-8 pt-6 border-t border-white/20">
            <div>
              <p className="text-2xl font-bold">Admin</p>
              <p className="text-sm text-white/70">Console</p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full lg:w-1/2 flex flex-col bg-background">
        <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b">
          <Link href="/">
            <div className="flex flex-col cursor-pointer">
              <img src={s2pLabsLogo} alt="S2P Labs" className="h-8 object-contain object-left" />
              <span className="text-[10px] text-primary font-semibold uppercase tracking-wider ml-[38px] bg-primary/10 px-2 py-0.5 rounded">AI-Powered S2P</span>
            </div>
          </Link>
        </header>

        <main className="flex-1 flex items-start justify-center p-6 lg:p-12 pt-16 lg:pt-24">
          <div className="w-full max-w-md">
            <div className="mb-8 text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-2">
                Admin Sign In
              </h2>
              <p className="text-muted-foreground">
                Enter your credentials to access the admin console
              </p>
            </div>

            <div className="space-y-4">
              {loginMode === "password" ? (
                <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="Enter your admin email"
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
                      <Link href="/forgot-password" university-link className="text-xs text-primary hover:underline">
                        Forgot password?
                      </Link>
                    </div>
                  </div>
                  <Button
                    type="submit"
                    className="w-full h-11"
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
                        placeholder="Enter your admin email"
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
              )}

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">Other Options</span>
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
                >
                  <Lock className="h-4 w-4" />
                  Sign in With Password
                </Button>
              )}
            </div>

            <div className="text-center text-xs text-muted-foreground mt-8 space-y-2">
              <div className="flex items-center justify-center gap-2">
                <TermsConditions type="Signin" className="hover:text-foreground hover:underline" />
                <span>|</span>
                <PrivacyPolicy className="hover:text-foreground hover:underline" />
                <span>|</span>
                <a href="#" className="hover:text-foreground hover:underline">Security</a>
              </div>
              <p>Copyright © 2026 S2P Labs Tech Private Limited, All rights reserved.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
