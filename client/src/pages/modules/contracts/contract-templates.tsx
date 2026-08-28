import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight,
  Copy, Layers,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const PAGE_SIZE = 20;

interface Template {
  id: number;
  template_name: string;
  template_description: string | null;
  section_count: number;
}

export default function ContractTemplates() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<{ records: Template[]; total: number }>({
    queryKey: ["/api/contracts/templates", search, page],
    queryFn: () =>
      apiRequest("GET", 
        `/api/contracts/templates?search=${encodeURIComponent(search)}&page=${page}&limit=${PAGE_SIZE}`
      ).then((r) => r.json()),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const templates = data?.records ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/contracts/templates"] });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/contracts/templates/${id}`),
    onSuccess: () => { invalidate(); setDeleteTarget(null); toast({ title: "Template deleted successfully" }); },
    onError: (e: any) => {
      setDeleteTarget(null);
      toast({ title: "Cannot delete template", description: e.message, variant: "destructive" });
    },
  });

  const copyMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/contracts/templates/${id}/copy`, {}),
    onSuccess: () => { invalidate(); toast({ title: "Template copied successfully" }); },
    onError: () => toast({ title: "Failed to copy template", variant: "destructive" }),
  });

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  return (
    <div className="p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Contract Templates</h1>
          <p className="text-sm text-muted-foreground">Pre-built templates for faster contract creation</p>
        </div>
        <Button
          size="sm"
          onClick={() => setLocation("/app/contract-templates/new")}
          data-testid="button-new-template"
        >
          <Plus className="h-4 w-4 mr-1" />
          New Template
        </Button>
      </div>

      {/* Table Card */}
      <Card>
        <CardContent className="p-3">
          {/* Toolbar */}
          <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                data-testid="input-search-templates"
                placeholder="Search templates..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8 h-8 text-sm w-[220px]"
              />
            </form>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium w-[80px]">ID</TableHead>
                  <TableHead className="text-xs font-medium">Template Name</TableHead>
                  <TableHead className="text-xs font-medium">Description</TableHead>
                  <TableHead className="text-xs font-medium w-[100px] text-center">Clauses</TableHead>
                  <TableHead className="text-xs font-medium w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : templates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10">
                      <Copy className="h-8 w-8 text-indigo-400 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {search ? "No templates match your search" : "No templates found"}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  templates.map((t) => (
                    <TableRow key={t.id} data-testid={`row-template-${t.id}`}>
                      <TableCell className="font-mono text-sm font-medium text-primary py-2">{t.id}</TableCell>
                      <TableCell className="text-sm font-medium py-2">
                        <button
                          type="button"
                          className="hover:underline hover:text-primary transition-colors text-left"
                          onClick={() => setLocation(`/app/contract-templates/${t.id}`)}
                          data-testid={`link-template-${t.id}`}
                        >
                          {t.template_name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm py-2 max-w-[300px] text-muted-foreground">
                        {t.template_description ? (
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-default">{t.template_description}</span>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-[320px] text-xs whitespace-pre-wrap">
                                {t.template_description.slice(0, 250)}
                                {t.template_description.length > 250 ? "…" : ""}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="py-2 text-center">
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Layers className="h-3 w-3" />
                          {t.section_count}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-2">
                        <div className="flex items-center gap-0.5">
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => copyMutation.mutate(t.id)}
                            disabled={copyMutation.isPending}
                            title="Copy template"
                            data-testid={`button-copy-template-${t.id}`}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => setLocation(`/app/contract-templates/${t.id}`)}
                            title="Edit template"
                            data-testid={`button-edit-template-${t.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(t)}
                            data-testid={`button-delete-template-${t.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3">
              <p className="text-xs text-muted-foreground">
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-xs px-2">{page} / {totalPages}</span>
                <Button
                  variant="outline" size="icon" className="h-7 w-7"
                  disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{deleteTarget?.template_name}</strong> will be permanently deleted.
              {deleteTarget && Number(deleteTarget.section_count) > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  Warning: This template has {deleteTarget.section_count} clause{Number(deleteTarget.section_count) !== 1 ? "s" : ""} linked. You must remove those clauses first.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-template">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete-template"
            >
              {deleteMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
