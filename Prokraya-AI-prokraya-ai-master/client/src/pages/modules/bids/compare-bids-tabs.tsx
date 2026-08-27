import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { CheckCircle2, Circle, ClipboardCheck, DollarSign, Eye, Loader2, Shield, Trophy, Users } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import type { AgentCompareBidsSpec } from "@shared/agent-compare-bids";

interface CompareBidsTabsProps {
  bid: any;
  responses: any[];
  lines: any[];
  requirements: any[];
  scores: any[];
  awards?: any[];
  awardLines?: any[];
  currentStep?: string;
  allLinesHavePo?: boolean;
  compact?: boolean;
  readOnly?: boolean;
  interactiveAward?: boolean;
  onAwardComplete?: () => void;
  awardDisabled?: boolean;
  initialTab?: "technical" | "financial" | "award";
  /** Set false by callers that gate awarding themselves (e.g. the Sourcing Agent). */
  awardActionsAllowed?: boolean;
}

export function CompareBidsTabs({
  bid,
  responses,
  lines,
  requirements,
  scores,
  awards = [],
  awardLines = [],
  currentStep = "",
  allLinesHavePo,
  compact = false,
  interactiveAward = false,
  onAwardComplete,
  awardDisabled = false,
  initialTab,
  awardActionsAllowed = true,
}: CompareBidsTabsProps) {
  const suppliers = responses || [];
  const supplierCount = suppliers.length;
  const showAwardTab = currentStep === "prepareAward" && awardActionsAllowed;
  const defaultTab = initialTab || (bid?.type === "RFQ" ? "financial" : "technical");
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const gridCols = `minmax(${compact ? "160px" : "200px"}, 1.2fr) repeat(${supplierCount}, minmax(${compact ? "150px" : "180px"}, 1fr))`;

  useEffect(() => {
    setActiveTab(initialTab || (bid?.type === "RFQ" ? "financial" : "technical"));
  }, [bid?.type, bid?.id, currentStep, initialTab]);

  if (supplierCount === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground border rounded-md">
        <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm font-medium">No supplier responses to compare.</p>
        <p className="text-xs mt-1">Suppliers have not yet submitted their bid responses.</p>
      </div>
    );
  }

  const sectionIconClass = compact ? "h-3 w-3" : "h-3.5 w-3.5";
  const headerCellClass = compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";
  const bodyCellClass = compact ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList data-testid="tabs-agent-compare-bids">
          {bid?.type !== "RFQ" && (
            <TabsTrigger value="technical" data-testid="tab-agent-compare-technical">
              <ClipboardCheck className="h-3.5 w-3.5 mr-1.5" />
              Technical Response
            </TabsTrigger>
          )}
          <TabsTrigger value="financial" data-testid="tab-agent-compare-financial">
            <DollarSign className="h-3.5 w-3.5 mr-1.5" />
            Financial Response
          </TabsTrigger>
          {showAwardTab && (
            <TabsTrigger value="award" data-testid="tab-agent-compare-award">
              <Trophy className="h-3.5 w-3.5 mr-1.5" />
              Award Bid
            </TabsTrigger>
          )}
        </TabsList>
      </Tabs>

      {activeTab === "technical" && bid?.type !== "RFQ" && (
        <TechnicalCompareTab
          suppliers={suppliers}
          requirements={requirements}
          scores={scores}
          gridCols={gridCols}
          sectionIconClass={sectionIconClass}
          headerCellClass={headerCellClass}
          bodyCellClass={bodyCellClass}
        />
      )}

      {activeTab === "financial" && (
        <FinancialCompareTab
          bid={bid}
          suppliers={suppliers}
          lines={lines}
          requirements={requirements}
          scores={scores}
          gridCols={gridCols}
          sectionIconClass={sectionIconClass}
          headerCellClass={headerCellClass}
          bodyCellClass={bodyCellClass}
        />
      )}

      {activeTab === "award" && showAwardTab && (
        <AwardCompareTab
          bid={bid}
          suppliers={suppliers}
          lines={lines}
          awards={awards}
          awardLines={awardLines}
          allLinesHavePo={allLinesHavePo}
          gridCols={gridCols}
          sectionIconClass={sectionIconClass}
          headerCellClass={headerCellClass}
          bodyCellClass={bodyCellClass}
          interactive={interactiveAward}
          onAwardComplete={onAwardComplete}
          disabled={awardDisabled}
        />
      )}
    </div>
  );
}

