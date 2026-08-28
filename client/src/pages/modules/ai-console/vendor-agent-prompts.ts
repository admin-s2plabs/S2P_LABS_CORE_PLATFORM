export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

const VENDOR_ONBOARDING_TECHNOVA_CAPABILITY_TEXT =
  "Onboard {{Supplier Name}}, with contact person {{Contact Name}}, email {{Email}}, mobile number {{Mobile Number}}, company type {{Company Type}}, Address {{Address}}";

/** Supplier Onboarding in Explore Capabilities: same string is shown in the list and placed in the composer. */
export const VENDOR_ONBOARDING_TECHNOVA_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_TECHNOVA_CAPABILITY_TEXT;

export const VENDOR_ONBOARDING_TECHNOVA_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_TECHNOVA_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_PRECISION_CAPABILITY_TEXT =
  "Register a new supplier: {{Supplier Name}} located in {{City}}, with contact person {{Contact Name}}, email {{Email}}, mobile number {{Mobile Number}}, company type {{Company Type}}, Address {{Address}}";

export const VENDOR_ONBOARDING_PRECISION_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_PRECISION_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_PRECISION_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_PRECISION_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_GULF_TRADING_CAPABILITY_TEXT =
  "Add new supplier: {{Supplier Name}} located in {{City}}, {{Country}}, with contact person {{Contact Name}}, email {{Email}}, mobile number {{Mobile Number}}, Address {{Address}}";

export const VENDOR_ONBOARDING_GULF_TRADING_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_GULF_TRADING_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_GULF_TRADING_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_GULF_TRADING_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_SUNRISE_CAPABILITY_TEXT =
  "Create supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_SUNRISE_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_SUNRISE_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_SUNRISE_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_SUNRISE_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_NEXGEN_CAPABILITY_TEXT =
  "Onboard new supplier {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, contact {{Contact Name}}, {{Email}}, {{Mobile Number}}, designation: {{Designation}}";

export const VENDOR_ONBOARDING_NEXGEN_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_NEXGEN_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_NEXGEN_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_NEXGEN_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_PACIFIC_LOGISTICS_CAPABILITY_TEXT =
  "Register {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_PACIFIC_LOGISTICS_CAPABILITY_DISPLAY_PROMPT =
  VENDOR_ONBOARDING_PACIFIC_LOGISTICS_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_PACIFIC_LOGISTICS_CAPABILITY_CHAT_TEMPLATE =
  VENDOR_ONBOARDING_PACIFIC_LOGISTICS_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_EUROTECH_CAPABILITY_TEXT =
  "Add supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_EUROTECH_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_EUROTECH_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_EUROTECH_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_EUROTECH_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_GREENFIELD_AGRO_CAPABILITY_TEXT =
  "Create a new supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_GREENFIELD_AGRO_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_GREENFIELD_AGRO_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_GREENFIELD_AGRO_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_GREENFIELD_AGRO_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_STELLAR_IT_CAPABILITY_TEXT =
  "Onboard {{Supplier Name}} as a {{Company Type}} company in {{City}}, {{State}}, {{Country}} {{Postal Code}}, address: {{Address Line}}, contact {{Contact Name}} at {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_STELLAR_IT_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_STELLAR_IT_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_STELLAR_IT_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_STELLAR_IT_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_ALKHALEJ_STEEL_CAPABILITY_TEXT =
  "Register new supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_ALKHALEJ_STEEL_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_ALKHALEJ_STEEL_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_ALKHALEJ_STEEL_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_ALKHALEJ_STEEL_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_KAVERI_CAPABILITY_TEXT =
  "Add supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_KAVERI_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_KAVERI_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_KAVERI_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_KAVERI_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_CLOUDBRIDGE_CAPABILITY_TEXT =
  "Create supplier {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{Address Area}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}, designation: {{Designation}}";

export const VENDOR_ONBOARDING_CLOUDBRIDGE_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_CLOUDBRIDGE_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_CLOUDBRIDGE_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_CLOUDBRIDGE_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_ROYAL_PACKAGING_CAPABILITY_TEXT =
  "Onboard {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_ROYAL_PACKAGING_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_ROYAL_PACKAGING_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_ROYAL_PACKAGING_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_ROYAL_PACKAGING_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_APEX_INFRA_CAPABILITY_TEXT =
  "Register new supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{State}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_APEX_INFRA_CAPABILITY_DISPLAY_PROMPT = VENDOR_ONBOARDING_APEX_INFRA_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_APEX_INFRA_CAPABILITY_CHAT_TEMPLATE = VENDOR_ONBOARDING_APEX_INFRA_CAPABILITY_TEXT;

const VENDOR_ONBOARDING_DRAGON_ELECTRONICS_CAPABILITY_TEXT =
  "Add supplier: {{Supplier Name}}, {{Company Type}}, {{Address Line}}, {{City}}, {{Country}}, {{Postal Code}}, {{Contact Name}}, {{Email}}, {{Mobile Number}}";

export const VENDOR_ONBOARDING_DRAGON_ELECTRONICS_CAPABILITY_DISPLAY_PROMPT =
  VENDOR_ONBOARDING_DRAGON_ELECTRONICS_CAPABILITY_TEXT;
export const VENDOR_ONBOARDING_DRAGON_ELECTRONICS_CAPABILITY_CHAT_TEMPLATE =
  VENDOR_ONBOARDING_DRAGON_ELECTRONICS_CAPABILITY_TEXT;

