import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { FormSheet } from "@/components/form-sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Icon, Loader2, Pencil, Plus, Trash2, User, UserPlus, Users, X } from "lucide-react";
import { useState } from "react";

interface WorkflowDefinition {
  id: number;
  name: string;
  list_status?: boolean;
}

interface ConditionRule {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  logic: "AND" | "OR";
  rules: (ConditionRule | ConditionGroup)[];
}

interface Assignment {
  id?: number;
  assignment_type: string;
  assignment_expression: string;
  assignment_name?: string;
  condition?: string;
  conditionData?: ConditionGroup;
}

interface WorkflowStep {
  id: number;
  name: string;
  step_order: number;
  step_type: string;
  assignments: Assignment[];
}

interface ChecklistItem {
  id: string;
  backendId?: number;
  text: string;
  itemMandatory: boolean;
  remarkMandatory: boolean;
}

interface BackendQuestion {
  id: number;
  question_text: string;
  reference_step_id: number;
  option_required?: string;
  remarks_required?: string;
}

const DEFAULT_CHECKLISTS: Record<number, ChecklistItem[]> = {
  1: [
    { id: "vendor-gst", text: "GST number verified", itemMandatory: true, remarkMandatory: false },
    { id: "vendor-pan", text: "PAN verified", itemMandatory: true, remarkMandatory: false },
    { id: "vendor-bank", text: "Bank details validated", itemMandatory: true, remarkMandatory: false },
    { id: "vendor-docs", text: "Required documents uploaded", itemMandatory: true, remarkMandatory: false },
    { id: "vendor-dup", text: "Duplicate supplier checked", itemMandatory: false, remarkMandatory: false },
  ],
  2: [
    { id: "pr-budget-available", text: "Budget available for this request", itemMandatory: true, remarkMandatory: false },
    { id: "pr-category", text: "Correct category selectedCorrect category selected", itemMandatory: true, remarkMandatory: false },
    { id: "pr-business-justification", text: "Business justification reviewed", itemMandatory: true, remarkMandatory: false },
     { id: "pr-need-by-date", text: "Need-by date is realistic", itemMandatory: true, remarkMandatory: false }
  ],
   3: [
    // Purchase Order
    {
      id: "po-budget-checked",
      text: "Budget checked",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "po-supplier-confirmed-availability",
      text: "Supplier confirmed availability",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "po-payment-terms-match-contract",
      text: "Payment terms match contract / awarded bid",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "po-delivery-location-date-verified",
      text: "Delivery location and date verified",
      itemMandatory: false,
      remarkMandatory: false,
    }
   ],

    // Invoice
   4: [ {
      id: "invoice-3-way-match",
      text: "3-way match completed (PO · GRN · Invoice)",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "invoice-duplicate-checked",
      text: "Duplicate invoice checked",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "invoice-tax-validated",
      text: "Tax amounts validated",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "invoice-amount-within-po",
      text: "Invoice amount within PO value",
      itemMandatory: true,
      remarkMandatory: false,
    }
  ],

    // Budget
    5: [{
      id: "budget-period-entity-correct",
      text: "Budget period and entity correct",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "budget-cost-centre-reviewed",
      text: "Cost centre allocation reviewed",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "budget-line-item-verified",
      text: "Line item amounts verified",
      itemMandatory: false,
      remarkMandatory: false,
    },
    {
      id: "budget-no-overlap",
      text: "No overlap with an existing budget",
      itemMandatory: false,
      remarkMandatory: false,
    }
  ],

    // Bid
   6: [{
      id: "bid-award-justification",
      text: "Award justification documented",
      itemMandatory: true,
      remarkMandatory: true,
    },
    {
      id: "bid-quote-compared",
      text: "Selected quote compared with other quotes",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "bid-awarded-quantities",
      text: "Awarded quantities match requirement",
      itemMandatory: false,
      remarkMandatory: false,
    },
    {
      id: "bid-supplier-compliance",
      text: "Supplier compliance documents valid",
      itemMandatory: true,
      remarkMandatory: false,
    }
  ],

    // Contracts
    7: [{
      id: "contract-legal-review",
      text: "Legal review completed",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "contract-terms-match",
      text: "Terms match the awarded bid / negotiation",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "contract-validity-dates",
      text: "Contract validity dates correct",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "contract-signatory-authority",
      text: "Signatory authority confirmed",
      itemMandatory: false,
      remarkMandatory: false,
    }],

    // Auction
    8: [{
      id: "auction-result-reviewed",
      text: "Auction result reviewed (winning rank / price)",
      itemMandatory: true,
      remarkMandatory: false,
    },
    {
      id: "auction-award-comments",
      text: "Award comments recorded",
      itemMandatory: false,
      remarkMandatory: true,
    },
    {
      id: "auction-awarded-quantities",
      text: "Awarded quantities verified",
      itemMandatory: false,
      remarkMandatory: false,
    },
    {
      id: "auction-supplier-eligibility",
      text: "Supplier eligibility confirmed",
      itemMandatory: true,
      remarkMandatory: false,
    }
  ],
};

