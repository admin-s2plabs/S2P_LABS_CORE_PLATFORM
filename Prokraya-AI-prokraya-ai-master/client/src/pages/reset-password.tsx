import prokrayaLogoDark from "@/assets/images/prokraya-logo-dark.png";
import prokrayaLogoLight from "@/assets/images/prokraya-logo-light.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { encryptPassword } from "@/lib/password-crypto";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Shield,
  Workflow,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation } from "wouter";
import { z } from "zod";

// ── Captcha generator ─────────────────────────────────────────────
const generateCaptcha = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ── Zod schema ────────────────────────────────────────────────────
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(16, "Password must be at most 16 characters")
      .regex(/[A-Z]/, "Password must contain at least 1 uppercase letter")
      .regex(/\d/, "Password must contain at least 1 number")
      .regex(
        /[!@#$%^&*()_+{}\[\]:;<>,.?~\\-]/,
        "Password must contain at least 1 special character"
      ),
    confirmPassword: z.string().min(1, "Please confirm your password"),
    captchaValue: z.string().min(1, "Please enter the captcha value"),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Password and Confirm Password do not match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

// ── Side-panel features ───────────────────────────────────────────
const features = [
  {
    icon: Bot,
    title: "6 Specialized AI Agents",
    description:
      "Sourcing, Vendor, Contract, Invoice, Spend & Compliance agents working together",
  },
  {
    icon: Workflow,
    title: "Agentic Workflows",
    description:
      "Configure trigger-based automation that executes procurement tasks autonomously",
  },
  {
    icon: Zap,
    title: "Natural Language Interface",
    description:
      "Describe what you need in plain English — AI handles the execution",
  },
  {
    icon: Shield,
    title: "Enterprise Ready",
    description: "Built for scale with compliance, security, and audit trails",
  },
];

// ── Component ─────────────────────────────────────────────────────
export default function ResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [userName, setUserName] = useState("");
  const [randomId, setRandomId] = useState("");
  const [tenantDomain, setTenantDomain] = useState("");
  const [linkError, setLinkError] = useState("");
  const [done, setDone] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [captcha, setCaptcha] = useState(generateCaptcha);
  const [captchaError, setCaptchaError] = useState("");

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaError("");
  }, []);

  // Decode enc param on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const enc = params.get("enc");
    if (!enc) {
      setLinkError("Reset link is invalid. Please use a valid link to reset your password.");
      return;
    }
    try {
      const decoded = atob(decodeURIComponent(enc));
      const parts: Record<string, string> = {};
      decoded.split("~").forEach((pair) => {
        const [k, v] = pair.split("=");
        if (k && v !== undefined) parts[k] = v;
      });
      if (!parts["user_id"] || !parts["linkId"]) {
        setLinkError("Reset link is invalid. Please use a valid link to reset your password.");
        return;
      }
      setUserName(parts["user_id"]);
      setRandomId(parts["linkId"]);
      if (parts["domain"]) setTenantDomain(parts["domain"]);
    } catch {
      setLinkError("Reset link is invalid. Please use a valid link to reset your password.");
    }
  }, []);

  const form = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "", captchaValue: "" },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetFormData) => {
      const [encryptedUserName, encryptedPwd] = await Promise.all([
        encryptPassword(userName),
        encryptPassword(data.password),
      ]);
      const res = await apiRequest("POST", "/api/auth/reset-password-link", {
        userName: encryptedUserName,
        randomId,
        password: encryptedPwd,
        encrypted: true,
        ...(tenantDomain ? { domain: tenantDomain } : {}),
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Success", description: data.message || "Password updated successfully." });
      setDone(true);
      setTimeout(() => setLocation("/login"), 3000);
    },
    onError: (error: Error) => {
      let description = error.message;
      const match = error.message.match(/^\d+:\s*(.+)$/s);
      if (match) {
        try {
          description = JSON.parse(match[1]).error || match[1];
        } catch {
          description = match[1];
        }
      }
      toast({ title: "Error", description, variant: "destructive" });
      refreshCaptcha();
      form.setValue("captchaValue", "");
    },
  });

  const handleSubmit = (data: ResetFormData) => {
    if (data.captchaValue !== captcha) {
      setCaptchaError("Captcha Not Matched");
      form.setValue("captchaValue", "");
      refreshCaptcha();
      return;
    }
    setCaptchaError("");
    resetMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left panel ──────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 relative overflow-hidden">
        <div className="absolute top-10 left-10 w-64 h-64 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/4 w-40 h-40 bg-white/5 rounded-full blur-2xl" />

        <div className="relative z-10 flex flex-col justify-between p-10 text-white w-full">
          <div>
            <Link href="/">
              <div className="flex items-center gap-2 mb-2 cursor-pointer group">
                <ArrowLeft className="h-4 w-4 opacity-70 group-hover:opacity-100 transition-opacity" />
                <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">
                  Back to home
                </span>
              </div>
            </Link>
            <img src={prokrayaLogoLight} alt="Prokraya" className="h-10 object-contain object-left" />
            <span className="text-xs text-white/90 font-semibold uppercase tracking-wider ml-[48px] mt-1">
              AI Agentic Procurement
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-center max-w-md">
            <div className="mb-8">
              <h1 className="text-4xl font-bold mb-4 leading-tight">
                Transform Your Procurement with AI
              </h1>
              <p className="text-lg text-white/80">
                Experience the future of Source-to-Pay with intelligent
                automation and conversational AI agents.
              </p>
            </div>
            <div className="space-y-4">
              {features.map((feature, i) => (
                <div
                  key={i}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/10 backdrop-blur"
                >
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
              <p className="text-2xl font-bold">6</p>
              <p className="text-sm text-white/70">AI Agents</p>
            </div>
            <div>
              <p className="text-2xl font-bold">35+</p>
              <p className="text-sm text-white/70">Workflow Templates</p>
            </div>
            <div>
              <p className="text-2xl font-bold">24/7</p>
              <p className="text-sm text-white/70">Autonomous Execution</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col bg-background">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b">
          <Link href="/">
            <div className="flex flex-col cursor-pointer">
              <img src={prokrayaLogoDark} alt="Prokraya" className="h-8 object-contain object-left" />
              <span className="text-[10px] text-primary font-semibold uppercase tracking-wider ml-[38px] bg-primary/10 px-2 py-0.5 rounded">
                AI-Powered S2P
              </span>
            </div>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">

            <Link href="/login">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to Sign In
              </button>
            </Link>

            {/* Heading */}
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                <KeyRound className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Reset Password</h2>
              <p className="text-sm text-muted-foreground">
                Enter your new password below.
              </p>
            </div>

            {/* Invalid link state */}
            {linkError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-center space-y-3">
                <p className="text-sm text-destructive">{linkError}</p>
                <Link href="/forgot-password">
                  <Button variant="outline" size="sm">Request a new reset link</Button>
                </Link>
              </div>
            ) : done ? (
              /* Success state */
              <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800 p-6 text-center space-y-3">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 mx-auto">
                  <Shield className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <p className="font-semibold text-green-800 dark:text-green-300">Password Updated!</p>
                <p className="text-sm text-muted-foreground">Redirecting you to Sign In…</p>
              </div>
            ) : (
              /* Form */
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">

                {/* Email (read-only) */}
                <div className="space-y-2">
                  <Label>Email</Label>
                  <div className="h-11 px-3 flex items-center rounded-md border bg-muted/40 text-sm text-muted-foreground select-none">
                    {userName || "—"}
                  </div>
                </div>

                {/* New Password */}
                <div className="space-y-2">
                  <Label htmlFor="password">
                    New Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter new password"
                      className="pl-9 pr-10 h-11"
                      {...form.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-sm text-destructive">{form.formState.errors.password.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    8–16 characters · 1 uppercase · 1 number · 1 special character
                  </p>
                </div>

                {/* Confirm Password */}
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    Confirm Password <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirm ? "text" : "password"}
                      placeholder="Re-enter new password"
                      className="pl-9 pr-10 h-11"
                      {...form.register("confirmPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                    >
                      {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {form.formState.errors.confirmPassword && (
                    <p className="text-sm text-destructive">{form.formState.errors.confirmPassword.message}</p>
                  )}
                </div>

                {/* Captcha */}
                <div className="space-y-2">
                  <Label>
                    Security Captcha <span className="text-destructive">*</span>
                  </Label>
                  <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-11 bg-background border rounded-md flex items-center justify-center select-none overflow-hidden relative">
                        <div className="absolute inset-0 opacity-20">
                          <svg className="w-full h-full">
                            <line x1="0" y1="50%" x2="100%" y2="30%" stroke="currentColor" strokeWidth="1" />
                            <line x1="0" y1="30%" x2="100%" y2="70%" stroke="currentColor" strokeWidth="1" />
                            <line x1="20%" y1="0" x2="80%" y2="100%" stroke="currentColor" strokeWidth="1" />
                          </svg>
                        </div>
                        <span
                          className="text-xl font-mono tracking-[0.3em] font-bold text-foreground relative z-10 px-2"
                          style={{ fontStyle: "italic", textShadow: "1px 1px 2px rgba(0,0,0,0.12)" }}
                        >
                          {captcha}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={refreshCaptcha}
                        className="shrink-0 h-11 w-11"
                        title="Reload captcha"
                      >
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </div>
                    {(() => {
                      const reg = form.register("captchaValue");
                      return (
                        <Input
                          placeholder="Enter the characters shown above"
                          className="h-11 bg-background"
                          {...reg}
                          onChange={(e) => {
                            reg.onChange(e);
                            if (captchaError) setCaptchaError("");
                          }}
                          onBlur={(e) => {
                            reg.onBlur(e);
                            const val = form.getValues("captchaValue");
                            if (val && val !== captcha) setCaptchaError("Captcha value does not match");
                            else setCaptchaError("");
                          }}
                        />
                      );
                    })()}
                  </div>
                  {(captchaError || form.formState.errors.captchaValue) && (
                    <p className="text-sm text-destructive">
                      {captchaError || form.formState.errors.captchaValue?.message}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <Button
                  type="submit"
                  className="w-full h-11"
                  disabled={resetMutation.isPending}
                >
                  {resetMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    "Submit"
                  )}
                </Button>
              </form>
            )}

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground mt-10 space-y-2">
              <p>Copyright © 2026 Prokraya Tech Private Limited, All rights reserved.</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
