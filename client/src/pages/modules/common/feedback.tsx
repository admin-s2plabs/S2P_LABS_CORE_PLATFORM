import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest } from "@/lib/queryClient";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertCircle, Building2, Calendar, CheckCircle, FileText, Hash, Lightbulb, Loader2, Mail, MessageCircle, Phone, Search, ThumbsUp, User } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

const feedbackSchema = z.object({
  feedbackType: z.string().min(1, "Please select a message type"),
  feedbackAbout: z.string().min(1, "Please select what the feedback is about"),
  department: z.string().min(1, "Please select a department"),
  feedbackMsg: z.string().min(10, "Message must be at least 10 characters"),
  isConveyed: z.enum(["Y", "N"]),
  conveyedTo: z.string().optional(),
  suggestion: z.string().optional(),
});

type FeedbackFormData = z.infer<typeof feedbackSchema>;

const messageTypes = [
  { value: "Comment", label: "Comments", icon: MessageCircle, color: "text-blue-500" },
  { value: "Compliment", label: "Compliments", icon: ThumbsUp, color: "text-green-500" },
  { value: "Suggestion", label: "Suggestions", icon: Lightbulb, color: "text-yellow-500" },
  { value: "Complaint", label: "Complaints", icon: AlertCircle, color: "text-red-500" },
];

const feedbackAboutOptions = [
  { value: "Product", label: "Product" },
  { value: "Service", label: "Service" },
  { value: "Process", label: "Process" },
  { value: "Support", label: "Support" },
  { value: "Other", label: "Other" },
];

