import s2pLabsLogo from "@/assets/images/s2plabs_logo.jpeg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getPhoneValidationMessage, PhoneInput, validatePhoneNumber } from "@/components/ui/phone-input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  KeyRound,
  Loader2,
  Mail, Phone, RefreshCw,
  Shield, Workflow, Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "wouter";
import { z } from "zod";
import TermsConditions from "./modules/common/terms-conditions";
import PrivacyPolicy from "./modules/common/privacy-policy";

// ── Captcha generator (same as vendor-register) ──────────────────
const generateCaptcha = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// ── Zod schema ────────────────────────────────────────────────────
const forgotSchema = z.object({
  emailId: z.string().email("Please enter a valid Email ID"),
  captchaValue: z.string().min(1, "Please enter captcha value"),
});

type ForgotFormData = z.infer<typeof forgotSchema>;

// ── Side-panel features ───────────────────────────────────────────
const features = [
  {
    icon: Shield,
    title: "Enterprise Ready",
    description: "Built for scale with compliance, security, and audit trails",
  },
];

// ── Component ─────────────────────────────────────────────────────
export default function ForgotPassword() {
  const { toast } = useToast();

  const [captcha, setCaptcha] = useState(generateCaptcha());
  const [captchaError, setCaptchaError] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [mobileError, setMobileError] = useState("");

  const refreshCaptcha = useCallback(() => {
    setCaptcha(generateCaptcha());
    setCaptchaError("");
  }, []);

  // Auto-detect country code via IP geolocation
  useEffect(() => {
    fetch("https://ipapi.co/json/")
      .then((r) => r.json())
      .then((data) => {
        // PhoneInput handles country code selection — no-op here;
        // this could be extended to set a defaultCountryCode if needed
      })
      .catch(() => {
        // silently ignore — PhoneInput defaults to +971
      });
  }, []);

  const form = useForm<ForgotFormData>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { emailId: "", captchaValue: "" },
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: ForgotFormData) => {
      const res = await apiRequest("POST", "/api/auth/forgot-password", {
        emailId: data.emailId,
        mobileNo: mobileNumber,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Success",
        description: data.message || "Password reset instructions sent to your email.",
      });
      form.reset();
      setMobileNumber("");
      refreshCaptcha();
    },
    onError: (error: Error) => {
      let description = error.message;
      const match = error.message.match(/^\d+:\s*(.+)$/s);
      if (match) {
        try {
          const parsed = JSON.parse(match[1]);
          description = parsed.error || parsed.message || description;
        } catch {
          description = match[1];
        }
      }
      toast({ title: "Error", description, variant: "destructive" });
      refreshCaptcha();
      form.setValue("captchaValue", "");
    },
  });

  const handleVerify = (data: ForgotFormData) => {
    // Validate mobile
    if (!mobileNumber || !validatePhoneNumber(mobileNumber)) {
      setMobileError(mobileNumber ? getPhoneValidationMessage(mobileNumber) : "Please enter valid Mobile Number");
      return;
    }

    // Validate captcha
    if (data.captchaValue !== captcha) {
      setCaptchaError("Captcha Not Matched");
      form.setValue("captchaValue", "");
      refreshCaptcha();
      return;
    }

    setCaptchaError("");
    forgotMutation.mutate(data);
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
                <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">Back to home</span>
              </div>
            </Link>
            <img src={s2pLabsLogo} alt="S2P Labs" className="h-10 object-contain object-left" />
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
                Experience the future of Source-to-Pay with intelligent automation and conversational AI agents.
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
            <div><p className="text-2xl font-bold">24/7</p><p className="text-sm text-white/70">Autonomous Execution</p></div>
          </div>
        </div>
      </div>

      {/* ── Right panel ─────────────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex flex-col bg-background">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center justify-between px-6 py-4 border-b">
          <Link href="/">
            <div className="flex flex-col cursor-pointer">
              <img src={s2pLabsLogo} alt="S2P Labs" className="h-8 object-contain object-left" />
              <span className="text-[10px] text-primary font-semibold uppercase tracking-wider ml-[38px] bg-primary/10 px-2 py-0.5 rounded">
                AI-Powered S2P
              </span>
            </div>
          </Link>
        </header>

        <main className="flex-1 flex items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-md">

            {/* Back to Sign In */}
            <Link href="/login">
              <button
                type="button"
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8 group"
              >
                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-0.5 transition-transform" />
                Back to Sign In
              </button>
            </Link>

            {/* Heading block */}
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
                <KeyRound className="h-7 w-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Forgot Password?</h2>
              <p className="text-sm text-muted-foreground">
                Enter your registered email and mobile number to verify your identity.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={form.handleSubmit(handleVerify)} className="space-y-5">

              {/* Email ID */}
              <div className="space-y-2">
                <Label htmlFor="emailId">
                  Email Id <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailId"
                    type="text"
                    placeholder="Enter your Email ID"
                    className="pl-9 h-11"
                    {...form.register("emailId")}
                    data-testid="input-email-id"
                  />
                </div>
                {form.formState.errors.emailId && (
                  <p className="text-sm text-destructive">{form.formState.errors.emailId.message}</p>
                )}
              </div>

              {/* Mobile Number */}
              <div className="space-y-2">
                <Label htmlFor="mobileNumber">
                  Mobile Number <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10 pointer-events-none" />
                  <PhoneInput
                    value={mobileNumber}
                    onChange={(val) => {
                      setMobileNumber(val);
                      setMobileError("");
                    }}
                    onBlur={() => {
                      if (mobileNumber && !validatePhoneNumber(mobileNumber)) {
                        setMobileError(getPhoneValidationMessage(mobileNumber));
                      }
                    }}
                    placeholder="Enter mobile number"
                    className="h-11 pl-9"
                    data-testid="input-mobile-number"
                  />
                </div>
                {mobileError && (
                  <p className="text-sm text-destructive">{mobileError}</p>
                )}
              </div>

              {/* Captcha */}
              <div className="space-y-2">
                <Label>
                  Security Captcha <span className="text-destructive">*</span>
                </Label>
                <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                  {/* Captcha display row */}
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
                      data-testid="button-refresh-captcha"
                      title="Reload captcha"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  {/* Captcha input */}
                  {(() => {
                    const captchaRegister = form.register("captchaValue");
                    return (
                      <Input
                        id="captchaValue"
                        placeholder="Enter the characters shown above"
                        className="h-11 bg-background"
                        {...captchaRegister}
                        onChange={(e) => {
                          captchaRegister.onChange?.(e);
                          if (captchaError) setCaptchaError("");
                        }}
                        onBlur={(e) => {
                          captchaRegister.onBlur?.(e);
                          const val = form.getValues("captchaValue");
                          if (val && val !== captcha) {
                            setCaptchaError("Captcha value does not match");
                          } else {
                            setCaptchaError("");
                          }
                        }}
                        data-testid="input-captcha"
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

              {/* Verify button — full width */}
              <Button
                type="submit"
                className="w-full h-11"
                disabled={forgotMutation.isPending}
                data-testid="button-verify"
              >
                {forgotMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Verify & Reset Password"
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="text-center text-xs text-muted-foreground mt-10 space-y-2">
              <div className="flex items-center justify-center gap-2">
                <TermsConditions type="Reset Password" className="hover:text-foreground hover:underline" dataTestId="link-terms" />
                <span>|</span>
                <PrivacyPolicy className="hover:text-foreground hover:underline" dataTestId="link-privacy-policy" />
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
