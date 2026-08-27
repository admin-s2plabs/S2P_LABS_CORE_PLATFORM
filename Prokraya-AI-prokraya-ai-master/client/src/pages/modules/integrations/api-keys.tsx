import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/common-functions";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, Copy, Eye, EyeOff, Key, Plus, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";

interface ApiKey {
  id: number;
  key_name: string;
  key_prefix: string;
  description: string | null;
  status: string;
  permissions: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string | null;
}

interface CreateApiKeyResponse {
  id: number;
  key_name: string;
  key_prefix: string;
  api_key: string;
  status: string;
}

export default function ApiKeys() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyDescription, setNewKeyDescription] = useState("");
  const [newKeyExpiry, setNewKeyExpiry] = useState("");
  const [createdKey, setCreatedKey] = useState<CreateApiKeyResponse | null>(null);
  const [showCreatedKeyDialog, setShowCreatedKeyDialog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKey | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ApiKey | null>(null);

  const { data: keys, isLoading } = useQuery<ApiKey[]>({
    queryKey: ["/api/admin/api-keys"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { key_name: string; description?: string; expires_at?: string }) => {
      const res = await apiRequest("POST", "/api/admin/api-keys", data);
      return res.json();
    },
    onSuccess: (data: CreateApiKeyResponse) => {
      setCreatedKey(data);
      setShowCreateDialog(false);
      setShowCreatedKeyDialog(true);
      setNewKeyName("");
      setNewKeyDescription("");
      setNewKeyExpiry("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      toast({ title: "API key created", description: "Store the key securely - it won't be shown again." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to create API key", description: err.message, variant: "destructive" });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("PATCH", `/api/admin/api-keys/${id}/revoke`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      setRevokeTarget(null);
      toast({ title: "API key revoked", description: "The key has been deactivated." });
    },
    onError: (err: any) => {
      toast({ title: "Failed to revoke key", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/admin/api-keys/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/api-keys"] });
      setDeleteTarget(null);
      toast({ title: "API key deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to delete key", description: err.message, variant: "destructive" });
    },
  });

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeKeys = keys?.filter(k => k.status === "Active") || [];
  const revokedKeys = keys?.filter(k => k.status !== "Active") || [];

  return (
    <div className="p-4 space-y-3" data-testid="page-api-keys">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">API Keys</h1>
          <p className="text-sm text-muted-foreground">
            Manage API keys for external systems to integrate with Prokraya via the Inbound Integration Gateway.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-api-key">
          <Plus className="h-4 w-4 mr-1.5" />
          Generate API Key
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-3 space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : !keys || keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Key className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="text-sm font-medium mb-1">No API Keys</h3>
              <p className="text-sm text-muted-foreground mb-3">
                Generate an API key to allow external systems to send data to Prokraya.
              </p>
              <Button variant="outline" size="sm" onClick={() => setShowCreateDialog(true)} data-testid="button-create-api-key-empty">
                <Plus className="h-4 w-4 mr-1.5" />
                Generate API Key
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 py-2 text-xs font-medium">Name</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[120px]">Key Prefix</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[90px]">Status</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium">Description</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">Expires</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">Last Used</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[150px]">Created</TableHead>
                  <TableHead className="h-9 py-2 text-xs font-medium w-[80px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...activeKeys, ...revokedKeys].map((key) => (
                  <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                    <TableCell className="py-1.5 text-sm font-medium" data-testid={`text-key-name-${key.id}`}>{key.key_name}</TableCell>
                    <TableCell className="py-1.5">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded" data-testid={`text-key-prefix-${key.id}`}>
                        {key.key_prefix}
                      </code>
                    </TableCell>
                    <TableCell className="py-1.5">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          key.status === "Active"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                        data-testid={`badge-key-status-${key.id}`}
                      >
                        {key.status}
                      </span>
                    </TableCell>
                    <TableCell className="py-1.5 max-w-[200px] truncate text-sm text-muted-foreground">
                      {key.description || "-"}
                    </TableCell>
                    <TableCell className="py-1.5 text-sm text-muted-foreground whitespace-nowrap">
                      {key.expires_at ? formatDate(key.expires_at) : "Never"}
                    </TableCell>
                    <TableCell className="py-1.5 text-sm text-muted-foreground whitespace-nowrap">
                      {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
                    </TableCell>
                    <TableCell className="py-1.5 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {key.status === "Active" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setRevokeTarget(key)}
                            data-testid={`button-revoke-key-${key.id}`}
                          >
                            <ShieldOff className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setDeleteTarget(key)}
                          data-testid={`button-delete-key-${key.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-medium mb-2">Usage Guide</h3>
          <div className="text-sm text-muted-foreground space-y-1.5">
            <p>Include the API key in the <code className="bg-muted px-1 py-0.5 rounded text-xs">X-API-Key</code> header of your HTTP requests to the Integration Gateway.</p>
            <p>Example:</p>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto mt-1">
{`curl -X POST https://your-domain/api/v1/integration/inbound/receipt \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: pk_your_api_key_here" \\
  -d '{"po_number": "PO_00001", ...}'`}
            </pre>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>
              Create a new API key for an external system to integrate with Prokraya.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name <span className="text-destructive">*</span></Label>
              <Input
                id="key-name"
                placeholder="e.g., SAP ERP Production"
                value={newKeyName}
                onChange={e => setNewKeyName(e.target.value)}
                data-testid="input-key-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-description">Description</Label>
              <Textarea
                id="key-description"
                placeholder="What system will use this key?"
                value={newKeyDescription}
                onChange={e => setNewKeyDescription(e.target.value)}
                className="resize-none"
                data-testid="input-key-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="key-expiry">Expiry Date (optional)</Label>
              <Input
                id="key-expiry"
                type="date"
                value={newKeyExpiry}
                onChange={e => setNewKeyExpiry(e.target.value)}
                data-testid="input-key-expiry"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)} data-testid="button-cancel-create">
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate({
                key_name: newKeyName,
                description: newKeyDescription || undefined,
                expires_at: newKeyExpiry || undefined,
              })}
              disabled={!newKeyName.trim() || createMutation.isPending}
              data-testid="button-confirm-create"
            >
              {createMutation.isPending ? "Generating..." : "Generate Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCreatedKeyDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreatedKeyDialog(false);
          setCreatedKey(null);
          setShowKey(false);
          setCopied(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              API Key Created
            </DialogTitle>
            <DialogDescription>
              Copy this key now. You will not be able to see it again after closing this dialog.
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <p className="text-sm font-medium" data-testid="text-created-key-name">{createdKey.key_name}</p>
              </div>
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex items-center gap-2">
                  <code
                    className="flex-1 bg-muted px-3 py-2 rounded text-xs break-all select-all"
                    data-testid="text-created-api-key"
                  >
                    {showKey ? createdKey.api_key : `${createdKey.key_prefix}${"*".repeat(40)}`}
                  </code>
                  <Button size="icon" variant="ghost" onClick={() => setShowKey(!showKey)} data-testid="button-toggle-key-visibility">
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => handleCopy(createdKey.api_key)}
                    data-testid="button-copy-api-key"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => { setShowCreatedKeyDialog(false); setCreatedKey(null); setShowKey(false); }} data-testid="button-close-created-key">
              I've copied the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revoke API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to revoke "{revokeTarget?.key_name}"? Any systems using this key will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-revoke">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => revokeTarget && revokeMutation.mutate(revokeTarget.id)}
              className="bg-orange-600 border-orange-600"
              data-testid="button-confirm-revoke"
            >
              Revoke Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete API Key</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete "{deleteTarget?.key_name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-destructive"
              data-testid="button-confirm-delete"
            >
              Delete Key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