export function CompareBidsSpecTabs({
  spec,
  compact = false,
  interactiveAward = false,
  onAwardComplete,
  awardDisabled = false,
  initialTab,
  awardActionsAllowed = true,
}: {
  spec: AgentCompareBidsSpec;
  compact?: boolean;
  interactiveAward?: boolean;
  onAwardComplete?: () => void;
  awardDisabled?: boolean;
  initialTab?: "technical" | "financial" | "award";
  awardActionsAllowed?: boolean;
}) {
  return (
    <CompareBidsTabs
      bid={spec.bid}
      responses={spec.responses || []}
      lines={spec.lines || []}
      requirements={spec.requirements || []}
      scores={spec.scores || []}
      awards={spec.awards || []}
      awardLines={spec.awardLines || []}
      currentStep={spec.currentStep || ""}
      allLinesHavePo={spec.allLinesHavePo}
      compact={compact}
      readOnly={!interactiveAward}
      interactiveAward={interactiveAward}
      onAwardComplete={onAwardComplete}
      awardDisabled={awardDisabled}
      initialTab={initialTab}
      awardActionsAllowed={awardActionsAllowed}
    />
  );
}

function SupplierHeader({
  suppliers,
  gridCols,
  headerCellClass,
  bodyCellClass,
  testPrefix,
}: {
  suppliers: any[];
  gridCols: string;
  headerCellClass: string;
  bodyCellClass: string;
  testPrefix: string;
}) {
  return (
    <div className="border rounded-md overflow-x-auto">
      <div className="min-w-[600px]">
        <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
          <div className={`${headerCellClass} font-medium text-muted-foreground`}>Supplier Name</div>
          {suppliers.map((supplier: any) => (
            <div key={supplier.id} className={`${headerCellClass} border-l`} data-testid={`${testPrefix}-supplier-${supplier.id}`}>
              <p className="font-semibold text-primary">{supplier.supplier_name}</p>
            </div>
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: gridCols }}>
          <div className={`${bodyCellClass} text-muted-foreground`}>Supplier Responses</div>
          {suppliers.map((supplier: any) => (
            <div key={supplier.id} className={`${bodyCellClass} border-l font-mono text-primary`}>
              {supplier.id}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TechnicalCompareTab({
  suppliers,
  requirements,
  scores,
  gridCols,
  sectionIconClass,
  headerCellClass,
  bodyCellClass,
}: {
  suppliers: any[];
  requirements: any[];
  scores: any[];
  gridCols: string;
  sectionIconClass: string;
  headerCellClass: string;
  bodyCellClass: string;
}) {
  const techTabCategories = ["technical", "business", "commercial"];
  const techRequirements = (requirements || []).filter((r: any) =>
    techTabCategories.includes(String(r.category || "").toLowerCase()),
  );
  const uniqueTechQuestions = Array.from(new Map(techRequirements.map((r: any) => [r.bid_req_id, r])).values());
  const getTechResponse = (suppId: number, reqId: number) =>
    techRequirements.find((r: any) => r.bid_resp_id === suppId && r.bid_req_id === reqId);
  const getTechScore = (respReqId: number) => (scores || []).find((s: any) => s.bid_resp_req_id === respReqId);

  return (
    <div className="space-y-4">
      <SupplierHeader suppliers={suppliers} gridCols={gridCols} headerCellClass={headerCellClass} bodyCellClass={bodyCellClass} testPrefix="compare" />

      <div>
        <SectionHeading icon={<ClipboardCheck className={`${sectionIconClass} text-primary`} />} title="Technical Scoring" />
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
              <div className={`${headerCellClass} font-medium text-muted-foreground`}>Criteria</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${headerCellClass} border-l font-medium text-center`}>{supplier.supplier_name}</div>
              ))}
            </div>
            <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
              <div className={`${bodyCellClass} font-semibold`}>Technical Evaluation Score</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${bodyCellClass} border-l text-center font-semibold text-primary`}>
                  {supplier.total_score ?? "NA"}
                </div>
              ))}
            </div>
            <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
              <div className={`${headerCellClass} font-medium text-muted-foreground`}>Detailed Score Breakdown</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${headerCellClass} border-l text-xs text-muted-foreground text-center`}>Score / Remarks</div>
              ))}
            </div>
            {uniqueTechQuestions.length > 0 ? uniqueTechQuestions.map((question: any) => (
              <div key={question.bid_req_id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                <div className={bodyCellClass}>
                  <p>{question.question}</p>
                  {question.weight != null && <p className="text-xs text-muted-foreground">Weightage - {question.weight}</p>}
                </div>
                {suppliers.map((supplier: any) => {
                  const response = getTechResponse(supplier.id, question.bid_req_id);
                  const score = response ? getTechScore(response.id) : undefined;
                  return (
                    <ScoreCell
                      key={supplier.id}
                      score={score?.score ?? response?.score ?? ""}
                      remarks={response?.remarks || response?.response || ""}
                      bodyCellClass={bodyCellClass}
                    />
                  );
                })}
              </div>
            )) : (
              <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                <div className={`${bodyCellClass} text-muted-foreground`} style={{ gridColumn: `span ${suppliers.length + 1}` }}>
                  No technical requirements defined for this bid.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <ReadOnlyRecommendations
        title="Technical Recommendations"
        suppliers={suppliers}
        gridCols={gridCols}
        headerCellClass={headerCellClass}
        bodyCellClass={bodyCellClass}
        commentKey="eval_comments"
        recommendedKey="recommended"
        recommendationCommentKey="recommend_comments"
      />
    </div>
  );
}

function FinancialCompareTab({
  bid,
  suppliers,
  lines,
  requirements,
  scores,
  gridCols,
  sectionIconClass,
  headerCellClass,
  bodyCellClass,
}: {
  bid: any;
  suppliers: any[];
  lines: any[];
  requirements: any[];
  scores: any[];
  gridCols: string;
  sectionIconClass: string;
  headerCellClass: string;
  bodyCellClass: string;
}) {
  const bidLineIds = Array.from(new Set((lines || []).map((line: any) => line.bid_line_id)));
  const commRequirements = (requirements || []).filter((r: any) => String(r.category || "").toLowerCase() === "finance");
  const uniqueCommQuestions = Array.from(new Map(commRequirements.map((r: any) => [r.bid_req_id, r])).values());
  const getCommResponse = (suppId: number, reqId: number) =>
    commRequirements.find((r: any) => r.bid_resp_id === suppId && r.bid_req_id === reqId);
  const getCommScore = (respReqId: number) => (scores || []).find((s: any) => s.bid_resp_req_id === respReqId);

  return (
    <div className="space-y-4">
      <SupplierHeader suppliers={suppliers} gridCols={gridCols} headerCellClass={headerCellClass} bodyCellClass={bodyCellClass} testPrefix="fin" />

      <div>
        <SectionHeading icon={<DollarSign className={`${sectionIconClass} text-primary`} />} title="Financial Data" />
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[600px]">
            {bidLineIds.map((lineId: any, idx: number) => {
              const sampleLine = (lines || []).find((line: any) => line.bid_line_id === lineId);
              return (
                <div key={lineId} className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                  <div className={bodyCellClass}>
                    <span className="text-muted-foreground mr-2">{idx + 1}</span>
                    <span className="font-medium">{sampleLine?.orig_description || sampleLine?.description || "-"}</span>
                    <span className="text-muted-foreground ml-2">Qty: {sampleLine?.orig_quantity || sampleLine?.quantity || "-"}</span>
                  </div>
                  {suppliers.map((supplier: any) => {
                    const supplierLine = (lines || []).find((line: any) => line.bid_resp_id === supplier.id && line.bid_line_id === lineId);
                    return (
                      <div key={supplier.id} className={`${bodyCellClass} border-l font-mono`}>
                        {supplierLine ? formatCurrency(supplierLine.bidprice, bid?.currency) : "-"}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <FinancialTotalRow label="Bid Total" suppliers={suppliers} valueKey="bidtotal" bid={bid} gridCols={gridCols} bodyCellClass={`${bodyCellClass} font-medium`} />
            <FinancialTotalRow label="Total Discount" suppliers={suppliers} valueKey="biddisc" bid={bid} gridCols={gridCols} bodyCellClass={bodyCellClass} defaultValue={0} />
            <FinancialTotalRow label="Gross Total" suppliers={suppliers} valueKey="grosstotal" bid={bid} gridCols={gridCols} bodyCellClass={bodyCellClass} />
            <FinancialTotalRow label="Final Quote Amount" suppliers={suppliers} valueKey="grosstotal" bid={bid} gridCols={gridCols} bodyCellClass={`${bodyCellClass} font-medium text-primary`} />
            <div className="grid" style={{ gridTemplateColumns: gridCols }}>
              <div className={bodyCellClass}>Supplier Comments</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                  {supplier.supplier_comments || supplier.eval_comments || "NA"}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div>
        <SectionHeading icon={<ClipboardCheck className={`${sectionIconClass} text-primary`} />} title="Financial Scoring" />
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[600px]">
            <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
              <div className={bodyCellClass}>Financial Evaluation Score</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${bodyCellClass} border-l font-medium text-primary`}>
                  {supplier.totalcommercialscore?? "NA"}
                </div>
              ))}
            </div>
            <div className="grid border-b bg-muted/20" style={{ gridTemplateColumns: gridCols }}>
              <div className={`${headerCellClass} font-medium text-muted-foreground`}>Detailed Score Breakdown</div>
              {suppliers.map((supplier: any) => (
                <div key={supplier.id} className={`${headerCellClass} border-l text-xs text-muted-foreground text-center`}>Score / Remarks</div>
              ))}
            </div>
            {uniqueCommQuestions.map((question: any) => (
              <div key={question.bid_req_id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                <div className={bodyCellClass}>
                  <p>{question.question}</p>
                  {question.weight != null && <p className="text-xs text-muted-foreground">Weightage - {question.weight}</p>}
                </div>
                {suppliers.map((supplier: any) => {
                  const response = getCommResponse(supplier.id, question.bid_req_id);
                  const score = response ? getCommScore(response.id) : undefined;
                  return (
                    <ScoreCell
                      key={supplier.id}
                      score={score?.score ?? ""}
                      remarks={response?.response || ""}
                      bodyCellClass={bodyCellClass}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <ReadOnlyRecommendations
        title="Financial Recommendations"
        suppliers={suppliers}
        gridCols={gridCols}
        headerCellClass={headerCellClass}
        bodyCellClass={bodyCellClass}
        commentKey="fin_eval_comments"
        recommendedKey="fin_recommended"
        recommendationCommentKey="fin_recommend_comments"
      />
    </div>
  );
}

function AwardCompareTab({
  bid,
  suppliers,
  lines,
  awards,
  awardLines,
  allLinesHavePo,
  gridCols,
  sectionIconClass,
  headerCellClass,
  bodyCellClass,
  interactive = false,
  onAwardComplete,
  disabled = false,
}: {
  bid: any;
  suppliers: any[];
  lines: any[];
  awards: any[];
  awardLines: any[];
  allLinesHavePo?: boolean;
  gridCols: string;
  sectionIconClass: string;
  headerCellClass: string;
  bodyCellClass: string;
  interactive?: boolean;
  onAwardComplete?: () => void;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [awardSupplier, setAwardSupplier] = useState("");
  const [awardComments, setAwardComments] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reviewResponseId, setReviewResponseId] = useState<string | null>(null);

  const techRecommended = suppliers.find((supplier: any) => supplier.recommended === "Y");
  const finRecommended = suppliers.find((supplier: any) => supplier.fin_recommended === "Y");
  const commerciallySelected = suppliers.find((supplier: any) => supplier.is_commercially_selected === "Y");
  const bidLineIds = Array.from(new Set((lines || []).map((line: any) => line.bid_line_id)));
  const selectedSupplier = suppliers.find((s: any) => String(s.id) === awardSupplier);

  const handleSubmitAward = async () => {
    if (!awardSupplier) {
      toast({ title: "Selection required", description: "Please select a supplier to award the bid.", variant: "destructive" });
      return;
    }
    if (!awardComments.trim()) {
      toast({ title: "Comments required", description: "Please enter award comments.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const awardPayload = {
        awardSupplierId: selectedSupplier?.supplier_id || parseInt(awardSupplier, 10),
        awardComments: awardComments.trim(),
      };
      await apiRequest("POST", `/api/dbo/bids/${bid.id}/award`, awardPayload);
      queryClient.invalidateQueries({ queryKey: [`/api/dbo/bids/${bid.id}/evaluate`] });
      toast({
        title: "Bid awarded",
        description: `Award submitted to ${selectedSupplier?.supplier_name || "selected supplier"}.`,
      });
      onAwardComplete?.();
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to award bid", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SupplierHeader suppliers={suppliers} gridCols={gridCols} headerCellClass={headerCellClass} bodyCellClass={bodyCellClass} testPrefix="award" />

      <div>
        <SectionHeading icon={<Trophy className={`${sectionIconClass} text-primary`} />} title="Award Bid" />
        {interactive ? (
          <p className={`${bodyCellClass} text-muted-foreground border rounded-md`}>
            Select the winning supplier, review their response, add award comments, and submit the award below.
          </p>
        ) : (
          <p className={`${bodyCellClass} text-muted-foreground border rounded-md`}>
            Based on Technical and Finance response evaluations, comments, and recommendations, select the appropriate supplier to award in the full Bids evaluation page.
          </p>
        )}
      </div>

      <div className="border rounded-md overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
            <div className={`${headerCellClass} font-medium text-muted-foreground`}>Recommendation</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${headerCellClass} border-l font-medium text-center`}>{supplier.supplier_name}</div>
            ))}
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Technical Recommended Supplier</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                {techRecommended?.id === supplier.id ? supplier.supplier_name : "-"}
              </div>
            ))}
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Financial Recommended Supplier</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                {finRecommended?.id === supplier.id ? supplier.supplier_name : "-"}
              </div>
            ))}
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Commercially Selected Supplier</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                {commerciallySelected?.id === supplier.id ? supplier.supplier_name : "-"}
              </div>
            ))}
          </div>
          {interactive && (
            <>
              <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                <div className={bodyCellClass}>Select Supplier to Award</div>
                {suppliers.map((s: any) => (
                  <div key={s.id} className={`${bodyCellClass} border-l`}>
                    <button
                      type="button"
                      disabled={disabled || isSubmitting}
                      onClick={() => {
                        setAwardSupplier(String(s.id));
                        setReviewResponseId(null);
                      }}
                      className={`flex items-center gap-2 w-full rounded-md border p-1.5 text-sm transition-colors cursor-pointer hover-elevate ${
                        awardSupplier === String(s.id)
                          ? "border-green-500 bg-green-50 dark:bg-green-900/20"
                          : "border-border"
                      }`}
                      data-testid={`agent-radio-award-supplier-${s.id}`}
                    >
                      {awardSupplier === String(s.id) ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{s.supplier_name}</span>
                    </button>
                  </div>
                ))}
              </div>
              {selectedSupplier && (
                <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
                  <div className={bodyCellClass}>Review Selected Response</div>
                  <div className={`${bodyCellClass} border-l`} style={{ gridColumn: `span ${suppliers.length}` }}>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5"
                      disabled={disabled}
                      onClick={() =>
                        setReviewResponseId((current) =>
                          current === String(selectedSupplier.id) ? null : String(selectedSupplier.id),
                        )
                      }
                      data-testid="agent-button-review-selected-response"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      {reviewResponseId === String(selectedSupplier.id) ? "Hide Response" : "View Response"}
                    </Button>
                  </div>
                </div>
              )}
              <div className="grid" style={{ gridTemplateColumns: gridCols }}>
                <div className={bodyCellClass}>
                  Award Comments <span className="text-destructive">*</span>
                </div>
                <div className={`${bodyCellClass} border-l`} style={{ gridColumn: `span ${suppliers.length}` }}>
                  <textarea
                    className="w-full text-sm border rounded-md p-1.5 bg-transparent resize-none focus:outline-none focus:ring-1 focus:ring-ring"
                    rows={3}
                    placeholder="Enter award comments..."
                    value={awardComments}
                    disabled={disabled || isSubmitting}
                    onChange={(e) => setAwardComments(e.target.value)}
                    data-testid="agent-input-award-comments"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {interactive && reviewResponseId && (
        <AwardResponseReviewPanel responseId={reviewResponseId} bid={bid} lines={lines} />
      )}

      <div>
        <SectionHeading icon={<DollarSign className={`${sectionIconClass} text-primary`} />} title="Award Line Preview" />
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[600px]">
            {bidLineIds.length > 0 ? bidLineIds.map((lineId: any, idx: number) => {
              const sampleLine = (lines || []).find((line: any) => line.bid_line_id === lineId);
              return (
                <div key={lineId} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                  <div className={bodyCellClass}>
                    <span className="text-muted-foreground mr-2">{idx + 1}</span>
                    <span className="font-medium">{sampleLine?.orig_description || sampleLine?.description || "-"}</span>
                    <span className="text-muted-foreground ml-2">Qty: {sampleLine?.orig_quantity || sampleLine?.quantity || "-"}</span>
                  </div>
                  {suppliers.map((supplier: any) => {
                    const supplierLine = (lines || []).find((line: any) => line.bid_resp_id === supplier.id && line.bid_line_id === lineId);
                    const awardedQty = supplierLine?.awarded_quantity ?? supplierLine?.awarded_quantity_total;
                    const price = supplierLine?.bidprice;
                    return (
                      <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                        {price != null ? formatCurrency(price, bid?.currency) : "-"}
                        {awardedQty != null && awardedQty !== "" ? ` · Qty: ${awardedQty}` : ""}
                      </div>
                    );
                  })}
                </div>
              );
            }) : (
              <div className={bodyCellClass}>No bid lines available for award preview.</div>
            )}
          </div>
        </div>
      </div>

      <div>
        <SectionHeading icon={<Shield className={`${sectionIconClass} text-primary`} />} title="Existing Awards" />
        <div className="border rounded-md overflow-x-auto">
          <div className="min-w-[600px]">
            {awards.length > 0 ? awards.map((award: any) => {
              const relatedLines = (awardLines || []).filter((line: any) => line.bid_award_id === award.id);
              return (
                <div key={award.id} className="grid border-b last:border-b-0" style={{ gridTemplateColumns: gridCols }}>
                  <div className={bodyCellClass}>
                    <p className="font-medium">Award {award.id}</p>
                    <p className="text-muted-foreground">Status: {award.status || "NA"}</p>
                  </div>
                  <div className={`${bodyCellClass} border-l`} style={{ gridColumn: `span ${suppliers.length}` }}>
                    <p>Awarded To: {award.awarded_to || award.supplier_name || "NA"}</p>
                    <p>Amount: {formatCurrency(award.awarded_amount ?? award.award_amount, award.currency)}</p>
                    <p>Lines: {relatedLines.length || "NA"}</p>
                    {allLinesHavePo !== undefined && <p>PO Created For All Lines: {allLinesHavePo ? "Yes" : "No"}</p>}
                  </div>
                </div>
              );
            }) : (
              <div className={bodyCellClass}>No awards have been created yet.</div>
            )}
          </div>
        </div>
      </div>

      {interactive && (
        <div className="flex justify-end">
          <Button
            disabled={disabled || isSubmitting || !awardSupplier || !awardComments.trim()}
            onClick={handleSubmitAward}
            data-testid="agent-button-award-bid"
            className="gap-1.5"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
            Award Bid
          </Button>
        </div>
      )}
    </div>
  );
}

function AwardResponseReviewPanel({
  responseId,
  bid,
  lines,
}: {
  responseId: string;
  bid: any;
  lines: any[];
}) {
  const { data, isLoading } = useQuery<{
    response: any;
    requirements: any[];
    attachments: any[];
  }>({
    queryKey: ["/api/dbo/bids/response", responseId, "detail"],
    enabled: !!responseId,
  });

  const resp = data?.response;
  const supplierLines = (lines || []).filter((l: any) => String(l.bid_resp_id) === responseId);

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-2" data-testid="agent-award-response-review">
      <p className="text-sm font-semibold">Selected Supplier Response — {responseId}</p>
      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading response…
        </div>
      ) : !resp ? (
        <p className="text-xs text-muted-foreground">Response data not available.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Supplier</p>
            <p className="font-medium">{resp.supplier_name || "-"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bid Total</p>
            <p className="font-medium font-mono">{formatCurrency(resp.grosstotal, bid?.currency)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tech Score</p>
            <p className="font-medium">{resp.total_score ?? "NA"}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Financial Score</p>
            <p className="font-medium">{resp.finscore ?? "NA"}</p>
          </div>
          {supplierLines.length > 0 && (
            <div className="col-span-full">
              <p className="text-muted-foreground mb-1">Line Items</p>
              <ul className="space-y-0.5">
                {supplierLines.map((line: any) => (
                  <li key={line.bid_line_id} className="flex justify-between gap-2">
                    <span>{line.description || line.orig_description || "-"}</span>
                    <span className="font-mono shrink-0">{formatCurrency(line.bidprice, bid?.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(resp.supplier_comments || resp.eval_comments) && (
            <div className="col-span-full">
              <p className="text-muted-foreground">Comments</p>
              <p>{resp.supplier_comments || resp.eval_comments}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeading({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <div className="flex h-7 w-7 items-center justify-center rounded bg-primary/10">{icon}</div>
      <h4 className="text-sm font-semibold">{title}</h4>
    </div>
  );
}

function ScoreCell({
  score,
  remarks,
  bodyCellClass,
}: {
  score: string | number;
  remarks: string;
  bodyCellClass: string;
}) {
  return (
    <div className={`${bodyCellClass} border-l`}>
      <table className="w-full border text-sm rounded-sm overflow-hidden">
        <thead>
          <tr className="bg-primary text-primary-foreground">
            <th className="px-2 py-0.5 text-xs font-medium text-left border-r border-primary-foreground/20">Score</th>
            <th className="px-2 py-0.5 text-xs font-medium text-left">Remarks</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-2 py-1 text-sm border-r">{score}</td>
            <td className="px-2 py-1 text-sm">{remarks}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function FinancialTotalRow({
  label,
  suppliers,
  valueKey,
  bid,
  gridCols,
  bodyCellClass,
  defaultValue,
}: {
  label: string;
  suppliers: any[];
  valueKey: string;
  bid: any;
  gridCols: string;
  bodyCellClass: string;
  defaultValue?: number;
}) {
  return (
    <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
      <div className={bodyCellClass}>{label}</div>
      {suppliers.map((supplier: any) => (
        <div key={supplier.id} className={`${bodyCellClass} border-l font-mono`}>
          {formatCurrency(supplier[valueKey] ?? defaultValue, bid?.currency)}
        </div>
      ))}
    </div>
  );
}

function ReadOnlyRecommendations({
  title,
  suppliers,
  gridCols,
  headerCellClass,
  bodyCellClass,
  commentKey,
  recommendedKey,
  recommendationCommentKey,
}: {
  title: string;
  suppliers: any[];
  gridCols: string;
  headerCellClass: string;
  bodyCellClass: string;
  commentKey: string;
  recommendedKey: string;
  recommendationCommentKey: string;
}) {
  const recommendedSupplier = suppliers.find((supplier: any) => supplier[recommendedKey] === "Y");
  const recommendationComments = recommendedSupplier?.[recommendationCommentKey] || "";

  return (
    <div>
      <SectionHeading icon={<Shield className="h-3.5 w-3.5 text-primary" />} title={title} />
      <div className="border rounded-md overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="grid border-b bg-muted/30" style={{ gridTemplateColumns: gridCols }}>
            <div className={`${headerCellClass} font-medium text-muted-foreground`}>Field</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${headerCellClass} border-l font-medium text-center`}>{supplier.supplier_name}</div>
            ))}
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Evaluator Comments</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                {supplier[commentKey] || "NA"}
              </div>
            ))}
          </div>
          <div className="grid border-b" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Recommended Supplier</div>
            {suppliers.map((supplier: any) => (
              <div key={supplier.id} className={`${bodyCellClass} border-l`}>
                {supplier[recommendedKey] === "Y" ? supplier.supplier_name : "-"}
              </div>
            ))}
          </div>
          <div className="grid" style={{ gridTemplateColumns: gridCols }}>
            <div className={bodyCellClass}>Recommendation Comments</div>
            <div className={`${bodyCellClass} border-l`} style={{ gridColumn: `span ${suppliers.length}` }}>
              {recommendationComments || "NA"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