interface WorkflowWithSteps extends WorkflowDefinition {
  steps: WorkflowStep[];
}

interface Role {
  id: number;
  role_name: string;
  role_display_name: string;
}

interface UserOption {
  id: number;
  email_id: string;
  name: string;
  user_name: string;
}

const WORKFLOW_TABS = [
  { id: 1, name: "Vendor Registration", displayName: "Supplier Registration" },
  { id: 2, name: "Purchase Request", displayName: "Purchase Request" },
  { id: 3, name: "Purchase Order", displayName: "Purchase Order" },
  { id: 4, name: "Invoice", displayName: "Invoice" },
  { id: 5, name: "Budget", displayName: "Budget" },
  { id: 6, name: "Bid", displayName: "Bid" },
  { id: 7, name: "Contract", displayName: "Contracts" },
  { id: 8, name: "Auction", displayName: "Auction" },
];

const CONDITION_FIELDS = [
  { value: "organization", label: "Organization" },
  { value: "department", label: "Department" },
  { value: "amount", label: "Amount" },
];

const CONDITION_OPERATORS = [
  { value: "==", label: "==" },
  { value: "!=", label: "!=" },
  { value: ">", label: ">" },
  { value: "<", label: "<" },
  { value: ">=", label: ">=" },
  { value: "<=", label: "<=" },
];

interface Organization {
  id: number;
  organization_name: string;
}

interface Department {
  id: number;
  code: string;
  value: string;
}

function isConditionGroup(item: ConditionRule | ConditionGroup): item is ConditionGroup {
  return "logic" in item && "rules" in item;
}

function conditionGroupToString(group: ConditionGroup): string {
  if (group.rules.length === 0) return "[Any]";

  const parts = group.rules.map((rule) => {
    if (isConditionGroup(rule)) {
      return `(${conditionGroupToString(rule)})`;
    }
    return `${rule.field} ${rule.operator} ${rule.value}`;
  });

  return parts.join(` ${group.logic} `);
}

