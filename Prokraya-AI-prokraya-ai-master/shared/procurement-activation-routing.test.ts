import { describe, expect, it } from "vitest";
import {
  detectProcurementActivationIntentFallback,
  isProcurementSubmissionPrompt,
  resolveProcurementActivationItem,
  type ProcurementActivationIntentClassification,
  type ProcurementActivationSignalsResponse,
} from "./procurement-activation-signals";

/** One pending PR approval, the shape that made the wrong card appear. */
const ONE_PENDING_PR: ProcurementActivationSignalsResponse = {
  stages: [
    {
      id: "prApproval",
      label: "PR Approval",
      status: "pending",
      pendingCount: 1,
      items: [
        {
          title: "PR Approval Request - PR_00059 -",
          taskId: "task-1",
          prNumber: "PR_00059",
        },
      ],
    },
  ],
  suggestedNotification: null,
  nextStageId: "prApproval",
};

const TWO_PENDING_PRS: ProcurementActivationSignalsResponse = {
  stages: [
    {
      id: "prApproval",
      label: "PR Approval",
      status: "pending",
      pendingCount: 2,
      items: [
        { title: "PR Approval Request - PR_00059 -", taskId: "t1", prNumber: "PR_00059" },
        { title: "PR Approval Request - PR_00061 -", taskId: "t2", prNumber: "PR_00061" },
      ],
    },
  ],
  suggestedNotification: null,
  nextStageId: "prApproval",
};

const classify = (
  overrides: Partial<ProcurementActivationIntentClassification>,
): ProcurementActivationIntentClassification => ({
  intent: "open_pr_approval",
  confidence: 0.9,
  source: "llm",
  ...overrides,
});

describe("resolveProcurementActivationItem — a named PR that isn't pending", () => {
  it("does not substitute the only pending approval", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ prNumber: "PR_00069" }),
      null,
    );
    expect(item).toBeNull();
  });

  it("still refuses when the message reads as an approval decision", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ intent: "more_info", prNumber: "PR_00069" }),
      null,
    );
    expect(item).toBeNull();
  });

  it("refuses even while another PR review card is open", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ intent: "approve", prNumber: "PR_00069" }),
      { activeReview: { stageId: "prApproval", prNumber: "PR_00059" } },
    );
    expect(item).toBeNull();
  });

  it("refuses even when a task-picker index is in play", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ prNumber: "PR_00069" }),
      { pendingTaskFlow: "tasks", stageId: "prApproval", taskIndex: 0 },
    );
    expect(item).toBeNull();
  });

  it("ignores a contextual hint like 'latest' when a PR was named", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ prNumber: "PR_00069", contextualHints: "latest" }),
      null,
    );
    expect(item).toBeNull();
  });

  it("applies the same rule to POs and budgets", () => {
    const pendingPo: ProcurementActivationSignalsResponse = {
      stages: [
        {
          id: "poApproval",
          label: "PO Approval",
          status: "pending",
          pendingCount: 1,
          items: [{ title: "PO_00010", poNumber: "PO_00010" }],
        },
      ],
      suggestedNotification: null,
      nextStageId: "poApproval",
    };
    expect(
      resolveProcurementActivationItem(
        pendingPo,
        "poApproval",
        classify({ intent: "open_po_approval", poNumber: "PO_00099" }),
        null,
      ),
    ).toBeNull();
  });
});

