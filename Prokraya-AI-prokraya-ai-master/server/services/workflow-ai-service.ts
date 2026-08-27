import { getAIClient, getAIModelName } from "./ai-client";

interface WorkflowNode {
  id: string;
  type: "trigger" | "agent" | "condition" | "action" | "notification";
  label: string;
  agent?: string;
  position: { x: number; y: number };
}

interface Connection {
  from: string;
  to: string;
  label?: string;
}

interface GeneratedWorkflow {
  name: string;
  description: string;
  nodes: WorkflowNode[];
  connections: Connection[];
}

export async function generateWorkflowFromText(prompt: string): Promise<GeneratedWorkflow> {
  const systemPrompt = `You are a procurement workflow builder AI. Convert natural language descriptions into structured workflows.

Available components:

TRIGGERS (what starts the workflow):
- PR Approved: When a Purchase Request is approved
- PR Value Threshold: When PR value exceeds a specific amount (e.g., > ₹10L)
- Schedule: Run on a schedule (daily, weekly, monthly)
- Document Expiry: When vendor document expires
- New Vendor: When new vendor registers
- Contract Expiry: X days before contract expires

AGENTS (AI-powered actions):
- Vendor Agent: Find vendors, validate documents, check compliance, recommend vendors
- Sourcing Agent: Create RFQs, evaluate bids, compare quotes
- Contracts Agent: Analyze terms, manage renewals, check clauses
- Spend Agent: Analyze spend patterns, find savings opportunities
- Compliance Agent: Check policies, validate documents, audit trails

CONDITIONS (branching logic):
- If/Else: Branch based on any condition
- Value Check: Check amount thresholds
- Status Check: Check record status
- Approval Gate: Wait for human approval

ACTIONS (system operations):
- Create RFQ: Create a new RFQ/Bid
- Update Status: Update record status
- Suspend Vendor: Suspend a vendor
- Create PO: Create Purchase Order
- Send to Vendors: Invite vendors to bid
- Auto-Approve: Automatically approve

NOTIFICATIONS:
- Email: Send email notification
- In-App Alert: Create in-app notification
- Slack: Send Slack message
- Teams: Send Microsoft Teams message

Rules:
1. Every workflow MUST start with exactly one trigger
2. Triggers connect to agents, conditions, or actions
3. Conditions can have two outputs (Yes/No branches)
4. Workflows typically end with actions or notifications
5. Position nodes left-to-right, with Y offset for branches
6.If no audio or speech-to-text is involved, replay as no speech detected.


Return a JSON object with:
{
  "name": "Workflow name",
  "description": "Brief description",
  "nodes": [
    { "id": "n1", "type": "trigger|agent|condition|action|notification", "label": "Node label", "agent": "Agent name (only for agent type)", "position": { "x": number, "y": number } }
  ],
  "connections": [
    { "from": "n1", "to": "n2", "label": "optional label for condition branches" }
  ]
}

Position guidelines:
- Start X at 100, increment by 220 for each step
- Main flow Y at 200
- Yes branch Y at 120, No branch Y at 280
- Keep nodes evenly spaced`;

  const openai = await getAIClient();
  const modelName = await getAIModelName();
  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Convert this to a workflow: "${prompt}"` }
    ],
    response_format: { type: "json_object" },
    temperature: 0.3,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from AI");
  }

  const workflow = JSON.parse(content) as GeneratedWorkflow;
  
  // Validate and fix positions if needed
  workflow.nodes = workflow.nodes.map((node, idx) => ({
    ...node,
    position: node.position || { x: 100 + idx * 220, y: 200 }
  }));

  return workflow;
}

export async function suggestWorkflowImprovements(workflow: GeneratedWorkflow): Promise<string[]> {
  const openai = await getAIClient();
  const modelName = await getAIModelName();
  const response = await openai.chat.completions.create({
    model: modelName,
    messages: [
      { 
        role: "system", 
        content: "You are a procurement workflow optimization expert. Analyze workflows and suggest improvements. Return a JSON array of suggestion strings." 
      },
      { 
        role: "user", 
        content: `Analyze this workflow and suggest 2-3 improvements:\n${JSON.stringify(workflow, null, 2)}` 
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.5,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const result = JSON.parse(content);
  return result.suggestions || [];
}