function ConditionBuilder({
  condition,
  onChange,
  organizations,
  departments,
}: {
  condition: ConditionGroup;
  onChange: (condition: ConditionGroup) => void;
  organizations: Organization[];
  departments: Department[];
}) {
  const addRule = () => {
    onChange({
      ...condition,
      rules: [...condition.rules, { field: "organization", operator: "==", value: "" }],
    });
  };

  const addGroup = () => {
    onChange({
      ...condition,
      rules: [...condition.rules, { logic: "AND", rules: [] }],
    });
  };

  const removeRule = (index: number) => {
    onChange({
      ...condition,
      rules: condition.rules.filter((_, i) => i !== index),
    });
  };

  const updateRule = (index: number, updated: ConditionRule | ConditionGroup) => {
    const newRules = [...condition.rules];
    newRules[index] = updated;
    onChange({ ...condition, rules: newRules });
  };

  const updateLogic = (logic: "AND" | "OR") => {
    onChange({ ...condition, logic });
  };

  const renderValueInput = (rule: ConditionRule, index: number) => {
    if (rule.field === "amount") {
      return (
        <Input
          value={rule.value}
          onChange={(e) => updateRule(index, { ...rule, value: e.target.value })}
          placeholder="Enter amount"
          className="w-32"
          data-testid={`input-value-${index}`}
        />
      );
    }

    if (rule.field === "organization") {
      return (
        <Select
          value={rule.value}
          onValueChange={(v) => updateRule(index, { ...rule, value: v })}
        >
          <SelectTrigger style={{ textAlign: "left" }} className="w-40" data-testid={`select-value-${index}`}>
            <SelectValue placeholder="Select Organization" />
          </SelectTrigger>
          <SelectContent>
            {organizations.map((org) => (
              <SelectItem key={org.id} value={org.organization_name}>
                {org.organization_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (rule.field === "department") {
      return (
        <Select
          value={rule.value}
          onValueChange={(v) => updateRule(index, { ...rule, value: v })}
        >
          <SelectTrigger style={{ textAlign: "left" }} className="w-48" data-testid={`select-value-${index}`}>
            <SelectValue placeholder="Select Department" />
          </SelectTrigger>
          <SelectContent>
            {departments.map((dept) => (
              <SelectItem key={dept.id} value={dept.value}>
                {dept.value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    return null;
  };

  return (
    <div className="space-y-2 border rounded-md p-2 bg-muted/30">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={condition.logic} onValueChange={(v) => updateLogic(v as "AND" | "OR")}>
          <SelectTrigger style={{ textAlign: "left" }} className="w-20" data-testid="select-logic-operator">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">AND</SelectItem>
            <SelectItem value="OR">OR</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="default" size="sm" onClick={addRule} data-testid="button-add-rule">
          +RULE
        </Button>
        <Button variant="default" size="sm" onClick={addGroup} data-testid="button-add-group">
          +GROUP
        </Button>
      </div>

      {condition.rules.map((rule, index) => (
        <div key={index} className="flex items-center gap-2 flex-wrap">
          {isConditionGroup(rule) ? (
            <div className="flex-1">
              <ConditionBuilder
                condition={rule}
                onChange={(updated) => updateRule(index, updated)}
                organizations={organizations}
                departments={departments}
              />
            </div>
          ) : (
            <>
              <Select
                value={rule.field}
                onValueChange={(v) => updateRule(index, { ...rule, field: v, value: "" })}
              >
                <SelectTrigger style={{ textAlign: "left" }} className="w-32" data-testid={`select-field-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_FIELDS.map((f) => (
                    <SelectItem key={f.value} value={f.value}>
                      {f.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.operator}
                onValueChange={(v) => updateRule(index, { ...rule, operator: v })}
              >
                <SelectTrigger style={{ textAlign: "left" }} className="w-20" data-testid={`select-operator-${index}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONDITION_OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>
                      {op.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {renderValueInput(rule, index)}
            </>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => removeRule(index)}
            data-testid={`button-remove-rule-${index}`}
          >
            X
          </Button>
        </div>
      ))}
    </div>
  );
}

export default function ApprovalWorkflowPage() {
  const { toast } = useToast();
  const [activeWorkflowId, setActiveWorkflowId] = useState<number>(1);

  // Step sheet states
  const [isStepSheetOpen, setIsStepSheetOpen] = useState(false);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [stepName, setStepName] = useState("");

  // Assignee sheet states (separate sheet)
  const [assigneeAddEditMode, setAssigneeAddEditMode] = useState<"add" | "edit">("add");
  const [isAssigneeSheetOpen, setIsAssigneeSheetOpen] = useState(false);
  const [assigneeStep, setAssigneeStep] = useState<WorkflowStep | null>(null);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment>({
    id: 0,
    assignment_type: "ROLE",
    assignment_expression: "",
    conditionData: { logic: "AND", rules: [] },
  });

  const [deleteStepId, setDeleteStepId] = useState<number | null>(null);

  // Approval Checklist states
  const [isChecklistDialogOpen, setIsChecklistDialogOpen] = useState(false);
  const [draftChecklistItems, setDraftChecklistItems] = useState<ChecklistItem[]>([]);

  const { data: workflows = [], isLoading: workflowsLoading } = useQuery<WorkflowDefinition[]>({
    queryKey: ["/api/workflows"],
  });

  const activeTab = WORKFLOW_TABS.find((tab) => {
    const workflow = workflows.find((w) => w.name === tab.name);
    return (workflow?.id || tab.id) === activeWorkflowId;
  }) || WORKFLOW_TABS[0];

  const { data: workflowData, isLoading: stepsLoading } = useQuery<WorkflowWithSteps>({
    queryKey: ["/api/workflows", activeWorkflowId],
    enabled: activeWorkflowId > 0,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ["/api/workflows/roles"],
  });

  const { data: users = [] } = useQuery<UserOption[]>({
    queryKey: ["/api/workflows/users"],
  });

  const { data: organizations = [] } = useQuery<Organization[]>({
    queryKey: ["/api/workflows/organizations"],
  });

  const { data: departments = [] } = useQuery<Department[]>({
    queryKey: ["/api/workflows/departments"],
  });

  const { data: backendQuestions = [] } = useQuery<BackendQuestion[]>({
    queryKey: ["/api/wf/questionformodule", activeTab.name],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/wf/questionformodule/${encodeURIComponent(activeTab.name)}`);
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const createStepMutation = useMutation({
    mutationFn: async (data: { name: string }) => {
      return apiRequest("POST", `/api/workflows/${activeWorkflowId}/steps`, {
        name: data.name,
        step_type: "Generic",
        assignments: [],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Step created successfully" });
      handleCloseStepSheet();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to create step", variant: "destructive" });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async (data: { stepId: number; name: string }) => {
      return apiRequest("PUT", `/api/workflows/${activeWorkflowId}/steps/${data.stepId}`, {
        name: data.name,
        step_type: "Generic",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Step updated successfully" });
      handleCloseStepSheet();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update step", variant: "destructive" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async (stepId: number) => {
      return apiRequest("DELETE", `/api/workflows/${activeWorkflowId}/steps/${stepId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Step deleted successfully" });
      setDeleteStepId(null);
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete step", variant: "destructive" });
    },
  });

  const addAssigneeMutation = useMutation({
    mutationFn: async (data: { stepId: number; assignment: Assignment }) => {
      const newAssignment = {
        ...data.assignment,
        condition: data.assignment.conditionData ? JSON.stringify(data.assignment.conditionData) : "",
      };
      return apiRequest("PUT", `/api/workflows/${activeWorkflowId}/steps/${data.stepId}`, {
        name: assigneeStep?.name,
        type: 'Add',
        step_type: "Generic",
        assignments: [newAssignment],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Assignee added successfully" });
      handleCloseAssigneeSheet();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to add assignee", variant: "destructive" });
    },
  });

  const updateAssigneeMutation = useMutation({
    mutationFn: async (data: { stepId: number; assignmentIndex: number; assignment: Assignment }) => {
      const newAssignment = {
        ...data.assignment,
        id: currentAssignment.id,
        condition: data.assignment.conditionData ? JSON.stringify(data.assignment.conditionData) : "",
      };
      return apiRequest("PUT", `/api/workflows/${activeWorkflowId}/steps/${data.stepId}`, {
        name: assigneeStep?.name,
        type: 'Update',
        step_type: "Generic",
        assignments: [newAssignment],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Assignee updated successfully" });
      handleCloseAssigneeSheet();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update assignee", variant: "destructive" });
    },
  });

  const deleteAssigneeMutation = useMutation({
    mutationFn: async (data: { step: WorkflowStep; assignmentIndex: number }) => {
      const updatedAssignments = data.step.assignments.filter((_, i) => i === data.assignmentIndex);
      return apiRequest("PUT", `/api/workflows/${activeWorkflowId}/steps/${data.step.id}`, {
        name: data.step.name,
        type: 'Delete',
        step_type: "Generic",
        assignments: updatedAssignments.map(a => ({
          ...a,
          condition: a.condition || "",
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", activeWorkflowId] });
      toast({ title: "Assignee deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete assignee", variant: "destructive" });
    },
  });

  const handleDeleteAssignee = (step: WorkflowStep, assignmentIndex: number) => {
    deleteAssigneeMutation.mutate({ step, assignmentIndex });
  };

  // Step Sheet handlers
  const handleOpenCreateStep = () => {
    setEditingStep(null);
    setStepName("");
    setIsStepSheetOpen(true);
  };

  const handleOpenEditStep = (step: WorkflowStep) => {
    setEditingStep(step);
    setStepName(step.name);
    setIsStepSheetOpen(true);
  };

  const handleCloseStepSheet = () => {
    setIsStepSheetOpen(false);
    setEditingStep(null);
    setStepName("");
  };

  const handleSaveStep = () => {
    if (!stepName.trim()) {
      toast({ title: "Step name is required", variant: "destructive" });
      return;
    }

    if (editingStep) {
      updateStepMutation.mutate({
        stepId: editingStep.id,
        name: stepName,
      });
    } else {
      createStepMutation.mutate({
        name: stepName,
      });
    }
  };

  // Assignee Sheet handlers (separate sheet)
  const handleOpenAddAssignee = (step: WorkflowStep) => {
    setAssigneeAddEditMode("add");
    setAssigneeStep(step);
    setCurrentAssignment({
      assignment_type: "ROLE",
      assignment_expression: "",
      conditionData: { logic: "AND", rules: [] },
    });
    setIsAssigneeSheetOpen(true);
  };

  const handleCloseAssigneeSheet = () => {
    setIsAssigneeSheetOpen(false);
    setAssigneeStep(null);
    setCurrentAssignment({
      id: 0,
      assignment_type: "ROLE",
      assignment_expression: "",
      conditionData: { logic: "AND", rules: [] },
    });
  };

  const handleSaveAssignee = () => {
    if (currentAssignment.assignment_type !== "USER_HIERARCHY" && !currentAssignment.assignment_expression) {
      toast({ title: "Please select a role or user", variant: "destructive" });
      return;
    }

    const finalAssignment: Assignment = {
      ...currentAssignment,
      assignment_expression:
        currentAssignment.assignment_type === "USER_HIERARCHY"
          ? "USER_HIERARCHY"
          : currentAssignment.assignment_expression,
    };

    if (assigneeStep) {
      if (assigneeAddEditMode === "add") {
        addAssigneeMutation.mutate({
          stepId: assigneeStep.id,
          assignment: finalAssignment,
        });
      } else {
        updateAssigneeMutation.mutate({
          stepId: assigneeStep.id,
          assignmentIndex: assigneeStep.assignments.findIndex(a => a === currentAssignment),
          assignment: finalAssignment,
        });
      }
    }
  };

  const handleOpenEditAssignee = (step: WorkflowStep, assignmentIndex: number) => {
    setAssigneeAddEditMode("edit");
    const assignmentToEdit = step.assignments[assignmentIndex];
    setAssigneeStep(step);
    setCurrentAssignment({
      id: assignmentToEdit.id,
      assignment_type: assignmentToEdit.assignment_type,
      assignment_expression: assignmentToEdit.assignment_expression,
      conditionData: assignmentToEdit.condition ? JSON.parse(assignmentToEdit.condition) : { logic: "AND", rules: workflowData?.steps.find(s => s.id === step.id)?.assignments[assignmentIndex].conditionData?.rules || [] },
    });
    setIsAssigneeSheetOpen(true);
  };

  const getAssigneeDisplayName = (assignment: Assignment): string => {
    if (assignment.assignment_type === "ROLE") {
      // Always show role_name, not display name
      return assignment.assignment_expression;
    } else if (assignment.assignment_type === "USER") {
      const user = users.find(u => u.email_id === assignment.assignment_expression);
      return user?.name || assignment.assignment_expression;
    } else {
      return assignment.assignment_expression || "";
    }
  };

  const getAssigneeTypeLabel = (type: string): string => {
    switch (type) {
      case "USER": return "User";
      case "ROLE": return "Role";
      case "USER_HIERARCHY": return "User Hierarchy";
      case "AMOUNT_BASED_HIERARCHY": return "Amount Based Hierarchy";
      default: return type;
    }
  };

  const getConditionDisplay = (condition: string | undefined): string => {
    if (!condition) return "[Any]";
    try {
      const parsed = JSON.parse(condition);
      if (parsed.logic && Array.isArray(parsed.rules)) {
        return conditionGroupToString(parsed);
      }
    } catch {
      return condition || "[Any]";
    }
    return "[Any]";
  };

  const steps = workflowData?.steps || [];

  const activeChecklistItems: ChecklistItem[] = backendQuestions.length > 0
    ? backendQuestions.map((q) => ({
        id: `q-${q.id}`,
        backendId: q.id,
        text: q.question_text,
        itemMandatory: q.option_required === "Yes",
        remarkMandatory: q.remarks_required === "Yes",
      }))
    : (DEFAULT_CHECKLISTS[activeWorkflowId] || []);
  const isChecklistActive = workflows.find((w) => w.id === activeWorkflowId)?.list_status ?? false;

  const toggleChecklistStatusMutation = useMutation({
    mutationFn: async (status: boolean) => {
      return apiRequest("PATCH", `/api/wf/enableordisablechecklist/${activeWorkflowId}/${status ? 1 : 0}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to update checklist status", variant: "destructive" });
    },
  });

  const saveChecklistMutation = useMutation({
    mutationFn: async (items: ChecklistItem[]) => {
      const payload = items.map((item) => ({
        ...(item.backendId ? { id: item.backendId } : {}),
        option_required: item.itemMandatory === true ? "Yes" : "No",
        remarks_required: item.remarkMandatory === true ? "Yes" : "No",
        question_text: item.text.trim(),
        work_id: activeWorkflowId,
      }));
      return apiRequest("POST", `/api/wf/savequestions/${activeWorkflowId}`, { payload });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/wf/questionformodule", activeTab.name] });
      toast({ title: "Checklist saved successfully" });
      handleCloseChecklistDialog();
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to save checklist", variant: "destructive" });
    },
  });

  const deleteChecklistItemMutation = useMutation({
    mutationFn: async (backendId: number) => {
      return apiRequest("DELETE", `/api/wf/deletequestionbyid/${backendId}`);
    },
    onSuccess: (_data, backendId) => {
      setDraftChecklistItems((items) => items.filter((item) => item.backendId !== backendId));
      queryClient.invalidateQueries({ queryKey: ["/api/wf/questionformodule", activeTab.name] });
      toast({ title: "Check item deleted successfully" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to delete check item", variant: "destructive" });
    },
  });

  const handleOpenChecklistDialog = () => {
    setDraftChecklistItems(activeChecklistItems.map((item) => ({ ...item })));
    setIsChecklistDialogOpen(true);
  };

  const handleCloseChecklistDialog = () => {
    setIsChecklistDialogOpen(false);
    setDraftChecklistItems([]);
  };

  const handleAddChecklistItem = () => {
    setDraftChecklistItems((items) => [
      ...items,
      { id: crypto.randomUUID(), text: "", itemMandatory: false, remarkMandatory: false },
    ]);
  };

  const handleChecklistItemTextChange = (id: string, text: string) => {
    setDraftChecklistItems((items) => items.map((item) => (item.id === id ? { ...item, text } : item)));
  };

  const handleChecklistItemToggle = (id: string, field: "itemMandatory" | "remarkMandatory", value: boolean) => {
    setDraftChecklistItems((items) => items.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const handleDeleteChecklistItem = (id: string) => {
    const item = draftChecklistItems.find((i) => i.id === id);
    if (item?.backendId) {
      deleteChecklistItemMutation.mutate(item.backendId);
    } else {
      setDraftChecklistItems((items) => items.filter((i) => i.id !== id));
    }
  };

  const handleSaveChecklist = () => {
    const cleaned = draftChecklistItems.filter((item) => item.text.trim().length > 0);
    saveChecklistMutation.mutate(cleaned);
  };

  return (
    <div className="p-4 space-y-3">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">Setup Approval Workflow</h1>
        <p className="text-sm text-muted-foreground">Setup Approval Workflow for all processes in the application.</p>
      </div>

      <Tabs
        value={String(activeWorkflowId)}
        onValueChange={(value) => setActiveWorkflowId(Number(value))}
      >
        <TabsList className="h-9">
          {WORKFLOW_TABS.map((tab) => {
            const workflow = workflows.find(w => w.name === tab.name);
            const tabValue = String(workflow?.id || tab.id);
            return (
              <TabsTrigger
                key={tab.id}
                value={tabValue}
                className="text-xs px-3"
                data-testid={`tab-workflow-${tab.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {tab.displayName}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>
      <div className="mt-6 pt-4">
        <div className="grid grid-cols-12">
          <div className="col-span-12 lg:col-span-8">
          <Card>
            <CardContent className="flex items-start gap-3 p-3 justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-500 text-lg font-semibold">☑</div>
            <div>
              <div className="flex items-center">
                <h3 className="font-bold text-sm pr-2">Approval Checklist</h3>
                <div className="flex h-5 w-20 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-500 text-sm font-semibold">{activeChecklistItems.length} items</div>
              </div>
              <p className="text-sm text-muted-foreground">Approvers confirm these items before approving a {activeTab.displayName}.</p>
            </div>
              <div className="flex items-center gap-2 mt-2">
               {isChecklistActive ? (<span className="font-semibold text-sm">Active</span>) :
               (<span className="font-semibold text-muted-foreground text-sm">Inactive</span>)
                }
              <Switch
                checked={isChecklistActive}
                onCheckedChange={(checked) => toggleChecklistStatusMutation.mutate(checked)}
                disabled={toggleChecklistStatusMutation.isPending}
                data-testid="switch-checklist-active"
              />
              </div>
              {isChecklistActive ? (
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-500 text-lg font-semibold hover-elevate"
                onClick={handleOpenChecklistDialog}
                data-testid="button-edit-checklist"
                title="Edit Checklist"
              >
                <Pencil className="h-3 w-3" />
              </button>
              ) : (
              <button
                type="button"
                className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-900/30 text-gray-500 text-lg font-semibold hover-elevate"
                data-testid="button-edit-checklist"
                title="Edit Checklist"
              >
                <Pencil className="h-3 w-3" />
              </button>
              )}
            </CardContent>
          </Card>
          </div>
          </div>
      </div>
      <div className="mt-6 pt-4">
        {stepsLoading ? (
          <div className="flex gap-3">
            <Skeleton className="h-36 w-60" />
            <Skeleton className="h-36 w-60" />
          </div>
        ) : (
          <div className="flex flex-wrap items-start gap-3 pt-2">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center gap-1.5">
                <Card className="w-64 relative" data-testid={`card-step-${step.id}`}>
                  <div className="absolute -top-2.5 left-3">
                    <Badge className="bg-orange-500 hover:bg-orange-500 text-white rounded-full h-5 w-5 flex items-center justify-center p-0 text-xs">
                      {step.step_order}
                    </Badge>
                  </div>
                  <CardContent className="pt-5 pb-3 px-3">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-sm pr-2">{step.name}</h3>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleOpenEditStep(step)}
                          data-testid={`button-edit-step-${step.id}`}
                          title="Edit Step"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {step.step_order > 1 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => setDeleteStepId(step.id)}
                            data-testid={`button-delete-step-${step.id}`}
                            title="Delete Step"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-primary"
                          onClick={() => handleOpenAddAssignee(step)}
                          data-testid={`button-add-assignee-${step.id}`}
                          title="Add Assignee"
                        >
                          <UserPlus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    {step.assignments.length > 0 ? (
                      <div className="space-y-1.5 text-xs">
                        {step.assignments.map((assignment, aIdx) => (
                          <div key={aIdx} className="flex items-start gap-1.5">
                            <div className="flex-1 bg-muted/50 rounded p-1.5">
                              <div className="flex items-center gap-1 mb-1">
                                <span className="font-medium">Assignee:</span>
                              </div>
                              <div className="flex items-center gap-1 text-muted-foreground">
                                {assignment.assignment_type === "ROLE" || assignment.assignment_type === "USER_HIERARCHY" || assignment.assignment_type === "AMOUNT_BASED_HIERARCHY" ? (
                                  <Users className="h-3 w-3" />
                                ) : (
                                  <User className="h-3 w-3" />
                                )}
                                <span>{getAssigneeTypeLabel(assignment.assignment_type)}, {getAssigneeDisplayName(assignment)}</span>
                              </div>
                              <div className="mt-1">
                                <span className="font-medium">Conditions:</span>
                                <span className="ml-1 text-muted-foreground break-all">
                                  {getConditionDisplay(assignment.condition)}
                                </span>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleOpenEditAssignee(step, aIdx)}
                              data-testid={`button-edit-assignee-${step.id}-${aIdx}`}
                              title="Edit Assignee"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 flex-shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeleteAssignee(step, aIdx)}
                              data-testid={`button-delete-assignee-${step.id}-${aIdx}`}
                              title="Delete Assignee"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No assignees configured</p>
                    )}
                  </CardContent>
                </Card>
                {index < steps.length - 1 && (
                  <ChevronRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            ))}

            <Card
              className="w-64 h-36 flex items-center justify-center cursor-pointer hover-elevate border-dashed"
              onClick={handleOpenCreateStep}
              data-testid="button-create-step"
            >
              <CardContent className="flex flex-col items-center justify-center text-muted-foreground p-3">
                <Plus className="h-6 w-6 mb-1.5" />
                <span className="text-sm">Create New Step</span>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Step Name FormSheet (Create/Edit Step) */}
      <FormSheet
        open={isStepSheetOpen}
        onOpenChange={setIsStepSheetOpen}
        title={editingStep ? "Edit Step" : "Create New Step"}
        onCancel={handleCloseStepSheet}
        onSubmit={handleSaveStep}
        submitLabel={editingStep ? "Update" : "Create"}
        isSubmitting={createStepMutation.isPending || updateStepMutation.isPending}
        widthClassName="sm:max-w-md"
      >
        <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="stepName" className="text-sm">Step Name <span className="text-destructive">*</span></Label>
            <Input
              id="stepName"
              value={stepName}
              onChange={(e) => setStepName(e.target.value)}
              placeholder="Enter step name"
              data-testid="input-step-name"
            />
          </div>
        </div>
      </FormSheet>

      {/* Add Assignee FormSheet */}
      <FormSheet
        open={isAssigneeSheetOpen}
        onOpenChange={setIsAssigneeSheetOpen}
        title={`${assigneeAddEditMode === "add" ? "Add" : "Edit"} Assignee`}
        description={assigneeStep ? `Step: ${assigneeStep.name}` : undefined}
        onCancel={handleCloseAssigneeSheet}
        onSubmit={handleSaveAssignee}
        submitLabel={assigneeAddEditMode === "add" ? "Add" : "Update"}
        isSubmitting={addAssigneeMutation.isPending || updateAssigneeMutation.isPending}
        widthClassName="sm:max-w-2xl"
      >
        {assigneeStep && (
          <p className="text-xs text-muted-foreground mb-1">Step: {assigneeStep.name}</p>
        )}
        <p className="text-xs text-muted-foreground mb-4"><span className="text-destructive">*</span> Indicates mandatory fields</p>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Assignee Type <span className="text-destructive">*</span></Label>
              <Select
                value={currentAssignment.assignment_type}
                onValueChange={(value) => setCurrentAssignment({
                  ...currentAssignment,
                  assignment_type: value,
                  assignment_expression: "",
                })}
              >
                <SelectTrigger data-testid="select-assignee-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USER">User</SelectItem>
                  <SelectItem value="ROLE">Role</SelectItem>
                  <SelectItem value="USER_HIERARCHY">User Hierarchy</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(currentAssignment.assignment_type === "USER" || currentAssignment.assignment_type === "ROLE") && (
              <div className="space-y-1.5">
                <Label className="text-sm">
                  Select {getAssigneeTypeLabel(currentAssignment.assignment_type)} <span className="text-destructive">*</span>
                </Label>
                {currentAssignment.assignment_type === "USER" && (
                  <Select
                    value={currentAssignment.assignment_expression}
                    onValueChange={(value) => setCurrentAssignment({
                      ...currentAssignment,
                      assignment_expression: value,
                    })}
                  >
                    <SelectTrigger data-testid="select-assignee-value">
                      <SelectValue placeholder="Select user" >
                        {
                          users.find(
                            (user) => user.email_id === currentAssignment.assignment_expression
                          )?.name
                        }
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.email_id}>
                          {user.name} ({user.email_id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {currentAssignment.assignment_type === "ROLE" && (
                  <Select
                    value={currentAssignment.assignment_expression}
                    onValueChange={(value) => setCurrentAssignment({
                      ...currentAssignment,
                      assignment_expression: value,
                    })}
                  >
                    <SelectTrigger data-testid="select-assignee-value">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roles.map((role) => (
                        <SelectItem key={role.id} value={role.role_name}>
                          {role.role_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {currentAssignment.assignment_type === "AMOUNT_BASED_HIERARCHY" && (
              <div className="p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-md text-orange-700 dark:text-orange-300 text-sm">
                For amount based hierarchy approval workflow, Please make sure approver's are added in Setup Approvers under Administration tab.
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Step Conditions</Label>
            <ConditionBuilder
              condition={currentAssignment.conditionData || { logic: "AND", rules: [] }}
              onChange={(cond) => setCurrentAssignment({
                ...currentAssignment,
                conditionData: cond,
              })}
              organizations={organizations}
              departments={departments}
            />
          </div>
        </div>
      </FormSheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteStepId !== null} onOpenChange={() => setDeleteStepId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Step</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this step? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteStepId && deleteStepMutation.mutate(deleteStepId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteStepMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Approval Checklist Dialog */}
      <Dialog open={isChecklistDialogOpen} onOpenChange={(open) => (open ? handleOpenChecklistDialog() : handleCloseChecklistDialog())}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto p-6">
          <DialogHeader>
            <DialogTitle>Approval Checklist</DialogTitle>
            <p className="text-sm text-muted-foreground">
              {activeTab.displayName} · configured at Step 1
            </p>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <h4 className="font-semibold text-sm">Check Items</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                Item toggle = must the approver tick this item to approve. Remark toggle = must the approver type a remark for this item. Both are per item. Reject and Request More Info are never blocked.
              </p>
            </div>

            <div className="space-y-2">
              <div className="grid gap-2 px-1 text-xs font-medium text-muted-foreground" style={{ gridTemplateColumns: "1fr 120px 120px 28px" }}>
                <span>Check Item</span>
                <span className="text-center">Item Mandatory?</span>
                <span className="text-center">Remark Mandatory?</span>
                <span />
              </div>

              {draftChecklistItems.map((item, index) => (
                <div
                  key={item.id}
                  className="grid items-center gap-2"
                  style={{ gridTemplateColumns: "1fr 120px 120px 28px" }}
                  data-testid={`row-checklist-item-${item.id}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-4">{index + 1}.</span>
                    <Input
                      value={item.text}
                      onChange={(e) => handleChecklistItemTextChange(item.id, e.target.value)}
                      placeholder="Enter check item"
                      data-testid={`input-checklist-item-${item.id}`}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={item.itemMandatory}
                      onCheckedChange={(checked) => handleChecklistItemToggle(item.id, "itemMandatory", checked)}
                      data-testid={`switch-item-mandatory-${item.id}`}
                    />
                    <span className={`text-xs font-medium ${item.itemMandatory ? "text-primary" : "text-muted-foreground"}`}>
                      {item.itemMandatory ? "Required" : "Optional"}
                    </span>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Switch
                      checked={item.remarkMandatory}
                      onCheckedChange={(checked) => handleChecklistItemToggle(item.id, "remarkMandatory", checked)}
                      data-testid={`switch-remark-mandatory-${item.id}`}
                    />
                    <span className={`text-xs font-medium ${item.remarkMandatory ? "text-primary" : "text-muted-foreground"}`}>
                      {item.remarkMandatory ? "Required" : "Optional"}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDeleteChecklistItem(item.id)}
                    disabled={!!item.backendId && deleteChecklistItemMutation.isPending && deleteChecklistItemMutation.variables === item.backendId}
                    data-testid={`button-delete-checklist-item-${item.id}`}
                    title="Delete Check Item"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleAddChecklistItem}
              data-testid="button-add-checklist-item"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Item
            </Button>

            <div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              A "Remarks" field appears on every item for the approver. Turn on "Remark Mandatory?" to force a note on that item. All ticks and remarks are recorded in Audit Logs.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseChecklistDialog} data-testid="button-cancel-checklist">
              Cancel
            </Button>
            <Button onClick={handleSaveChecklist} disabled={saveChecklistMutation.isPending} data-testid="button-save-checklist">
              {saveChecklistMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Checklist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