export default function FeedbackPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("feedback");

  const authData = localStorage.getItem("prokraya-auth");
  const parsedAuth = authData ? JSON.parse(authData) : {};
  const userId = parsedAuth.userId || "";

  const { data: departments = [] } = useQuery<{ id: number; value: string }[]>({
    queryKey: ["/api/departments"],
  });

  const { data: userProfile } = useQuery<{
    name?: string;
    company_name?: string;
    address_line1?: string;
    city?: string;
    contact_number?: string;
    email_id?: string;
  }>({
    queryKey: ["/api/profile", userId],
    enabled: !!userId,
  });

  const { data: feedbackHistory = [] } = useQuery<{
    id: number;
    feedback_type: string;
    feedback_msg: string;
    department: string;
    submitted_date: string;
    is_conveyed: string;
    conveyed_to: string | null;
    attribute_1: string;
    suggestion: string | null;
    submitted_by: string | null;
  }[]>({
    queryKey: ["/api/feedback/history"],
    enabled: activeTab === "analysis",
  });

  const form = useForm<FeedbackFormData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: {
      feedbackType: "",
      feedbackAbout: "",
      department: "",
      feedbackMsg: "",
      isConveyed: "N",
      conveyedTo: "",
      suggestion: "",
    },
  });

  const isConveyed = form.watch("isConveyed");

  const submitMutation = useMutation({
    mutationFn: async (data: FeedbackFormData) => {
      const res = await apiRequest("POST", "/api/feedback", data);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Feedback Submitted",
        description: "Thank you for your feedback!",
      });
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit feedback",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FeedbackFormData) => {
    submitMutation.mutate(data);
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-primary" data-testid="text-page-title">Application Feedback</h1>
        <p className="text-sm text-muted-foreground">
          All System and process related feedback can be submitted from here!
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="feedback" data-testid="tab-feedback">Feedback</TabsTrigger>
          <TabsTrigger value="analysis" data-testid="tab-analysis">Analysis</TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="space-y-4">

          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <User className="h-4 w-4" />
                    <span>User ID / Name</span>
                  </div>
                  <p className="font-medium">{userId}</p>
                  <p className="text-sm">{userProfile?.name || "-"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Building2 className="h-4 w-4" />
                    <span>Company Name</span>
                  </div>
                  <p className="font-medium">{userProfile?.company_name || "S2P Labs Inc"}</p>
                  <p className="text-sm">{userProfile?.address_line1 || ""}{userProfile?.city ? `, ${userProfile.city}` : ""}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>Email</span>
                  </div>
                  <p className="font-medium">{userProfile?.email_id || "-"}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-4 w-4" />
                    <span>Contact</span>
                  </div>
                  <p className="font-medium">{userProfile?.contact_number || "-"}</p>
                </div>
              </div>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                  <FormField
                    control={form.control}
                    name="feedbackType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message Type *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="grid grid-cols-2 md:grid-cols-4 gap-4"
                          >
                            {messageTypes.map((type) => {
                              const Icon = type.icon;
                              return (
                                <div key={type.value} className="flex items-center space-x-2">
                                  <RadioGroupItem
                                    value={type.value}
                                    id={type.value}
                                    data-testid={`radio-${type.value.toLowerCase()}`}
                                  />
                                  <Label
                                    htmlFor={type.value}
                                    className="flex items-center gap-2 cursor-pointer"
                                  >
                                    <div className={`p-2 rounded-lg bg-muted ${type.color}`}>
                                      <Icon className="h-5 w-5" />
                                    </div>
                                    <span>{type.label}</span>
                                  </Label>
                                </div>
                              );
                            })}
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="feedbackAbout"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Feedback About *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-feedback-about">
                              <SelectValue placeholder="Select Feedback About" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {feedbackAboutOptions.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Related Department *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-department">
                              <SelectValue placeholder="Select Department" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {departments.map((dept) => (
                              <SelectItem key={dept.id} value={dept.value}>
                                {dept.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="feedbackMsg"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Message Details *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter your feedback message..."
                            className="min-h-[120px]"
                            data-testid="textarea-message"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="isConveyed"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Has the message been conveyed to Organization *</FormLabel>
                        <FormControl>
                          <RadioGroup
                            onValueChange={field.onChange}
                            value={field.value}
                            className="flex flex-col space-y-2"
                          >
                            <div className="flex items-center space-x-2 p-3 border rounded-lg">
                              <RadioGroupItem value="Y" id="conveyed-yes" data-testid="radio-conveyed-yes" />
                              <Label htmlFor="conveyed-yes" className="cursor-pointer">Yes</Label>
                            </div>
                            <div className="flex items-center space-x-2 p-3 border rounded-lg">
                              <RadioGroupItem value="N" id="conveyed-no" data-testid="radio-conveyed-no" />
                              <Label htmlFor="conveyed-no" className="cursor-pointer">No</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {isConveyed === "Y" && (
                    <FormField
                      control={form.control}
                      name="conveyedTo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>If yes, whom you have contacted?</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter the name of the person contacted"
                              data-testid="input-conveyed-to"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="suggestion"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>How would you suggest to resolve the issue in hand?</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter your suggestion..."
                            className="min-h-[100px]"
                            data-testid="textarea-suggestion"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      disabled={submitMutation.isPending}
                      data-testid="button-submit-feedback"
                    >
                      {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Submit Feedback
                    </Button>
                  </div>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analysis" className="space-y-4">
          <Card>
            <div className="p-3 border-b">
              <div className="flex items-center justify-between gap-2">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search feedback..." 
                    className="pl-8 h-8 text-sm"
                    data-testid="input-search-feedback"
                  />
                </div>
              </div>
            </div>
            <CardContent className="p-0">
              {feedbackHistory.length === 0 && !feedbackHistory ? (
                <div className="p-3 space-y-2">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (
                <>
                  <Table className="text-sm table-fixed">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5" />
                            ID
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            <MessageCircle className="h-3.5 w-3.5" />
                            Type
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            <FileText className="h-3.5 w-3.5" />
                            About
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">
                          <span className="flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" />
                            Department
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium">
                          <span className="flex items-center gap-1.5">
                            <Mail className="h-3.5 w-3.5" />
                            Message
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[200px]">
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5" />
                            Submitted By
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[100px]">
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            Date
                          </span>
                        </TableHead>
                        <TableHead className="h-9 py-2 text-xs font-medium w-[80px]">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle className="h-3.5 w-3.5" />
                            Conveyed
                          </span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feedbackHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-6 text-muted-foreground">
                            No feedback records found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        feedbackHistory.map((feedback) => (
                          <TableRow key={feedback.id} data-testid={`row-feedback-${feedback.id}`}>
                            <TableCell className="py-1.5 font-medium text-sm truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {feedback.id || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{feedback.id || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">{feedback.feedback_type || "-"}</TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {feedback.attribute_1 || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{feedback.attribute_1 || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                             </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[150px] cursor-default">
                                    {feedback.department || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{feedback.department || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                             </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[250px] cursor-default">
                                    {feedback.feedback_msg || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{feedback.feedback_msg || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                             </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-sm block truncate max-w-[200px] cursor-default">
                                    {feedback.submitted_by || "-"}
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                  <p>{feedback.submitted_by || "-"}</p>
                                </TooltipContent>
                              </Tooltip>
                             </TableCell>
                            <TableCell className="py-1.5 text-sm truncate">
                              {feedback.submitted_date 
                                ? formatDate(feedback.submitted_date) 
                                : "-"}
                            </TableCell>
                            <TableCell className="py-1.5">
                              {feedback.is_conveyed === "Y" ? (
                                <Badge variant="default" className="text-xs bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">Yes</Badge>
                              ) : (
                                <Badge variant="secondary" className="text-xs">No</Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>

                  <div className="flex items-center justify-between border-t px-3 py-2">
                    <div className="text-xs text-muted-foreground">
                      Showing {feedbackHistory.length} record(s)
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
