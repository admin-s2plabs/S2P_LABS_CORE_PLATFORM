import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCheck, Mail, Search } from "lucide-react";
import { useEffect, useState } from "react";

interface EmailNotification {
  id: number;
  notification_id: string;
  notif_subject: string;
  notif_msg: string;
  from_user: string;
  to_user: string;
  status: string | null;
  recieved_date: string | null;
  creation_date: string | null;
  created_by: string;
}

interface EmailNotificationsResponse {
  data: EmailNotification[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export default function EmailNotifications() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedEmail, setSelectedEmail] = useState<EmailNotification | null>(null);
  const limit = 10;

  const { data, isLoading, isFetched } = useQuery<EmailNotificationsResponse>({
    queryKey: ["/api/email-notifications", page, limit, search],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (search) params.append("search", search);
      const res = await apiRequest("GET", `/api/email-notifications?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/email-notifications/${id}/mark-read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications/latest"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/email-notifications/mark-all-read");
    },
    onSuccess: () => {
      toast({ title: "All notifications marked as read" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications/unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-notifications/latest"] });
    },
  });

  const notifications = data?.data || [];
  const totalPages = data?.totalPages || 1;

  // Auto-select first email when data loads
  useEffect(() => {
    if (isFetched && notifications.length > 0 && !selectedEmail) {
      setSelectedEmail(notifications[0]);
      if (notifications[0].status === 'New' || !notifications[0].status) {
        markReadMutation.mutate(notifications[0].id);
      }
    }
  }, [isFetched, notifications.length]);

  const handleSelectEmail = (email: EmailNotification) => {
    setSelectedEmail(email);
    if (email.status === 'New' || !email.status) {
      markReadMutation.mutate(email.id);
    }
  };

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">
            My Notifications
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View and manage your email notifications
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllReadMutation.mutate()}
          disabled={markAllReadMutation.isPending}
          data-testid="button-mark-all-read"
        >
          <CheckCheck className="h-4 w-4 mr-1" />
          Mark All Read
        </Button>
      </div>

      <Card className="flex flex-1 overflow-hidden">
        {/* Left Panel - Email List */}
        <div className="w-[340px] border-r flex flex-col bg-muted/10">
          <div className="p-3 border-b bg-background">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-8 h-9"
                data-testid="input-search"
              />
            </div>
          </div>

          <ScrollArea className="flex-1 flex flex-col overflow-hidden min-h-0">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No notifications found
              </div>
            ) : (
              <div className="divide-y">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() => handleSelectEmail(notification)}
                    className={`p-3 cursor-pointer transition-colors ${
                      selectedEmail?.id === notification.id
                        ? 'bg-primary/10 border-l-2 border-l-primary'
                        : notification.status === 'New' || !notification.status
                        ? 'bg-blue-50/80 dark:bg-blue-950/20 hover:bg-blue-100/80 dark:hover:bg-blue-950/30'
                        : 'hover:bg-muted/50'
                    }`}
                    data-testid={`email-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-semibold ${
                        notification.status === 'New' || !notification.status ? 'bg-primary' : 'bg-muted-foreground'
                      }`}>
                        {(notification.from_user || "S").charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm truncate ${
                          notification.status === 'New' || !notification.status ? 'font-semibold' : 'font-medium'
                        }`} title={notification.notif_subject}>
                          {notification.notif_subject || "-"}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {notification.from_user || "SYSTEM"}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-muted-foreground font-mono">
                            Tracking ID: {notification.id}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(notification.recieved_date, true)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {totalPages > 1 && (
            <div className="p-2 border-t flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Page {page}/{totalPages}
              </span>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  Prev
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Email Details */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {selectedEmail ? (
            <>
              <div className="px-6 py-3 border-b bg-background">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary flex items-center justify-center text-white text-sm font-semibold shrink-0">
                    {(selectedEmail.from_user || "SA").substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-medium text-sm truncate">
                      {selectedEmail.notif_subject} - Tracking ID: {selectedEmail.id}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(selectedEmail.recieved_date, true)}
                    </p>
                  </div>
                  <Badge variant={selectedEmail.status === 'Read' ? 'secondary' : 'default'} className="shrink-0">
                    {selectedEmail.status === 'Read' ? 'Read' : 'New'}
                  </Badge>
                </div>
              </div>

              <div className="px-6 py-2 border-b bg-muted/20">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Message Details</span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto bg-muted/10 min-h-0">
                <div className="p-6 min-w-0">
                  <Card className="p-6 w-full">
                    {selectedEmail.notif_msg ? (
                      <div 
                        className="prose prose-sm max-w-none dark:prose-invert [&_table]:w-full [&_img]:max-w-[200px] overflow-x-auto"
                        dangerouslySetInnerHTML={{ __html: selectedEmail.notif_msg }}
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">No message content available.</p>
                    )}
                  </Card>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground bg-muted/10">
              <div className="text-center">
                <Mail className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Select an email to view details</p>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
