import { useState } from "react";
import { Link } from "wouter";
import prokrayaLogoDark from "@/assets/images/prokraya-logo-dark.png";
import prokrayaLogoLight from "@/assets/images/prokraya-logo-light.png";
import {
  Building2,
  ArrowLeft,
  Mail,
  User,
  Globe,
  CheckCircle2,
  Sparkles,
  TrendingUp,
  Bot,
  Shield,
  FileCheck,
  BarChart3,
  Info,
  Rocket,
  Loader2,
  PartyPopper
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/ui/phone-input";
import { Progress } from "@/components/ui/progress";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TermsConditions from "./modules/common/terms-conditions";
import PrivacyPolicy from "./modules/common/privacy-policy";

const trialBenefits = [
  {
    icon: Bot,
    title: "AI Procurement Agents",
    description: "Action-capable AI agents that create POs, manage vendors, and process invoices autonomously."
  },
  {
    icon: TrendingUp,
    title: "Spend Intelligence",
    description: "AI-powered spend analysis with anomaly detection, savings opportunities, and executive insights."
  },
  {
    icon: Shield,
    title: "Risk & Compliance",
    description: "Continuous vendor risk monitoring, document verification, and compliance tracking."
  },
  {
    icon: FileCheck,
    title: "Smart Document Processing",
    description: "AI-powered invoice matching, fraud detection, and automated three-way matching."
  },
  {
    icon: BarChart3,
    title: "Complete S2P Platform",
    description: "End-to-end Source-to-Pay: Requisitions, POs, Bids, Invoices, Payments, and GRNs."
  }
];

const freeTrialSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  domainName: z.string()
    .min(3, "Domain name must be at least 3 characters")
    .max(30, "Domain name must not exceed 30 characters")
    .regex(/^[a-z]+$/, "Only lowercase letters allowed. No spaces, numbers, or special characters."),
  contactName: z.string().min(2, "Contact name is required"),
  email: z.string().email("Please enter a valid business email"),
  country: z.string().min(1, "Please select a country"),
  mobile: z.string().min(8, "Please enter a valid mobile number"),
});

type FreeTrialFormData = z.infer<typeof freeTrialSchema>;

