export interface PromptCategory {
  module: string;
  icon: string;
  prompts: string[];
}

export const CREATE_BID_QUICK_ACTION_TEMPLATE =
  "Create an {{RFQ/RFP/Tender}} for {{item/service/project}} & Add {{quantity}} closing on {{closing_date}}";

export const CONVERT_PR_QUICK_ACTION_TEMPLATE =
  "Convert PR {{pr_number}} into an {{RFQ/RFP/Tender}} and assign suppliers";

export const VIEW_BIDS_QUICK_ACTION_TEMPLATE =
  "Show bids by {{status/type/department}}";

export const MANAGE_VENDORS_QUICK_ACTION_TEMPLATE =
  "Show, invite, compare for bid {{Bid Number}} by {{Location/Category/Status}}";

export const AWARDS_ANALYTICS_QUICK_ACTION_TEMPLATE =
  "Show Bids which are Awarded";

export const ANALYTICS_QUICK_ACTION_TEMPLATE = "Show bid statistics";

export const UPDATES_QUICK_ACTION_TEMPLATE =
  "Please show me all my pending sourcing tasks";

export const sourcingAgentPrompts: PromptCategory[] = [
  {
    module: "Create Bids",
    icon: "Plus",
    prompts: [
      "Create an {{RFQ/RFP/Tender}} for {{quantity}} {{item/service}}",
      "Create a new {{RFQ/RFP/Tender}} titled \"{{title}}\"",
      "Start a bid for {{requirement description}}",
      "Create an {{RFQ/RFP/Tender}} closing on {{closing_date}}",
      "Create a sourcing event for {{service/item}}",
      "Start procurement for {{quantity}} {{item}}",
    ],
  },
  {
    module: "Manage & Publish Bids",
    icon: "Send",
    prompts: [
      "Add {{quantity}} {{item}} at {{price}} to bid {{bid_number}}",
      "Add supplier {{supplier_name/supplier_id}} to bid {{bid_number}}",
      "Invite supplier {{supplier_id/s}} to bid {{bid_number}}",
      "Invite approved suppliers in the {{category}} category to bid {{bid_number}}",
      "Update the pricing for line item {{line_item}} in bid {{bid_number}} to {{price}}.",
      "Remove supplier {{supplier_name/supplier_id}} from bid {{bid_number}}",
      "Publish bid {{bid_number}}",
      "Publish the latest draft {{RFQ/RFP/Tender}}",
      "Add {{#}} as the {{technical/Commercial reviewer}} for {{RFP/Tender}}",
      "Replace the {{technical/Commercial reviewer}} from {{#}} to {{#}} for {{RFP/Tender}}",
      "Add {{#}} as the {{technical/Commercial approver}} for {{Tender}}",
      "Replace the {{technical /Commercial approver}} from {{#}} to {{#}} for {{Tender}}",
      "Add {{#}} as Committee team for {{Tender}}",
      "Make bid {{bid_number}} live for supplier responses",
      "Is bid {{bid_number}} ready to publish?",
    ],
  },
  {
    module: "Bid Conversion",
    icon: "ArrowRightLeft",
    prompts: [
      "Convert PR {{pr_number}} to an {{RFQ/RFP/Tender}}",
      "Create a bid from purchase requisition {{pr_number}}",
      "Source PR {{pr_number}} as a tender",
      "Show approved PRs ready for sourcing",
      "Which purchase requisitions can be converted to bids?",
      "Create an {{RFQ/RFP/Tender}} from the latest approved PR",
      "Show approved PRs from the {{department}} department",
      "Which PRs have not been sourced/converted yet?",
    ],
  },
  {
    module: "Bid Overview & Intelligence",
    icon: "Search",
    prompts: [
      "List all active {{RFQs/RFPs/Tenders}}",
      "Find bids in {{status}} status",
      "Show bids closing this {{week/month/quarter}}",
      "Show bids currently in evaluation",
      "List all cancelled bids",
      "Show the count of {{status}} bids",
      "Find all bids created this {{quarter/year}}",
      "Show details for bid {{bid_number}}",
      "What's the status of bid {{bid_number}}?",
      "Get the closing date for bid {{bid_number}}",
      "Who created bid {{bid_number}}?",
      "Show the full details of the latest {{RFQ/RFP/Tender}}",
      "What's the estimated value of bid {{bid_number}}?",
      "What department is bid {{bid_number}} for?",
      "Give me a summary of bid {{bid_number}}?",
      "What currency is used in bid {{bid_number}}?",
      "What does the sourcing pipeline look like?",
    ],
  },
  {
    module: "Bid Suppliers",
    icon: "Users",
    prompts: [
      "Show suppliers invited to bid {{bid_number}}",
      "How many suppliers are on bid {{bid_number}}?",
      "Which suppliers were invited to the latest bid?",
      "Show supplier contact details for bid {{bid_number}}",
      "Which suppliers have been invited to more than {{count}} bids?",
      "List supplier emails for bid {{bid_number}}",
      "Which approved suppliers haven't been invited to any bids?",
    ],
  },
  {
    module: "Bid Requirements & Clauses",
    icon: "ClipboardCheck",
    prompts: [
      "Add requirement to bid {{bid_number}}",
      "Add {{requirement}} to bid {{bid_number}}",
      "Add terms and conditions for bid {{bid_number}}",
      "Show requirements for bid {{bid_number}}",
      "List mandatory requirements for bid {{bid_number}}",
      "Show terms and conditions for bid {{bid_number}}",
      "How many requirements does bid {{bid_number}} have?",
      "List {{(Business/Finance/General/Management) Category}} requirements for bid {{bid_number}}",
    ],
  },
  {
    module: "Supplier Responses & Evaluation",
    icon: "MessageSquare",
    prompts: [
      "Show supplier rankings for bid {{bid_number}}",
      "Suggest commercial scores for bid {{bid_number}}",
      "Show commercial scores for bid {{bid_number}}",
      "Suggest Technical scores for bid {{bid_number}}",
      "Show technical scores for bid {{bid_number}}",
      "Show supplier responses for bid {{bid_number}}",
      "Give the technical scoring for {{bid_number}}",
      "Give the Commercial scoring for {{bid_number}}",
      "Who responded to bid {{bid_number}}?",
      "Compare supplier responses for bid {{bid_number}}",
      "Show response totals for bid {{bid_number}}",
      "Which suppliers have not responded to bid {{bid_number}}?",
      "Show evaluation scores for bid {{bid_number}}",
      "What are the technical scores for bid {{bid_number}}?",
      "Compare commercial scores for bid {{bid_number}}",
    ],
  },
  {
    module: "Supplier Bid Engagement",
    icon: "Users",
    prompts: [
      "How many suppliers were invited for {{bid_number}}?",
      "List all suppliers invited for {{bid_number}}.",
      "List suppliers invited but not acknowledged for {{bid_number}}.",
      "List suppliers who acknowledged participation for {{bid_number}}.",
      "List suppliers who acknowledged non-participation for {{bid_number}}.",
      "List suppliers who acknowledged but have not responded to {{bid_number}}.",
      "List suppliers who responded to {{bid_number}}.",
      "How many suppliers have acknowledged {{bid_number}}?",
      "How many suppliers are participating in {{bid_number}}?",
      "How many suppliers have responded to {{bid_number}}?",
      "Show the complete supplier status for {{bid_number}} (Invited, Acknowledged, Participating/Not Participating, Responded).",
      "Summarize the sourcing progress for {{bid_number}}.",
      "Which bids was {{supplier}} invited to?",
      "Which bids is {{supplier}} participating in?",
      "Which bids has {{supplier}} responded to?",
      "Which invited bids has {{supplier}} not acknowledged?",
      "Which acknowledged bids has {{supplier}} not responded to?",
      "Which suppliers have not responded to any bid they were invited to?",
      "Which suppliers have never acknowledged any invited bid?",
      "Which suppliers acknowledged participation but have not responded to one or more invited bids?",
    ],
  },
  {
    module: "Awards & Outcomes",
    icon: "Trophy",
    prompts: [
      "Show bids which are to be Awarded",
      "Show awards for bid {{bid_number}}",
      "Who won bid {{bid_number}}?",
      "Suggest me the best supplier for the {{bid_number}} to award",
      "What was the awarded amount for bid {{bid_number}}?",
      "Has a PO been created from bid {{bid_number}}?",
      "Show all awarded bids this {{quarter/year}}",
      "What's the total awarded value this year?",
      "Show award history for top suppliers",
      "Which supplier has won the most bids?",
      "Show pending awards requiring PO creation",
    ],
  },
];
