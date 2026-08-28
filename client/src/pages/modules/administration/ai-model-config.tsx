import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  BrainCircuit, ArrowLeft, CheckCircle2, Settings2,
  Server, Cloud, Globe, Shield, Key, Link2,
  Zap, TestTube2, Loader2, Eye, EyeOff,
  Cpu, Sparkles, Lock, ExternalLink, ChevronDown, ChevronUp,
  AlertCircle, CircleCheck, Radio, BookOpen, RefreshCw, BarChart2, Trash2,
} from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";

interface AIModelConfig {
  id: number;
  provider_name: string;
  provider_key: string;
  display_name: string;
  description: string;
  api_base_url: string | null;
  api_key_masked: string | null;
  model_name: string;
  is_active: boolean;
  is_available: boolean;
  provider_type: string;
  icon_name: string;
  updated_by: string | null;
  updated_date: string | null;
  is_configured: boolean;
}

interface SetupStep {
  step: string;
  detail: string;
}

interface DeploymentOption {
  title: string;
  icon: string;
  description: string;
}

interface SetupGuide {
  title: string;
  requirements: string[];
  deploymentOptions: DeploymentOption[];
  steps: SetupStep[];
  endpoint: string;
  docsUrl: string;
}

const providerDefaults: Record<string, {
  defaultBaseUrl: string;
  baseUrlPlaceholder: string;
  baseUrlHint: string;
  models: { value: string; label: string; description: string }[];
}> = {
  openai: {
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    baseUrlHint: "Default OpenAI endpoint. No changes needed unless using a proxy.",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Fast, affordable — ideal for most procurement tasks" },
      { value: "gpt-4o", label: "GPT-4o", description: "Most capable — best for complex analysis and vision" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "High capability with 128K context window" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", description: "Fastest and most cost-effective" },
    ],
  },
  openai_4o: {
    defaultBaseUrl: "https://api.openai.com/v1",
    baseUrlPlaceholder: "https://api.openai.com/v1",
    baseUrlHint: "Default OpenAI endpoint. No changes needed unless using a proxy.",
    models: [
      { value: "gpt-4o", label: "GPT-4o", description: "Most capable — vision, reasoning, and analysis" },
      { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Fast, affordable alternative" },
      { value: "gpt-4-turbo", label: "GPT-4 Turbo", description: "High capability with 128K context" },
    ],
  },
  anthropic: {
    defaultBaseUrl: "https://api.anthropic.com",
    baseUrlPlaceholder: "https://api.anthropic.com",
    baseUrlHint: "Default Anthropic endpoint. No changes needed.",
    models: [
      { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", description: "Fast and cost-effective" },
      { value: "claude-sonnet-5", label: "Claude Sonnet 5", description: "Best balance of intelligence and speed" },
    ],
  },
  azure_openai: {
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://your-resource.openai.azure.com/openai/deployments/your-deployment",
    baseUrlHint: "Your Azure OpenAI resource URL. Find it in Azure Portal → your OpenAI resource → Keys & Endpoint.",
    models: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini", description: "Fast and cost-effective (deployment name may differ)" },
      { value: "gpt-4o", label: "GPT-4o", description: "Most capable Azure-hosted model" },
      { value: "gpt-4", label: "GPT-4", description: "Standard GPT-4 deployment" },
      { value: "gpt-35-turbo", label: "GPT-3.5 Turbo", description: "Azure naming: gpt-35-turbo (note the dash)" },
    ],
  },
  aws_bedrock: {
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://bedrock-runtime.us-east-1.amazonaws.com",
    baseUrlHint: "AWS Bedrock endpoint. Replace region (us-east-1) with your preferred AWS region.",
    models: [
      { value: "anthropic.claude-3-5-sonnet-20241022-v2:0", label: "Claude 3.5 Sonnet v2", description: "Best balance of speed and intelligence" },
      { value: "anthropic.claude-3-haiku-20240307-v1:0", label: "Claude 3 Haiku", description: "Fastest and most cost-effective" },
      { value: "meta.llama3-8b-instruct-v1:0", label: "Llama 3 8B", description: "Open-source, cost-effective" },
      { value: "meta.llama3-70b-instruct-v1:0", label: "Llama 3 70B", description: "Open-source, high capability" },
      { value: "mistral.mistral-7b-instruct-v0:2", label: "Mistral 7B", description: "Fast open-source model" },
    ],
  },
  google_vertex: {
    defaultBaseUrl: "",
    baseUrlPlaceholder: "https://us-central1-aiplatform.googleapis.com/v1",
    baseUrlHint: "Google Vertex AI endpoint. Replace us-central1 with your preferred GCP region.",
    models: [
      { value: "gemini-1.5-flash", label: "Gemini 1.5 Flash", description: "Fast and cost-effective for most tasks" },
      { value: "gemini-1.5-pro", label: "Gemini 1.5 Pro", description: "Most capable — 1M token context window" },
      { value: "gemini-1.0-pro", label: "Gemini 1.0 Pro", description: "Stable, well-tested model" },
    ],
  },
  llama3: {
    defaultBaseUrl: "http://localhost:8000/v1",
    baseUrlPlaceholder: "http://your-server:8000/v1",
    baseUrlHint: "Your vLLM/Ollama server endpoint. Default port is 8000 for vLLM, 11434 for Ollama.",
    models: [
      { value: "meta-llama/Meta-Llama-3-8B-Instruct", label: "Llama 3 8B Instruct", description: "8B parameters — runs on 24GB GPU (RTX 4090)" },
      { value: "meta-llama/Meta-Llama-3-70B-Instruct", label: "Llama 3 70B Instruct", description: "70B parameters — requires A100 80GB" },
      { value: "meta-llama/Meta-Llama-3.1-8B-Instruct", label: "Llama 3.1 8B Instruct", description: "Latest 8B with improved capabilities" },
      { value: "meta-llama/Meta-Llama-3.1-70B-Instruct", label: "Llama 3.1 70B Instruct", description: "Latest 70B — production recommended" },
    ],
  },
  mistral: {
    defaultBaseUrl: "http://localhost:8000/v1",
    baseUrlPlaceholder: "http://your-server:8000/v1",
    baseUrlHint: "Your vLLM/Ollama server endpoint. Default port is 8000 for vLLM, 11434 for Ollama.",
    models: [
      { value: "mistralai/Mistral-7B-Instruct-v0.3", label: "Mistral 7B Instruct v0.3", description: "7B — runs on 16GB GPU" },
      { value: "mistralai/Mixtral-8x7B-Instruct-v0.1", label: "Mixtral 8x7B", description: "Mixture-of-experts — higher quality, needs 48GB+" },
      { value: "mistralai/Mistral-Small-Instruct-2409", label: "Mistral Small", description: "Compact and fast" },
    ],
  },
  gemma4_e4b: {
    defaultBaseUrl: "http://localhost:8080/v1",
    baseUrlPlaceholder: "http://localhost:8080/v1",
    baseUrlHint: "MLX-LM server endpoint. Default port is 8080. Start with: mlx_lm.server --model mlx-community/gemma-3-4b-it-4bit --port 8080",
    models: [
      { value: "mlx-community/gemma-3-4b-it-4bit", label: "Gemma 3 4B (4-bit)", description: "4B params, 4-bit quantized — ~2.5 GB, optimised for Apple Silicon" },
    ],
  },
  custom: {
    defaultBaseUrl: "",
    baseUrlPlaceholder: "http://your-server:8000/v1",
    baseUrlHint: "Any OpenAI-compatible endpoint (vLLM, Ollama, TGI, LiteLLM, etc.)",
    models: [
      { value: "custom-model", label: "Custom Model", description: "Enter your model name or use the dropdown" },
    ],
  },
  gemma4_12b_ollama: {
    defaultBaseUrl: "http://localhost:11434/v1",
    baseUrlPlaceholder: "http://localhost:11434/v1",
    baseUrlHint: "Ollama's local OpenAI-compatible endpoint (default port 11434). Change only if Ollama runs on a remote host or custom port.",
    models: [
      { value: "gemma3:4b",  label: "Gemma 3 4B",  description: "Fast and lightweight — recommended for most tasks (~3GB RAM)" },
      { value: "gemma4:12b", label: "Gemma 4 12B", description: "Latest generation — higher capability (~8GB RAM)" },
    ],
  },
};

const providerMeta: Record<string, {
  gradient: string;
  iconBg: string;
  textColor: string;
  securityBg: string;
  Icon: any;
  tagline: string;
  dataSecurity: string;
  setupGuide?: SetupGuide;
}> = {
  openai: {
    gradient: "from-emerald-500 to-green-600",
    iconBg: "bg-emerald-50 dark:bg-emerald-950/40",
    textColor: "text-emerald-600 dark:text-emerald-400",
    securityBg: "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
    Icon: Sparkles,
    tagline: "Industry-leading AI with enterprise DPA",
    dataSecurity: "Data processed on OpenAI servers. Enterprise DPA available.",
  },
  openai_4o: {
    gradient: "from-teal-500 to-emerald-600",
    iconBg: "bg-teal-50 dark:bg-teal-950/40",
    textColor: "text-teal-600 dark:text-teal-400",
    securityBg: "bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800",
    Icon: Eye,
    tagline: "Most capable model with vision & reasoning",
    dataSecurity: "Data processed on OpenAI servers. Enterprise DPA available.",
  },
  anthropic: {
    gradient: "from-amber-500 to-orange-600",
    iconBg: "bg-amber-50 dark:bg-amber-950/40",
    textColor: "text-amber-600 dark:text-amber-400",
    securityBg: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
    Icon: Shield,
    tagline: "Safety-focused frontier AI from Anthropic",
    dataSecurity: "Data processed on Anthropic's servers. Enterprise privacy policies and BAA available.",
  },
  azure_openai: {
    gradient: "from-blue-500 to-indigo-600",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    textColor: "text-blue-600 dark:text-blue-400",
    securityBg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    Icon: Cloud,
    tagline: "Enterprise-grade with full Azure compliance",
    dataSecurity: "Data stays within your Azure tenant. SOC 2, HIPAA, GDPR compliant.",
  },
  aws_bedrock: {
    gradient: "from-orange-500 to-amber-600",
    iconBg: "bg-orange-50 dark:bg-orange-950/40",
    textColor: "text-orange-600 dark:text-orange-400",
    securityBg: "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
    Icon: Server,
    tagline: "Managed AI on your AWS infrastructure",
    dataSecurity: "Data stays within your AWS account. Full AWS compliance coverage.",
  },
  google_vertex: {
    gradient: "from-red-500 to-rose-600",
    iconBg: "bg-red-50 dark:bg-red-950/40",
    textColor: "text-red-600 dark:text-red-400",
    securityBg: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
    Icon: Globe,
    tagline: "Google Cloud AI with enterprise security",
    dataSecurity: "Data stays within Google Cloud. Enterprise compliance certified.",
  },
  llama3: {
    gradient: "from-violet-500 to-purple-600",
    iconBg: "bg-violet-50 dark:bg-violet-950/40",
    textColor: "text-violet-600 dark:text-violet-400",
    securityBg: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
    Icon: Cpu,
    tagline: "Open-source AI — full data sovereignty",
    dataSecurity: "Data never leaves your infrastructure. Complete privacy control.",
    setupGuide: {
      title: "Llama 3 Self-Hosting Guide",
      requirements: [
        "GPU server: NVIDIA A100 (80GB) or H100 recommended for 70B model; RTX 4090 (24GB) for 8B model",
        "Minimum 32GB RAM, 100GB disk space",
        "CUDA 12.0+ and Docker installed",
        "Network access from Prokraya to your model server (port 8000 or custom)",
      ],
      deploymentOptions: [
        { title: "On-Premise", icon: "🏢", description: "Deploy on your own data center servers. Zero data leaves your building." },
        { title: "Private Cloud (AWS)", icon: "☁️", description: "Run on EC2 p4d/p5 instances within your own AWS VPC. Use SageMaker for managed hosting." },
        { title: "Private Cloud (Azure)", icon: "☁️", description: "Deploy on Azure ND-series VMs or use Azure ML managed endpoints." },
        { title: "Private Cloud (GCP)", icon: "☁️", description: "Run on GCP A2/A3 instances or use Vertex AI custom model endpoints." },
      ],
      steps: [
        { step: "Pull the model", detail: "docker pull vllm/vllm-openai:latest" },
        { step: "Start the server", detail: "docker run --gpus all -p 8000:8000 vllm/vllm-openai --model meta-llama/Meta-Llama-3-8B-Instruct" },
        { step: "Configure in Prokraya", detail: "Set API Base URL to http://your-server:8000/v1 and API Key to any string (e.g., 'token-abc')" },
        { step: "Test connection", detail: "Click 'Test Connection' to verify Prokraya can reach your model endpoint" },
      ],
      endpoint: "http://your-server:8000/v1",
      docsUrl: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
    },
  },
  mistral: {
    gradient: "from-cyan-500 to-blue-600",
    iconBg: "bg-cyan-50 dark:bg-cyan-950/40",
    textColor: "text-cyan-600 dark:text-cyan-400",
    securityBg: "bg-cyan-50 dark:bg-cyan-950/30 border-cyan-200 dark:border-cyan-800",
    Icon: Zap,
    tagline: "High-performance open-source model",
    dataSecurity: "Self-hosted — data stays in your private cloud or on-premise.",
    setupGuide: {
      title: "Mistral AI Self-Hosting Guide",
      requirements: [
        "GPU server: NVIDIA A10 (24GB) or better for 7B model; A100 for larger models",
        "Minimum 16GB RAM, 50GB disk space",
        "CUDA 11.8+ and Docker installed",
        "Network access from Prokraya to your model server",
      ],
      deploymentOptions: [
        { title: "On-Premise", icon: "🏢", description: "Deploy on your own servers behind your firewall. Full air-gap support." },
        { title: "Private Cloud (AWS)", icon: "☁️", description: "Run on EC2 g5/p4 instances. Also available through AWS Bedrock for managed hosting." },
        { title: "Private Cloud (Azure)", icon: "☁️", description: "Deploy on Azure NC/ND-series VMs. Also available as Azure AI managed model." },
        { title: "Private Cloud (GCP)", icon: "☁️", description: "Run on GCP GPU instances or use Vertex AI model endpoints." },
      ],
      steps: [
        { step: "Pull the model", detail: "docker pull vllm/vllm-openai:latest" },
        { step: "Start the server", detail: "docker run --gpus all -p 8000:8000 vllm/vllm-openai --model mistralai/Mistral-7B-Instruct-v0.3" },
        { step: "Configure in Prokraya", detail: "Set API Base URL to http://your-server:8000/v1 and API Key to any string (e.g., 'token-abc')" },
        { step: "Test connection", detail: "Click 'Test Connection' to verify Prokraya can reach your model endpoint" },
      ],
      endpoint: "http://your-server:8000/v1",
      docsUrl: "https://docs.mistral.ai/deployment/self-deployment/",
    },
  },
  gemma4_12b_ollama: {
    gradient: "from-blue-500 to-teal-600",
    iconBg: "bg-blue-50 dark:bg-blue-950/40",
    textColor: "text-blue-600 dark:text-blue-400",
    securityBg: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
    Icon: Cpu,
    tagline: "Google Gemma 4 — runs entirely on your device",
    dataSecurity: "Data never leaves your machine. No internet required after initial model download.",
    setupGuide: {
      title: "Gemma 4 12B — Ollama Self-Hosting Guide",
      requirements: [
        "16GB+ RAM recommended (minimum 8GB for Gemma 4 12B with quantization)",
        "~8GB free disk space for the model download",
        "Ollama installed (macOS, Linux, or Windows)",
        "No GPU required — Ollama runs on CPU; Apple Silicon or NVIDIA GPU accelerates inference",
      ],
      deploymentOptions: [
        { title: "Mac (Apple Silicon)", icon: "🍎", description: "Best experience — Ollama uses Metal GPU acceleration. M1/M2/M3 with 16GB+ RAM runs 12B models smoothly." },
        { title: "Mac (Intel) / Linux", icon: "🖥️", description: "CPU-only inference. Slower but functional. 16GB+ RAM recommended for 12B models." },
        { title: "Linux + NVIDIA GPU", icon: "⚡", description: "Install Ollama with CUDA support for fast GPU inference. RTX 3090/4090 or better recommended." },
        { title: "Remote Server", icon: "🌐", description: "Run Ollama on a server and set OLLAMA_HOST=0.0.0.0. Update the API Base URL to http://your-server:11434/v1." },
      ],
      steps: [
        { step: "Install Ollama", detail: "macOS: download from ollama.com or run: brew install ollama — Linux: curl -fsSL https://ollama.ai/install.sh | sh" },
        { step: "Pull the model", detail: "ollama pull gemma4:12b  (if not available yet, try: ollama pull gemma3:12b)" },
        { step: "Start Ollama", detail: "ollama serve  (runs on http://localhost:11434 — starts automatically on macOS after install)" },
        { step: "Verify the API", detail: "curl http://localhost:11434/v1/models  — should list your pulled models in the response" },
        { step: "Configure in Prokraya", detail: "API Base URL is pre-filled. API Key can remain as-is — Ollama does not require authentication. Select your model and click Save." },
      ],
      endpoint: "http://localhost:11434/v1",
      docsUrl: "https://ollama.com/library/gemma4",
    },
  },
  custom: {
    gradient: "from-gray-500 to-slate-600",
    iconBg: "bg-gray-50 dark:bg-gray-950/40",
    textColor: "text-gray-600 dark:text-gray-400",
    securityBg: "bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800",
    Icon: Settings2,
    tagline: "Connect any OpenAI-compatible endpoint",
    dataSecurity: "Fully controlled — your infrastructure, your rules.",
    setupGuide: {
      title: "Custom Endpoint Setup Guide",
      requirements: [
        "An OpenAI-compatible API endpoint (any server that follows the OpenAI Chat Completions API format)",
        "Network access from Prokraya to your endpoint (HTTPS recommended for production)",
        "API key if your endpoint requires authentication",
      ],
      deploymentOptions: [
        { title: "Ollama", icon: "🦙", description: "Lightweight local model runner. Great for testing. Run: ollama serve && ollama run llama3" },
        { title: "vLLM", icon: "⚡", description: "High-throughput production server. GPU required. Supports batching and streaming." },
        { title: "Text Generation Inference", icon: "🤗", description: "HuggingFace's optimized inference server. Supports all HF models." },
        { title: "LiteLLM Proxy", icon: "🔀", description: "Unified proxy to 100+ LLM providers. Adds load balancing and fallbacks." },
      ],
      steps: [
        { step: "Set up your model server", detail: "Choose one of the deployment options above and start your server" },
        { step: "Verify the endpoint", detail: "Test with: curl http://your-server/v1/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"your-model\",\"messages\":[{\"role\":\"user\",\"content\":\"Hello\"}]}'" },
        { step: "Configure in Prokraya", detail: "Enter your API Base URL (e.g., http://your-server:8000/v1), API Key, and Model Name" },
        { step: "Test connection", detail: "Click 'Test Connection' to verify Prokraya can reach your endpoint" },
      ],
      endpoint: "http://your-server:PORT/v1",
      docsUrl: "https://platform.openai.com/docs/api-reference/chat/create",
    },
  },
};

const defaultMeta = {
  gradient: "from-gray-500 to-gray-600",
  iconBg: "bg-gray-50 dark:bg-gray-900/40",
  textColor: "text-gray-600 dark:text-gray-400",
  securityBg: "bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800",
  Icon: Settings2,
  tagline: "AI Model Provider",
  dataSecurity: "Configure data security settings",
};

const animationStyles = `
@keyframes heroGradient {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
@keyframes floatIcon {
  0%, 100% { transform: translateY(0px) rotate(0deg); }
  50% { transform: translateY(-8px) rotate(5deg); }
}
@keyframes pulseGlow {
  0%, 100% { opacity: 0.4; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.1); }
}
@keyframes shimmer {
  0% { background-position: -200% center; }
  100% { background-position: 200% center; }
}
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes slideIn {
  from { opacity: 0; transform: translateX(-10px); }
  to { opacity: 1; transform: translateX(0); }
}
`;

export default function AIModelConfig() {
  const { toast } = useToast();
  const [mounted, setMounted] = useState(false);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, { apiBaseUrl: string; apiKey: string; modelName: string }>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [confirmActivate, setConfirmActivate] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const { data: configs = [], isLoading } = useQuery<AIModelConfig[]>({
    queryKey: ["/api/ai-model-config"],
  });

  const updateMutation = useMutation({
    mutationFn: async ({ providerKey, data }: { providerKey: string; data: any }) => {
      return apiRequest("PUT", `/api/ai-model-config/${providerKey}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-model-config"] });
      toast({ title: "Configuration saved", description: "AI model settings updated successfully." });
    },
    onError: (error: any) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (providerKey: string) => {
      return apiRequest("PUT", `/api/ai-model-config/${providerKey}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-model-config"] });
      setConfirmActivate(null);
      toast({ title: "Provider activated", description: "All AI features will now use this provider." });
    },
    onError: (error: any) => {
      toast({ title: "Activation failed", description: error.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (providerKey: string) => {
      return apiRequest("PUT", `/api/ai-model-config/${providerKey}/disconnect`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-model-config"] });
      toast({ title: "Provider disconnected", description: "No AI provider is currently active. AI features will not work until a provider is activated." });
    },
    onError: (error: any) => {
      toast({ title: "Disconnect failed", description: error.message, variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (providerKey: string) => {
      setTestingProvider(providerKey);
      const res = await apiRequest("POST", `/api/ai-model-config/${providerKey}/test`);
      return res.json();
    },
    onSuccess: (data: any) => {
      setTestingProvider(null);
      if (data.success) {
        toast({ title: "Connection successful", description: data.message });
      } else {
        toast({ title: "Connection failed", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      setTestingProvider(null);
      toast({ title: "Test failed", description: error.message, variant: "destructive" });
    },
  });

  const toggleExpand = (providerKey: string) => {
    if (expandedProvider === providerKey) {
      setExpandedProvider(null);
    } else {
      setExpandedProvider(providerKey);
      const config = configs.find((c) => c.provider_key === providerKey);
      if (config && !editForm[providerKey]) {
        const availableModels = providerDefaults[providerKey]?.models ?? [];
        const latestModel = availableModels[0]?.value ?? "";
        const savedModel = config.model_name ?? "";
        // If the saved model no longer appears in the dropdown (old/removed version),
        // default to the first entry (latest) so the user is on a current model.
        const modelName = availableModels.some((m) => m.value === savedModel) ? savedModel : latestModel;
        setEditForm((prev) => ({
          ...prev,
          [providerKey]: {
            apiBaseUrl: config.api_base_url || providerDefaults[providerKey]?.defaultBaseUrl || "",
            apiKey: "",
            modelName,
          },
        }));
      }
    }
  };

  const handleSave = (providerKey: string) => {
    const form = editForm[providerKey];
    if (!form) return;
    updateMutation.mutate({
      providerKey,
      data: {
        apiBaseUrl: form.apiBaseUrl,
        apiKey: form.apiKey || undefined,
        modelName: form.modelName,
      },
    });
  };

  const activeProvider = configs.find((c) => c.is_active);

  const {
    data: usageData,
    isLoading: usageLoading,
    refetch: refetchUsage,
  } = useQuery<UsageResult>({
    queryKey: ["/api/ai-model-config", activeProvider?.provider_key, "usage"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ai-model-config/${activeProvider!.provider_key}/usage`);
      return res.json();
    },
    enabled: !!activeProvider,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const cloudProviders = configs.filter((c) => c.provider_type === "cloud");
  const selfHostedProviders = configs.filter((c) => c.provider_type === "self_hosted");

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="loading-ai-model-config">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <style>{animationStyles}</style>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link href="/app/dashboard" data-testid="link-back-dashboard">
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
            {activeProvider ? (
              <div className="flex items-center gap-2 text-sm" data-testid="status-active-provider">
                <Radio className="h-3.5 w-3.5 text-green-500 animate-pulse" />
                <span className="text-muted-foreground">Active:</span>
                <span className="font-semibold">{activeProvider.display_name}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm" data-testid="status-no-provider">
                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                <span className="text-amber-600 dark:text-amber-400 font-medium">No AI provider connected</span>
              </div>
            )}
          </div>
        </div>

        <div
          className="relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 25%, #312e81 50%, #1e1b4b 75%, #0f172a 100%)",
            backgroundSize: "200% 200%",
            animation: "heroGradient 8s ease infinite",
          }}
        >
          <div className="absolute inset-0 overflow-hidden">
            <div
              className="absolute top-3 right-[15%] text-white/10"
              style={{ animation: "floatIcon 4s ease-in-out infinite" }}
            >
              <Cpu className="h-10 w-10" />
            </div>
            <div
              className="absolute bottom-3 left-[10%] text-white/10"
              style={{ animation: "floatIcon 5s ease-in-out infinite 1s" }}
            >
              <Server className="h-8 w-8" />
            </div>
            <div
              className="absolute top-1/2 right-[8%] rounded-full bg-indigo-400/20 h-16 w-16"
              style={{ animation: "pulseGlow 3s ease-in-out infinite" }}
            />
            <div
              className="absolute bottom-1/3 left-[20%] rounded-full bg-violet-400/20 h-12 w-12"
              style={{ animation: "pulseGlow 4s ease-in-out infinite 1.5s" }}
            />
          </div>

          <div className="relative z-10 max-w-6xl mx-auto px-6 py-6 text-center">
            <div className="inline-flex items-center gap-2 bg-white/10 rounded-full px-4 py-1.5 mb-3 backdrop-blur-sm">
              <Settings2 className="h-4 w-4 text-indigo-300" />
              <span className="text-sm text-indigo-200 font-medium">Administration</span>
            </div>
            <h1
              className="text-2xl md:text-3xl font-bold text-white mb-2"
              style={{
                background: "linear-gradient(90deg, #fff 0%, #c7d2fe 50%, #fff 100%)",
                backgroundSize: "200% auto",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                animation: "shimmer 3s linear infinite",
              }}
            >
              AI Model Configuration
            </h1>
            <p className="text-indigo-200/80 text-base max-w-2xl mx-auto">
              Choose your AI provider. Use OpenAI for instant setup, deploy on Azure/AWS for enterprise compliance,
              or self-host for complete data sovereignty.
            </p>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 -mt-6 relative z-10 mb-4">
          <div
            className="bg-gradient-to-r from-indigo-50 via-violet-50 to-purple-50 dark:from-indigo-950/30 dark:via-violet-950/30 dark:to-purple-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50 p-6"
            style={{ animation: mounted ? "fadeInUp 0.5s ease-out forwards" : "none", opacity: mounted ? 1 : 0 }}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <Shield className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1">Data Privacy & Sovereignty</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                  Your clients' data security matters. Choose a cloud-hosted provider for quick setup, or deploy an open-source model
                  on your own Azure/AWS infrastructure for complete data isolation. When self-hosted, no procurement data ever leaves
                  your network — addressing even the strictest compliance requirements.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 pb-16">
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Cloud className="h-5 w-5 text-blue-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Cloud Providers</h2>
              <Badge variant="secondary" className="text-xs">Managed Infrastructure</Badge>
            </div>
            <div className="grid gap-4">
              {cloudProviders.map((config, idx) => (
                <ProviderCard
                  key={config.provider_key}
                  config={config}
                  index={idx}
                  mounted={mounted}
                  isExpanded={expandedProvider === config.provider_key}
                  onToggleExpand={() => toggleExpand(config.provider_key)}
                  editForm={editForm[config.provider_key]}
                  onEditForm={(field, value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      [config.provider_key]: { ...prev[config.provider_key], [field]: value },
                    }))
                  }
                  showApiKey={showApiKey[config.provider_key] || false}
                  onToggleApiKey={() =>
                    setShowApiKey((prev) => ({ ...prev, [config.provider_key]: !prev[config.provider_key] }))
                  }
                  onSave={() => handleSave(config.provider_key)}
                  onActivate={() => setConfirmActivate(config.provider_key)}
                  onDisconnect={() => disconnectMutation.mutate(config.provider_key)}
                  onTest={() => testMutation.mutate(config.provider_key)}
                  isSaving={updateMutation.isPending}
                  isTesting={testingProvider === config.provider_key}
                  isDisconnecting={disconnectMutation.isPending}
                  usageData={config.is_active ? usageData : undefined}
                  usageLoading={config.is_active ? usageLoading : false}
                  onRefreshUsage={config.is_active ? (e) => { e.stopPropagation(); refetchUsage(); } : undefined}
                />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Server className="h-5 w-5 text-violet-500" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Self-Hosted / On-Premise</h2>
              <Badge variant="outline" className="text-xs border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">
                <Lock className="h-3 w-3 mr-1" />
                Full Data Sovereignty
              </Badge>
            </div>
            <div className="grid gap-4">
              {selfHostedProviders.map((config, idx) => (
                <ProviderCard
                  key={config.provider_key}
                  config={config}
                  index={idx + cloudProviders.length}
                  mounted={mounted}
                  isExpanded={expandedProvider === config.provider_key}
                  onToggleExpand={() => toggleExpand(config.provider_key)}
                  editForm={editForm[config.provider_key]}
                  onEditForm={(field, value) =>
                    setEditForm((prev) => ({
                      ...prev,
                      [config.provider_key]: { ...prev[config.provider_key], [field]: value },
                    }))
                  }
                  showApiKey={showApiKey[config.provider_key] || false}
                  onToggleApiKey={() =>
                    setShowApiKey((prev) => ({ ...prev, [config.provider_key]: !prev[config.provider_key] }))
                  }
                  onSave={() => handleSave(config.provider_key)}
                  onActivate={() => setConfirmActivate(config.provider_key)}
                  onDisconnect={() => disconnectMutation.mutate(config.provider_key)}
                  onTest={() => testMutation.mutate(config.provider_key)}
                  isSaving={updateMutation.isPending}
                  isTesting={testingProvider === config.provider_key}
                  isDisconnecting={disconnectMutation.isPending}
                  usageData={config.is_active ? usageData : undefined}
                  usageLoading={config.is_active ? usageLoading : false}
                  onRefreshUsage={config.is_active ? (e) => { e.stopPropagation(); refetchUsage(); } : undefined}
                />
              ))}
            </div>
          </div>
        </div>

        <Dialog open={!!confirmActivate} onOpenChange={() => setConfirmActivate(null)}>
          <DialogContent data-testid="dialog-confirm-activate">
            <DialogHeader>
              <DialogTitle>Switch AI Provider</DialogTitle>
              <DialogDescription>
                This will change the AI provider used across all Prokraya features. Make sure the connection is tested and working before activating.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2">
              <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  All AI-powered features (EVA, procurement agents, vendor analysis, etc.) will switch to this provider immediately.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmActivate(null)} data-testid="button-cancel-activate">
                Cancel
              </Button>
              <Button
                onClick={() => confirmActivate && activateMutation.mutate(confirmActivate)}
                disabled={activateMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
                data-testid="button-confirm-activate"
              >
                {activateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Activating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Activate Provider
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

function ModelSelector({
  providerKey,
  modelName,
  onModelChange,
}: {
  providerKey: string;
  modelName: string;
  onModelChange: (val: string) => void;
}) {
  const defaults = providerDefaults[providerKey];
  const models = defaults?.models || [];
  const [useCustom, setUseCustom] = useState(() => {
    if (!modelName) return false;
    return !models.some((m) => m.value === modelName);
  });

  if (models.length === 0) {
    return (
      <Input
        placeholder="Enter model name"
        value={modelName}
        onChange={(e) => onModelChange(e.target.value)}
        className="font-mono text-sm"
        data-testid={`input-model-${providerKey}`}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Select
        value={useCustom ? "__custom__" : modelName}
        onValueChange={(val) => {
          if (val === "__custom__") {
            setUseCustom(true);
            onModelChange("");
          } else {
            setUseCustom(false);
            onModelChange(val);
          }
        }}
        data-testid={`select-model-${providerKey}`}
      >
        <SelectTrigger className="font-mono text-sm" data-testid={`select-model-trigger-${providerKey}`}>
          <SelectValue placeholder="Select a model" />
        </SelectTrigger>
        <SelectContent>
          {models.map((model) => (
            <SelectItem key={model.value} value={model.value} data-testid={`select-model-option-${model.value}`}>
              <div className="flex flex-col">
                <span className="font-medium">{model.label}</span>
                <span className="text-xs text-muted-foreground">{model.description}</span>
              </div>
            </SelectItem>
          ))}
          <SelectItem value="__custom__" data-testid={`select-model-option-custom-${providerKey}`}>
            <div className="flex flex-col">
              <span className="font-medium">Custom model name...</span>
              <span className="text-xs text-muted-foreground">Type your own model identifier</span>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      {useCustom && (
        <Input
          placeholder="Enter custom model name (e.g., ft:gpt-4o-mini:my-org:custom-model)"
          value={modelName}
          onChange={(e) => onModelChange(e.target.value)}
          className="font-mono text-sm"
          data-testid={`input-model-${providerKey}`}
        />
      )}
    </div>
  );
}

type UsageResult =
  | { type: "credits"; totalGranted: number; totalUsed: number; totalAvailable: number; percentageRemaining: number; currency: string }
  | { type: "tokens"; tokensTotal: number; tokensThisMonth: number; tokensToday: number; requestCount: number }
  | { type: "unavailable"; message: string }
  | { type: "error"; message: string };

function fmtModelName(name: string): string {
  return name.replace(/-\d{8}$/, "");
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return `${n}`;
}

function UsageBar({ data, loading }: { data?: UsageResult; loading?: boolean }) {
  if (loading) {
    return <div className="h-2 w-40 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />;
  }
  if (!data) return null;

  if (data.type === "credits") {
    const pct = data.percentageRemaining;
    const barColor = pct > 50 ? "bg-green-500" : pct > 20 ? "bg-amber-500" : "bg-red-500";
    return (
      <div className="flex items-center gap-2">
        <div className="w-20 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">
          {pct}% remaining (${data.totalAvailable.toFixed(2)} of ${data.totalGranted.toFixed(2)})
        </span>
      </div>
    );
  }

  if (data.type === "tokens") {
    return (
      <span className="text-xs text-muted-foreground">
        <span className="font-medium">{fmtTokens(data.tokensTotal)} total</span>
        <span className="opacity-70"> · {fmtTokens(data.tokensThisMonth)} (30 days)</span>
        <span className="opacity-70"> · {fmtTokens(data.tokensToday)} today</span>
        {data.requestCount > 0 && (
          <span className="opacity-60"> · {data.requestCount} {data.requestCount === 1 ? "request" : "requests"}</span>
        )}
      </span>
    );
  }

  if (data.type === "unavailable") {
    return <span className="text-xs text-muted-foreground opacity-60">{data.message}</span>;
  }

  if (data.type === "error") {
    return <span className="text-xs text-red-400">{data.message}</span>;
  }

  return null;
}

interface DailyStat {
  day: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  requests: number;
}

// Local-calendar 'YYYY-MM-DD'. toISOString() must not be used here: it converts to
// UTC first, which lands on the previous day for any timezone east of UTC and would
// stop these keys matching the day buckets the server sends.
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fillDailyRange(data: DailyStat[]): DailyStat[] {
  const map = new Map(data.map((d) => [d.day, d]));
  const result: DailyStat[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    result.push(map.get(key) ?? { day: key, prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, requests: 0 });
  }
  return result;
}

function UsageSummaryPanel({ providerKey }: { providerKey: string }) {
  const { data, isLoading } = useQuery<{ daily: DailyStat[] }>({
    queryKey: ["/api/ai-model-config", providerKey, "usage/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/ai-model-config/${providerKey}/usage/summary`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading usage summary...
      </div>
    );
  }

  const filled = fillDailyRange(data?.daily || []);
  const hasData = filled.some((d) => d.total_tokens > 0);
  const fmtDay = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const row = payload[0]?.payload as DailyStat;
    return (
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 text-xs min-w-[140px]">
        <p className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">{fmtDay(label)}</p>
        {payload.map((entry: any) => (
          <p key={entry.dataKey} style={{ color: entry.fill }} className="mb-0.5">
            {entry.dataKey === "prompt_tokens" ? "Prompt" : "Completion"} : {fmtTokens(entry.value)}
          </p>
        ))}
        <p className="text-gray-500 dark:text-gray-400 mt-1 pt-1 border-t border-gray-100 dark:border-gray-800">
          Requests : {row.requests}
        </p>
      </div>
    );
  };

  return (
    <div className="space-y-4 px-5 pb-5 pt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Daily Token Usage — Last 30 Days
        </h4>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-indigo-400" /> Prompt
          <span className="inline-block w-2.5 h-2.5 rounded-sm bg-violet-400 ml-1" /> Completion
        </span>
      </div>

      {hasData ? (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={filled} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barSize={8}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(128,128,128,0.15)" />
            <XAxis
              dataKey="day"
              tickFormatter={fmtDay}
              interval={4}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v) => fmtTokens(v)}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="prompt_tokens" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
            <Bar dataKey="completion_tokens" stackId="a" fill="#a78bfa" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center h-32 rounded-lg border border-dashed border-gray-200 dark:border-gray-700 text-xs text-muted-foreground">
          No usage recorded in the last 30 days. AI calls will appear here automatically.
        </div>
      )}

      {hasData && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-muted-foreground">
                <th className="text-left py-1.5 pr-4 font-medium">Date</th>
                <th className="text-right py-1.5 pr-4 font-medium">Prompt</th>
                <th className="text-right py-1.5 pr-4 font-medium">Completion</th>
                <th className="text-right py-1.5 pr-4 font-medium">Total</th>
                <th className="text-right py-1.5 font-medium">Requests</th>
              </tr>
            </thead>
            <tbody>
              {filled
                .filter((r) => r.total_tokens > 0)
                .reverse()
                .map((r) => (
                  <tr key={r.day} className="border-b border-gray-50 dark:border-gray-800/60 hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="py-1.5 pr-4 text-gray-600 dark:text-gray-400">{fmtDay(r.day)}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtTokens(r.prompt_tokens)}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-700 dark:text-gray-300">{fmtTokens(r.completion_tokens)}</td>
                    <td className="py-1.5 pr-4 text-right font-medium">{fmtTokens(r.total_tokens)}</td>
                    <td className="py-1.5 text-right text-gray-600 dark:text-gray-400">{r.requests}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground mt-2 opacity-60">
            Per-feature breakdown (e.g. EVA vs Procurement Agent) is not yet tracked — only date-level aggregates are shown.
          </p>
        </div>
      )}
    </div>
  );
}

function ProviderCard({
  config,
  index,
  mounted,
  isExpanded,
  onToggleExpand,
  editForm,
  onEditForm,
  showApiKey,
  onToggleApiKey,
  onSave,
  onActivate,
  onDisconnect,
  onTest,
  isSaving,
  isTesting,
  isDisconnecting,
  usageData,
  usageLoading,
  onRefreshUsage,
}: {
  config: AIModelConfig;
  index: number;
  mounted: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  editForm?: { apiBaseUrl: string; apiKey: string; modelName: string };
  onEditForm: (field: string, value: string) => void;
  showApiKey: boolean;
  onToggleApiKey: () => void;
  onSave: () => void;
  onActivate: () => void;
  onDisconnect: () => void;
  onTest: () => void;
  isSaving: boolean;
  isTesting: boolean;
  isDisconnecting: boolean;
  usageData?: UsageResult;
  usageLoading?: boolean;
  onRefreshUsage?: (e: React.MouseEvent) => void;
}) {
  const meta = providerMeta[config.provider_key] || defaultMeta;
  const [showSummary, setShowSummary] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/ai-model-config/${config.provider_key}/usage`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-model-config", config.provider_key, "usage"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-model-config", config.provider_key, "usage/summary"] });
      toast({ title: "Usage data reset", description: `Token logs for ${config.display_name} have been cleared.` });
    },
    onError: () => {
      toast({ title: "Reset failed", description: "Could not delete usage logs. Please try again.", variant: "destructive" });
    },
  });

  return (
    <Card
      className={`relative overflow-hidden transition-all duration-300 ${
        config.is_active
          ? "ring-2 ring-indigo-500 dark:ring-indigo-400 shadow-lg shadow-indigo-100 dark:shadow-indigo-950/50"
          : "hover:shadow-md"
      }`}
      style={{
        animation: mounted ? `fadeInUp 0.4s ease-out ${index * 80}ms forwards` : "none",
        opacity: mounted ? undefined : 0,
      }}
      data-testid={`card-provider-${config.provider_key}`}
    >
      {config.is_active && (
        <div className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${meta.gradient}`} />
      )}

      <CardContent className="p-0">
        <div
          className="flex items-center gap-4 p-5 cursor-pointer group"
          onClick={onToggleExpand}
          data-testid={`button-expand-${config.provider_key}`}
        >
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl ${meta.iconBg} flex items-center justify-center transition-transform group-hover:scale-105`}>
            <meta.Icon className={`h-6 w-6 ${meta.textColor}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                {config.display_name}
              </h3>
              {config.is_active && (
                <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 border-0 text-xs gap-1" data-testid={`badge-active-${config.provider_key}`}>
                  <CircleCheck className="h-3 w-3" />
                  Active
                </Badge>
              )}
              {config.provider_type === "self_hosted" && (
                <Badge variant="outline" className="text-xs border-violet-300 dark:border-violet-700 gap-1">
                  <Lock className="h-2.5 w-2.5" />
                  Private
                </Badge>
              )}
            </div>
            <div className="mt-1 mb-0.5">
              {config.is_active ? (
                <div className="flex items-center gap-1.5">
                  <UsageBar data={usageData} loading={usageLoading} />
                  {onRefreshUsage && (
                    <button
                      onClick={onRefreshUsage}
                      className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      title="Refresh usage"
                    >
                      <RefreshCw className={`h-3 w-3 ${usageLoading ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowSummary((v) => !v); }}
                    className="flex items-center gap-0.5 text-xs text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors flex-shrink-0"
                  >
                    <BarChart2 className="h-3 w-3" />
                    {showSummary ? "Hide" : "View Summary"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowResetConfirm(true); }}
                    className="text-muted-foreground hover:text-red-500 transition-colors flex-shrink-0"
                    title="Reset usage data"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <div className="h-2 w-28 rounded-full bg-gray-100 dark:bg-gray-800 opacity-40" />
              )}
            </div>
            <p className="text-sm text-muted-foreground truncate">{config.description}</p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <Badge variant="secondary" className="text-xs font-mono">
              {fmtModelName(editForm?.modelName || config.model_name)}
            </Badge>
            {config.is_configured ? (
              <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 gap-1">
                <Link2 className="h-3 w-3" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs text-gray-400 gap-1">
                <AlertCircle className="h-3 w-3" />
                Not configured
              </Badge>
            )}
            {isExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>

        {config.is_active && showSummary && (
          <div
            className="border-t border-gray-100 dark:border-gray-800"
            onClick={(e) => e.stopPropagation()}
            style={{ animation: "slideIn 0.2s ease-out" }}
          >
            <UsageSummaryPanel providerKey={config.provider_key} />
          </div>
        )}

        {isExpanded && editForm && (
          <div
            className="border-t border-gray-100 dark:border-gray-800 px-5 pb-5 pt-4"
            style={{ animation: "slideIn 0.2s ease-out" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <Label htmlFor={`url-${config.provider_key}`} className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                  API Base URL
                </Label>
                <Input
                  id={`url-${config.provider_key}`}
                  placeholder={providerDefaults[config.provider_key]?.baseUrlPlaceholder || "https://api.openai.com/v1"}
                  value={editForm.apiBaseUrl}
                  onChange={(e) => onEditForm("apiBaseUrl", e.target.value)}
                  className="font-mono text-sm"
                  data-testid={`input-url-${config.provider_key}`}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {providerDefaults[config.provider_key]?.baseUrlHint || "The base URL of the API endpoint"}
                </p>
              </div>

              <div>
                <Label htmlFor={`key-${config.provider_key}`} className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  API Key
                </Label>
                <div className="relative">
                  <Input
                    id={`key-${config.provider_key}`}
                    type={showApiKey ? "text" : "password"}
                    placeholder={config.api_key_masked || "Enter API key"}
                    value={editForm.apiKey}
                    onChange={(e) => onEditForm("apiKey", e.target.value)}
                    className="font-mono text-sm pr-10"
                    data-testid={`input-key-${config.provider_key}`}
                  />
                  <button
                    type="button"
                    onClick={onToggleApiKey}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    data-testid={`button-toggle-key-${config.provider_key}`}
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {config.api_key_masked && (
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to keep existing key</p>
                )}
              </div>

              <div>
                <Label htmlFor={`model-${config.provider_key}`} className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                  <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
                  Model Name
                </Label>
                <ModelSelector
                  providerKey={config.provider_key}
                  modelName={editForm.modelName}
                  onModelChange={(val) => onEditForm("modelName", val)}
                />
              </div>

              <div className="flex items-end">
                <div className={`w-full p-3 rounded-lg border ${meta.securityBg}`}>
                  <div className="flex items-start gap-2">
                    <Shield className={`h-4 w-4 ${meta.textColor} flex-shrink-0 mt-0.5`} />
                    <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                      {meta.dataSecurity}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {meta.setupGuide && (
              <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 overflow-hidden" data-testid={`setup-guide-${config.provider_key}`}>
                <button
                  onClick={() => {
                    const el = document.getElementById(`guide-${config.provider_key}`);
                    if (el) el.classList.toggle("hidden");
                    const arrow = document.getElementById(`guide-arrow-${config.provider_key}`);
                    if (arrow) arrow.classList.toggle("rotate-180");
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  data-testid={`button-toggle-guide-${config.provider_key}`}
                >
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-indigo-500" />
                    <span>{meta.setupGuide.title}</span>
                  </div>
                  <ChevronDown id={`guide-arrow-${config.provider_key}`} className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
                </button>

                <div id={`guide-${config.provider_key}`} className="hidden px-4 pb-4 space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">System Requirements</h4>
                    <ul className="space-y-1.5">
                      {meta.setupGuide.requirements.map((req, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0 mt-0.5" />
                          <span>{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Deployment Options</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {meta.setupGuide.deploymentOptions.map((opt, i) => (
                        <div key={i} className="p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-base">{opt.icon}</span>
                            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{opt.title}</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{opt.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Quick Setup Steps</h4>
                    <div className="space-y-3">
                      {meta.setupGuide.steps.map((s, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{i + 1}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{s.step}</p>
                            <code className="block mt-1 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded px-2 py-1.5 font-mono break-all whitespace-pre-wrap">{s.detail}</code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <Link2 className="h-3.5 w-3.5" />
                      <span>Default endpoint: <code className="font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{meta.setupGuide.endpoint}</code></span>
                    </div>
                    <a
                      href={meta.setupGuide.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      data-testid={`link-docs-${config.provider_key}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Documentation
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onTest}
                  disabled={isTesting}
                  className="gap-1.5"
                  data-testid={`button-test-${config.provider_key}`}
                >
                  {isTesting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Testing...
                    </>
                  ) : (
                    <>
                      <TestTube2 className="h-3.5 w-3.5" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSave}
                  disabled={isSaving}
                  className="gap-1.5"
                  data-testid={`button-save-${config.provider_key}`}
                >
                  {isSaving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Settings2 className="h-3.5 w-3.5" />
                  )}
                  Save Configuration
                </Button>

                {config.is_active ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onDisconnect}
                    disabled={isDisconnecting}
                    className="gap-1.5 text-red-600 border-red-300 dark:text-red-400 dark:border-red-700"
                    data-testid={`button-disconnect-${config.provider_key}`}
                  >
                    {isDisconnecting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    onClick={onActivate}
                    className="gap-1.5 bg-indigo-600 hover:bg-indigo-700"
                    data-testid={`button-activate-${config.provider_key}`}
                  >
                    <Zap className="h-3.5 w-3.5" />
                    Connect & Activate
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Usage Data</DialogTitle>
            <DialogDescription>
              This will permanently delete all token usage logs for <strong>{config.display_name}</strong>.
              The usage counter will reset to zero. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowResetConfirm(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowResetConfirm(false);
                resetMutation.mutate();
              }}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Reset Usage
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