const VENDOR_INVITATION_INVITE_AT_EMAIL_CAPABILITY_TEXT = "Invite {{Supplier Name}} at {{Email}}";

const VENDOR_INVITATION_SEND_INVITATION_TO_VENDOR_AT_EMAIL_CAPABILITY_TEXT =
  "Send an invitation to {{Supplier Name}} at {{Email}}";

const VENDOR_INVITATION_INVITE_REGISTER_EMAIL_CAPABILITY_TEXT =
  "Invite {{Supplier Name}} to register, email: {{Email}}";

const VENDOR_INVITATION_SEND_VENDOR_REGISTRATION_INVITE_CAPABILITY_TEXT =
  "Send supplier registration invite to {{Supplier Name}} at {{Email}}";

const VENDOR_INVITATION_SEND_INVITATION_COMMA_EMAIL_CAPABILITY_TEXT =
  "Send an invitation to {{Supplier Name}}, email: {{Email}}";

const VENDOR_INVITATION_REGISTRATION_LINK_CAPABILITY_TEXT =
  "Send registration link to {{Supplier Name}} at {{Email}}";

const VENDOR_INVITATION_INVITE_VENDOR_COMMA_EMAIL_CAPABILITY_TEXT =
  "Invite supplier {{Supplier Name}}, email: {{Email}}";

export const vendorAgentPrompts: PromptCategory[] = [
  {
    module: "Supplier Onboarding",
    icon: "UserPlus",
    prompts: [
      "Onboard {{Organization Name}} from {{Location}}, contact {{Contact Name}} at {{Email}}, {{Phone Number}}, {{Organization Type}}, {{Address}}.",
      "Register a new supplier: {{Organization Name}}, {{Location}}, contact {{Contact Name}}, {{Email}}, {{Phone Number}}.",
      "Add a new supplier: {{Organization Name}}, {{Location}}, contact {{Contact Name}}, {{Email}}, {{Phone Number}}, {{Address}}.",
    ],
  },
  {
    module: "Supplier Invitation",
    icon: "Mail",
    prompts: [
      "Send an invitation to {{Organization Name}} at {{Email}}.",
      "Send a supplier registration invitation.",
      "Invite {{Organization Name}} at {{Email}}.",
      "Send a supplier registration invite to {{Organization Name}} at {{Email}}.",
    ],
  },
  {
    module: "Risk Assessment & Compliance",
    icon: "Shield",
    prompts: [
      "What's the risk assessment for supplier {{Supplier ID}}?",
      "Run a risk check on {{Organization Name}}.",
      "Show me the compliance status for {{Organization Name}}.",
      "Is {{Organization Name}} compliant with all document requirements?",
    ],
  },
  {
    module: "Supplier Search & Discovery",
    icon: "Search",
    prompts: [
      "Show all active suppliers.",
      // "List inactive suppliers.",
      "Find suppliers in {{Country}}.",
      // "Show me all blocked suppliers.",
      "Find suppliers named {{Organization Name}}.",
      "Search suppliers in {{City}}.",
      "Search for {{Category}} suppliers.",
      "Search for {{Category}} suppliers in {{Country/City}}.",
      "Identify the suppliers license(s) that are due to expire soon.",
    ],
  },
  {
    module: "Supplier Profile & Details",
    icon: "Users",
    prompts: [
      "Show me the full profile of {{Supplier Name}}.",
      "Show banking details for {{Supplier Name}}.",
      "Who is the primary contact for {{Supplier Name}}?",
      "What documents does supplier {{Supplier ID}} have on file?",
      "Show me the address and location for supplier {{Supplier ID}}.",
      "What categories does {{Supplier Name}} supply in?",
      "Get the details of {{Document Type 1}} and {{Document Type 2}} for {{Supplier Name}}.",
      "What is the legal entity type of {{Supplier Name}}?",
      "When is {{Supplier Name}}'s license going to expire?",
    ],
  },
  {
    module: "Supplier Analytics & Statistics",
    icon: "BarChart3",
    prompts: [
      "Show me supplier statistics.",
      "How many total suppliers do we have?",
      "Give me a breakdown of suppliers by status.",
      "Show supplier count by country.",
      "How many active versus inactive suppliers are there?",
      "Give me a breakdown of suppliers by {{Category}}.",
      "How many {{Legal Entity Type}} suppliers are registered in the platform?",
      "Which suppliers have {{Document Type}} certification?",
      "Give me an executive summary of our supplier portfolio.",
    ],
  },
  {
    module: "Supplier Comparison",
    icon: "ArrowLeftRight",
    prompts: [
      "Compare {{Organization 1}} and {{Organization 2}}.",
      "Compare the compliance status of {{Organization 1}} and {{Organization 2}}.",
      "Compare {{Organization 1}}, {{Organization 2}}, and {{Organization 3}}.",
      "Compare supplier {{Supplier ID 1}} and supplier {{Supplier ID 2}}.",
    ],
  },
  {
    module: "Document & Certification Search",
    icon: "FileCheck",
    prompts: [
      "Which suppliers have {{Document Type}} certification?",
      "Find suppliers with {{Document Type}} documents.",
      "Show suppliers whose {{Document Type}} has expired.",
      "List suppliers whose {{Document Type}} will expire soon.",
    ],
  },
];
