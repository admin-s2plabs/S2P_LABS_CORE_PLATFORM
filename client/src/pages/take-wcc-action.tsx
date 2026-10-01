import s2pLabsLogo from "@/assets/images/s2plabs_logo.jpeg";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Loader2, MessageCircle, MessageCircleMore, ShieldAlert, XCircle, XSquareIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const CLOSE_DELAY_MS = 5000;

interface ApproverInfo {
  docId?: string;
  apikey?: string;
  approveremail?: string;
  module?: string;
  taskId?: string;
  refnumber?: string;
}

export default function TakeWCCAction() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [loader, setLoader] = useState(false);
  const [linkError, setLinkError] = useState("");
  const [approverInfo, setApproverInfo] = useState<ApproverInfo>({});
  const [approverComments, setApproverComments] = useState("");
  const [approverCommentsErr, setApproverCommentsErr] = useState(false);
  const [done, setDone] = useState(false);

  // The link is opened as a popup/new tab from an email — auto-close once
  // the outcome (error or success) is shown, falling back to a redirect if
  // the browser blocks window.close() on a tab it didn't script-open.
  // useEffect(() => {
  //   if (!linkError && !done) return;
  //   const timer = setTimeout(() => {
  //     setLocation("/login");
  //     window.close();
  //   }, CLOSE_DELAY_MS);
  //   return () => clearTimeout(timer);
  // }, [linkError, done, setLocation]);

 useEffect(() => {
  const params = new URLSearchParams(window.location.search);

  const info: ApproverInfo = {
    docId: params.get("docId") || undefined,
    apikey: params.get("apikey") || undefined,
    approveremail: params.get("email") || undefined, // URL uses 'email'
    module: params.get("module") || undefined,
    taskId: params.get("taskId") || undefined,
    refnumber: params.get("refnumber") || undefined,
  };

  if (!info.apikey) {
    setLinkError("Invalid Action, please contact support team.");
    setLoader(false);
    return;
  }

  setApproverInfo(info);

  console.log(info);

  setLoader(false);
}, []);

  const approveRejectMutation = useMutation({
    mutationFn: async (action: "Approve" | "Reject"|"More") => {
      const formData = new FormData();
      formData.append("module", approverInfo.module || "");
      formData.append("refnumber", approverInfo.refnumber || "");
      formData.append("taskId", approverInfo.taskId || "");
      formData.append("approveremail", approverInfo.approveremail || "");
      formData.append("action", action);
      formData.append("comment", approverComments);
      formData.append("apikey", approverInfo.apikey || "");
      const data = {
       module: approverInfo.module || "",
       refnumber: approverInfo.refnumber || "",
       taskId: approverInfo.taskId || "",
       approveremail: approverInfo.approveremail || "",
       result: action,
       comments: approverComments,
       apikey: approverInfo.apikey || "",
      }
      const res = await apiRequest(
        "POST",
        `/api/email/taskapproval`,
        data,
      );
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Successfully processed your request!" });
      setDone(true);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to process your request.",
        variant: "destructive",
      });
    },
  });

  const handleAction = (action: "Approve" | "Reject" | "More") => {
    if (!approverComments.trim()) {
      setApproverCommentsErr(true);
      return;
    }
    setApproverCommentsErr(false);
    approveRejectMutation.mutate(action);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-lg">
        <div className="flex justify-center mb-6">
          <img src={s2pLabsLogo} alt="S2P Labs" className="h-9 object-contain" />
        </div>

        <div className="rounded-xl border bg-background shadow-sm">
          <div className="px-6 py-4 border-b">
            <h1 className="text-lg font-semibold">
              Approval Action for Workflow Submission - {approverInfo.refnumber}
            </h1>
          </div>

          <div className="p-6">
            {loader ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Validating link…</p>
              </div>
            ) : linkError ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <ShieldAlert className="h-10 w-10 text-destructive" />
                <p className="text-sm text-destructive">{linkError}</p>
                <p className="text-xs text-muted-foreground">This window will close automatically.</p>
              </div>
            ) : done ? (
              <div className="flex flex-col items-center justify-center py-6 gap-3 text-center">
                <CheckCircle2 className="h-10 w-10 text-green-600" />
                <p className="font-medium">Successfully processed your request!</p>
                <p className="text-xs text-muted-foreground">This window will close automatically.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Please review the workflow submission and select an appropriate action.
                </p>

                <div className="space-y-2">
                  <Label htmlFor="approverComments">
                    Approver Comments <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="approverComments"
                    rows={3}
                    maxLength={255}
                    value={approverComments}
                    onChange={(e) => {
                      setApproverComments(e.target.value);
                      if (e.target.value.trim()) setApproverCommentsErr(false);
                    }}
                  />
                  {approverCommentsErr && (
                    <p className="text-sm text-destructive">Please enter Comments</p>
                  )}
                </div>

                <div className="flex items-center justify-center gap-3 pt-2">
                  <Button
                    onClick={() => handleAction("Approve")}
                    disabled={approveRejectMutation.isPending}
                  >
                    {approveRejectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                    )}
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleAction("Reject")}
                    disabled={approveRejectMutation.isPending}
                  >
                    {approveRejectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Reject
                  </Button>
                  <Button
                   className="bg-orange-500 hover:bg-orange-600 text-white"
                    variant="destructive"
                    onClick={() => handleAction("More")}
                    disabled={approveRejectMutation.isPending}
                  >
                    {approveRejectMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <MessageCircleMore className="h-4 w-4 mr-2" />
                    )}
                    More Info Required
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground text-center pt-2">
                  Once an action is taken, the decision will be recorded and notified to
                  the concerned parties through the platform.
                </p>
              </div>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by S2P Labs
        </p>
      </div>
    </div>
  );
}