describe("resolveProcurementActivationItem — matching still works", () => {
  it("returns the item when the named PR is pending", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ prNumber: "PR_00059" }),
      null,
    );
    expect(item?.prNumber).toBe("PR_00059");
  });

  it("matches case-insensitively and ignores surrounding whitespace", () => {
    const item = resolveProcurementActivationItem(
      TWO_PENDING_PRS,
      "prApproval",
      classify({ prNumber: "  pr_00061 " }),
      null,
    );
    expect(item?.prNumber).toBe("PR_00061");
  });

  it("picks the single pending item when no PR was named", () => {
    const item = resolveProcurementActivationItem(
      ONE_PENDING_PR,
      "prApproval",
      classify({ intent: "open_pr_approval" }),
      null,
    );
    expect(item?.prNumber).toBe("PR_00059");
  });

  it("resolves 'this' against the open review card", () => {
    const item = resolveProcurementActivationItem(
      TWO_PENDING_PRS,
      "prApproval",
      classify({ intent: "approve", contextualHints: "this" }),
      { activeReview: { stageId: "prApproval", prNumber: "PR_00061" } },
    );
    expect(item?.prNumber).toBe("PR_00061");
  });

  it("honours a task-picker index when no PR was named", () => {
    const item = resolveProcurementActivationItem(
      TWO_PENDING_PRS,
      "prApproval",
      classify({ intent: "approve" }),
      { pendingTaskFlow: "tasks", stageId: "prApproval", taskIndex: 1 },
    );
    expect(item?.prNumber).toBe("PR_00061");
  });

  it("stays ambiguous when several are pending and nothing disambiguates", () => {
    const item = resolveProcurementActivationItem(
      TWO_PENDING_PRS,
      "prApproval",
      classify({ intent: "approve" }),
      null,
    );
    expect(item).toBeNull();
  });

  it("returns null when the stage has no pending items at all", () => {
    const empty: ProcurementActivationSignalsResponse = {
      stages: [
        { id: "prApproval", label: "PR Approval", status: "idle", pendingCount: 0, items: [] },
      ],
      suggestedNotification: null,
      nextStageId: null,
    };
    expect(
      resolveProcurementActivationItem(empty, "prApproval", classify({}), null),
    ).toBeNull();
  });
});

describe("isProcurementSubmissionPrompt", () => {
  it("catches the prompts that were being hijacked", () => {
    expect(isProcurementSubmissionPrompt("Check if PR PR_00069 is ready for submission.")).toBe(true);
    expect(isProcurementSubmissionPrompt("Submit PR PR_00069 for approval.")).toBe(true);
  });

  it("catches other ways of asking to submit", () => {
    expect(isProcurementSubmissionPrompt("Is PO_00012 ready to submit?")).toBe(true);
    expect(isProcurementSubmissionPrompt("Send PR_00069 into the approval workflow")).toBe(true);
    expect(
      isProcurementSubmissionPrompt("What is missing on PR_00069 before I can submit it?"),
    ).toBe(true);
    expect(isProcurementSubmissionPrompt("resubmit this requisition")).toBe(true);
    expect(isProcurementSubmissionPrompt("submit it for approval")).toBe(true);
  });

  it("leaves genuine approval traffic to the classifier", () => {
    expect(isProcurementSubmissionPrompt("Approve PR_00059")).toBe(false);
    expect(isProcurementSubmissionPrompt("Reject the submitted PR_00059")).toBe(false);
    expect(isProcurementSubmissionPrompt("Show me my pending approvals")).toBe(false);
    expect(isProcurementSubmissionPrompt("Do I have any PRs awaiting my sign-off?")).toBe(false);
    expect(isProcurementSubmissionPrompt("What is pending my approval?")).toBe(false);
  });

  it("ignores unrelated prompts", () => {
    expect(isProcurementSubmissionPrompt("")).toBe(false);
    expect(isProcurementSubmissionPrompt("Create a PR for 25 laptops")).toBe(false);
    expect(isProcurementSubmissionPrompt("How many PRs are currently active?")).toBe(false);
  });
});

describe("detectProcurementActivationIntentFallback — submission prompts stay 'other'", () => {
  it("classifies the readiness question as other", () => {
    const result = detectProcurementActivationIntentFallback(
      "Check if PR PR_00069 is ready for submission.",
    );
    expect(result.intent).toBe("other");
  });

  it("classifies the submit request as other", () => {
    const result = detectProcurementActivationIntentFallback("Submit PR PR_00069 for approval.");
    expect(result.intent).toBe("other");
  });

  it("still recognises real approval navigation", () => {
    expect(
      detectProcurementActivationIntentFallback("Take me to the PR approval for PR_00059").intent,
    ).toBe("open_pr_approval");
    expect(
      detectProcurementActivationIntentFallback("Show me my pending PR approvals").intent,
    ).toBe("list_pending_tasks");
    expect(detectProcurementActivationIntentFallback("Approve PR_00059").intent).toBe("approve");
  });
});