export default function FreeTrial() {
  const [registrationState, setRegistrationState] = useState<"form" | "provisioning" | "complete">("form");
  const [provisionProgress, setProvisionProgress] = useState(0);
  const [registeredDomain, setRegisteredDomain] = useState("");
  const { toast } = useToast();

  const { data: countries = [] } = useQuery<{ value: string; label: string }[]>({
    queryKey: ["/api/countries"],
    queryFn: async () => {
      const res = await fetch("/api/countries");
      if (!res.ok) throw new Error("Failed to fetch countries");
      return res.json();
    },
    select: (data: any[]) => data.map(c => ({
      value: c.key_2,
      label: c.description
    }))
  });

  const form = useForm<FreeTrialFormData>({
    resolver: zodResolver(freeTrialSchema),
    defaultValues: {
      companyName: "",
      domainName: "",
      contactName: "",
      email: "",
      country: "",
      mobile: "",
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: FreeTrialFormData) => {
      const res = await apiRequest("POST", "/api/free-trial/register", data);
      return res.json();
    },
    onSuccess: (data) => {
      setRegisteredDomain(data.domain);
      setRegistrationState("provisioning");
      simulateProvisioning();
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Something went wrong. Please try again.",
        variant: "destructive",
      });
    },
  });

  const simulateProvisioning = () => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15 + 5;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => {
          setRegistrationState("complete");
        }, 800);
      }
      setProvisionProgress(Math.min(progress, 100));
    }, 600);
  };

  const onSubmit = (data: FreeTrialFormData) => {
    registerMutation.mutate(data);
  };

  const domainValue = form.watch("domainName");

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <div className="lg:w-[480px] bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-700 text-white p-8 lg:p-10 flex flex-col relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
        <div className="absolute top-1/2 right-0 w-40 h-40 bg-white/5 rounded-full translate-x-1/2" />

        <div className="relative z-10">
          <Link href="/">
            <div className="flex items-center gap-2 mb-2 cursor-pointer group">
              <ArrowLeft className="h-4 w-4 opacity-70 group-hover:opacity-100 transition-opacity" />
              <span className="text-sm opacity-70 group-hover:opacity-100 transition-opacity">Back to home</span>
            </div>
          </Link>
          <img src={prokrayaLogoLight} alt="Prokraya" className="h-9 object-contain object-left mb-8" />

          <h1 className="text-2xl lg:text-3xl font-bold mb-3">
            Try Prokraya in Action
          </h1>
          <p className="text-white/80 text-sm mb-8">
            Experience the power of AI-native procurement. Get your own dedicated environment with full platform access.
          </p>

          <div className="space-y-5">
            {trialBenefits.map((benefit, index) => (
              <div key={index} className="flex gap-3.5">
                <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center backdrop-blur-sm">
                  <benefit.icon className="h-4.5 w-4.5" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm mb-0.5">{benefit.title}</h3>
                  <p className="text-white/70 text-xs leading-relaxed">{benefit.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto pt-8 relative z-10">
          <div className="border-t border-white/20 pt-5">
            <div className="flex items-center gap-4 text-xs text-white/60">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>No credit card</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>30-day trial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Full access</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-background">
        {registrationState === "form" && (
          <div className="w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold" data-testid="text-trial-heading">Start Your Free Trial</h2>
                <p className="text-sm text-muted-foreground mt-1">No credit card required. Setup in under a minute.</p>
              </div>
              <Link href="/login">
                <Button variant="ghost" size="sm" className="text-xs" data-testid="button-trial-login">
                  Already have an account? <span className="text-primary ml-1 font-semibold">Login</span>
                </Button>
              </Link>
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div>
                <Label htmlFor="companyName" className="text-sm font-medium">Company Name <span className="text-destructive">*</span></Label>
                <div className="relative mt-1.5">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="companyName"
                    placeholder="Enter your company name"
                    className="pl-10"
                    {...form.register("companyName")}
                    data-testid="input-trial-company"
                  />
                </div>
                {form.formState.errors.companyName && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.companyName.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="domainName" className="text-sm font-medium">Preferred Domain Name <span className="text-destructive">*</span></Label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">Only lowercase letters allowed. No spaces, numbers, or special characters.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="relative mt-1.5">
                  <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="domainName"
                    placeholder="yourcompany"
                    className="pl-10 pr-[140px]"
                    {...form.register("domainName")}
                    data-testid="input-trial-domain"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                    .prokraya.ai
                  </span>
                </div>
                {domainValue && /^[a-z]+$/.test(domainValue) && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Your URL: <span className="font-medium text-primary">{domainValue}.prokraya.ai</span>
                  </p>
                )}
                {form.formState.errors.domainName && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.domainName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="contactName" className="text-sm font-medium">Contact Name <span className="text-destructive">*</span></Label>
                <div className="relative mt-1.5">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="contactName"
                    placeholder="Your full name"
                    className="pl-10"
                    {...form.register("contactName")}
                    data-testid="input-trial-name"
                  />
                </div>
                {form.formState.errors.contactName && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.contactName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="email" className="text-sm font-medium">Business Email <span className="text-destructive">*</span></Label>
                <div className="relative mt-1.5">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    className="pl-10"
                    {...form.register("email")}
                    data-testid="input-trial-email"
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="country" className="text-sm font-medium">Country <span className="text-destructive">*</span></Label>
                <div className="mt-1.5">
                  <select
                    id="country"
                    className="w-full h-10 px-3 rounded-md border bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                    {...form.register("country")}
                    data-testid="select-trial-country"
                  >
                    <option value="">Select your country</option>
                    {countries.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                {form.formState.errors.country && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.country.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="mobile" className="text-sm font-medium">Mobile Number <span className="text-destructive">*</span></Label>
                <div className="mt-1.5">
                  <PhoneInput
                    value={form.watch("mobile")}
                    onChange={(val) => form.setValue("mobile", val, { shouldValidate: true })}
                    data-testid="input-trial-mobile"
                  />
                </div>
                {form.formState.errors.mobile && (
                  <p className="text-xs text-destructive mt-1">{form.formState.errors.mobile.message}</p>
                )}
              </div>

              <div className="pt-2">
                <p className="text-xs text-muted-foreground text-center mb-3">
                  By clicking "Get Started", you agree to our{" "}
                  <TermsConditions type="Signup" className="text-primary hover:underline" dataTestId="signup-link-terms" /> and{" "}
                  <PrivacyPolicy className="text-primary hover:underline" dataTestId="signup-link-privacy" />.
                </p>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full gap-2 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 shadow-lg"
                  disabled={registerMutation.isPending}
                  data-testid="button-trial-submit"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Registering...
                    </>
                  ) : (
                    <>
                      <Rocket className="h-4 w-4" />
                      Get Started
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}

        {registrationState === "provisioning" && (
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-100 dark:from-violet-900/30 dark:to-fuchsia-900/30 flex items-center justify-center mx-auto mb-6">
              <Sparkles className="h-10 w-10 text-violet-600 animate-pulse" />
            </div>
            <h2 className="text-2xl font-bold mb-2" data-testid="text-provisioning-heading">Thank You for Your Interest!</h2>
            <p className="text-muted-foreground mb-8">
              Your dedicated environment is being prepared. Please standby...
            </p>

            <div className="space-y-3 mb-8">
              <Progress value={provisionProgress} className="h-2" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Setting up your environment</span>
                <span>{Math.round(provisionProgress)}%</span>
              </div>
            </div>

            <div className="space-y-2 text-sm text-muted-foreground">
              <p className={provisionProgress > 10 ? "text-foreground" : ""}>
                {provisionProgress > 10 && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-emerald-500" />}
                Creating your database...
              </p>
              <p className={provisionProgress > 35 ? "text-foreground" : ""}>
                {provisionProgress > 35 && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-emerald-500" />}
                Configuring AI agents...
              </p>
              <p className={provisionProgress > 60 ? "text-foreground" : ""}>
                {provisionProgress > 60 && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-emerald-500" />}
                Setting up procurement modules...
              </p>
              <p className={provisionProgress > 85 ? "text-foreground" : ""}>
                {provisionProgress > 85 && <CheckCircle2 className="h-3.5 w-3.5 inline mr-1.5 text-emerald-500" />}
                Finalizing your environment...
              </p>
            </div>
          </div>
        )}

        {registrationState === "complete" && (
          <div className="w-full max-w-md text-center">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/30 dark:to-teal-900/30 flex items-center justify-center mx-auto mb-6">
              <PartyPopper className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2" data-testid="text-complete-heading">Your Environment is Ready!</h2>
            <p className="text-muted-foreground mb-6">
              Your dedicated Prokraya instance has been set up successfully.
            </p>

            <Card className="mb-6 border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Your URL</span>
                    <span className="font-semibold text-primary">{registeredDomain}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Trial Period</span>
                    <span className="font-medium">30 Days</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Default Password</span>
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">Welcome@123</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <p className="text-xs text-muted-foreground mb-6">
              An email with your login credentials and getting started guide has been sent to your registered email address.
            </p>

            <div className="flex flex-col gap-3">
              <Button
                size="lg"
                className="w-full gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                onClick={() => window.open(`https://${registeredDomain}`, "_blank")}
                data-testid="button-trial-launch"
              >
                <Rocket className="h-4 w-4" />
                Launch Your Prokraya
              </Button>
              <Link href="/">
                <Button variant="outline" size="lg" className="w-full gap-2" data-testid="button-trial-home">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
