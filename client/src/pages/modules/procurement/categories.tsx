import { StatusCountBadges } from "@/components/status-count-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FormSheet } from "@/components/form-sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Category, CategoryLevel } from "@shared/schema";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  FolderTree,
  Grid3X3,
  Layers,
  Package,
  Plus,
  Search,
  Trash2,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const levelConfig: Record<CategoryLevel, { label: string; icon: typeof FolderTree; color: string }> = {
  segment: { label: "Segment", icon: Layers, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  family: { label: "Family", icon: FolderTree, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  class: { label: "Class", icon: Grid3X3, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  commodity: { label: "Commodity", icon: Package, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
};

function hasParentCategory(cat: Category): boolean {
  return Boolean(String(cat.parentCode ?? "").trim());
}

function LevelBadge({ level }: { level: CategoryLevel }) {
  const config = levelConfig[level];
  const Icon = config.icon;
  return (
    <Badge variant="secondary" className={`gap-1 ${config.color}`}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

interface TreeNodeProps {
  category: Category;
  allCategories: Category[];
  level: number;
  expandedNodes: Set<string>;
  toggleNode: (code: string) => void;
  onSelect: (category: Category) => void;
  selectedCode: string | null;
  matchingCodes: Set<string>;
}

function TreeNode({ category, allCategories, level, expandedNodes, toggleNode, onSelect, selectedCode, matchingCodes }: TreeNodeProps) {
  const children = allCategories.filter(c => c.parentCode === category.code);
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(category.code);
  const isSelected = selectedCode === category.code;
  const isMatch = matchingCodes.has(category.code);

  return (
    <div>
      <div
        className={`flex items-center gap-2 py-2 px-2 rounded-md cursor-pointer hover-elevate ${
          isSelected ? "bg-primary/10" : isMatch ? "bg-yellow-50 dark:bg-yellow-900/20" : ""
        }`}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={() => onSelect(category)}
        data-testid={`tree-node-${category.code}`}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleNode(category.code);
            }}
            className="p-0.5 hover:bg-muted rounded"
            data-testid={`button-toggle-${category.code}`}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <span className={`font-mono text-sm ${isMatch ? "text-foreground font-medium" : "text-muted-foreground"}`}>{category.code}</span>
        <span className={`flex-1 text-sm ${isMatch ? "font-medium" : ""}`}>{category.name}</span>
        <LevelBadge level={category.level as CategoryLevel} />
      </div>
      {isExpanded && hasChildren && (
        <div>
          {children.map(child => (
            <TreeNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              level={level + 1}
              expandedNodes={expandedNodes}
              toggleNode={toggleNode}
              onSelect={onSelect}
              selectedCode={selectedCode}
              matchingCodes={matchingCodes}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Categories() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(["43", "44", "46"]));
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [viewMode, setViewMode] = useState<"tree" | "table">("tree");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCategory, setNewCategory] = useState({ code: "", name: "", description: "", level: "commodity", parentCode: "" });
  const { toast } = useToast();

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setSelectedCategory(null);
      toast({ title: "Category deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete category", description: error.message, variant: "destructive" });
    },
  });

  const { data: categories = [], isLoading } = useQuery<Category[]>({
    queryKey: ["/api/categories"],
  });

  const { data: vendorCategories = [] } = useQuery({
    queryKey: ["/api/categories", selectedCategory?.code, "vendors"],
    queryFn: async () => {
      if (!selectedCategory) return [];
      const res = await apiRequest("GET", `/api/categories/${selectedCategory.code}/vendors`);
      return res.json();
    },
    enabled: !!selectedCategory,
  });

  // Select first category by default when data loads
  useEffect(() => {
    if (categories.length > 0 && !selectedCategory) {
      const firstCategory = categories.find(c => c.level === "segment") || categories[0];
      setSelectedCategory(firstCategory);
    }
  }, [categories, selectedCategory]);

  const createMutation = useMutation({
    mutationFn: async (data: typeof newCategory) => {
      return apiRequest("POST", "/api/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/categories"] });
      setIsAddDialogOpen(false);
      setNewCategory({ code: "", name: "", description: "", level: "commodity", parentCode: "" });
      toast({ title: "Category created", description: "New category has been added successfully." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create category.", variant: "destructive" });
    },
  });

  const toggleNode = (code: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  };

  const categoriesMatchingSearch = useMemo(() => {
    return categories.filter((cat) => {
      const matchesSearch =
        searchQuery === "" ||
        cat.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (cat.description &&
          cat.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesSearch;
    });
  }, [categories, searchQuery]);

  const typeBadgeItems = useMemo(
    () => [
      {
        value: "category",
        label: "Category",
        count: categoriesMatchingSearch.filter((c) => !hasParentCategory(c))
          .length,
      },
      {
        value: "subcategory",
        label: "Subcategory",
        count: categoriesMatchingSearch.filter(hasParentCategory).length,
      },
    ],
    [categoriesMatchingSearch],
  );

  // Build set of matching codes and their ancestors for tree view
  const matchingCodes = new Set<string>();
  const ancestorCodes = new Set<string>();
  
  categories.forEach(cat => {
    const matchesSearch = searchQuery === "" || 
      cat.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      cat.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (cat.description && cat.description.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesType =
      typeFilter === "all" ||
      (typeFilter === "category" && !hasParentCategory(cat)) ||
      (typeFilter === "subcategory" && hasParentCategory(cat));
    if (matchesSearch && matchesType) {
      matchingCodes.add(cat.code);
      // Add all ancestors to ensure they are visible
      let parent = cat.parentCode;
      while (parent) {
        ancestorCodes.add(parent);
        const parentCat = categories.find(c => c.code === parent);
        parent = parentCat?.parentCode || null;
      }
    }
  });

  // For tree view: include matches and their ancestors
  const visibleCodes = new Set([...matchingCodes, ...ancestorCodes]);
  const treeCategoriesFiltered = searchQuery || typeFilter !== "all"
    ? categories.filter(cat => visibleCodes.has(cat.code))
    : categories;
  
  // For table view: only show actual matches
  const filteredCategories = categories.filter(cat => matchingCodes.has(cat.code));

  // Root categories for tree view
  const rootCategories = treeCategoriesFiltered.filter(c => !c.parentCode);

  const stats = {
    total: categories.length,
    segments: categories.filter(c => c.level === "segment").length,
    families: categories.filter(c => c.level === "family").length,
    classes: categories.filter(c => c.level === "class").length,
    commodities: categories.filter(c => c.level === "commodity").length,
  };

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2 text-primary" data-testid="page-title">
            <FolderTree className="h-5 w-5 text-primary" />
            Category Management
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">UNSPSC-based procurement category hierarchy</p>
        </div>
        <Button size="sm" onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-category">
          <Plus className="h-4 w-4 mr-1.5" />
          Add Category
        </Button>
      </div>

      <FormSheet
        open={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        title="Add New Category"
        description="Create a new UNSPSC category for supplier qualification and item classification."
        onSubmit={() => createMutation.mutate(newCategory)}
        submitLabel={createMutation.isPending ? "Creating..." : "Create Category"}
        isSubmitting={createMutation.isPending}
        submitDisabled={!newCategory.code || !newCategory.name || createMutation.isPending}
      >
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive">*</span> Indicates mandatory fields
        </p>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Code <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g., 43211502"
                value={newCategory.code}
                onChange={e => setNewCategory(prev => ({ ...prev, code: e.target.value }))}
                data-testid="input-category-code"
              />
            </div>
            <div className="space-y-2">
              <Label>Level <span className="text-destructive">*</span></Label>
              <Select
                value={newCategory.level}
                onValueChange={v => setNewCategory(prev => ({ ...prev, level: v }))}
              >
                <SelectTrigger data-testid="select-category-level">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="segment">Segment (2-digit)</SelectItem>
                  <SelectItem value="family">Family (4-digit)</SelectItem>
                  <SelectItem value="class">Class (6-digit)</SelectItem>
                  <SelectItem value="commodity">Commodity (8-digit)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="Category name"
                value={newCategory.name}
                onChange={e => setNewCategory(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-category-name"
              />
            </div>
            <div className="space-y-2">
              <Label>Parent Code</Label>
              <Input
                placeholder="e.g., 4321 for families under segment 43"
                value={newCategory.parentCode}
                onChange={e => setNewCategory(prev => ({ ...prev, parentCode: e.target.value }))}
                data-testid="input-category-parent"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief description of the category"
              value={newCategory.description}
              onChange={e => setNewCategory(prev => ({ ...prev, description: e.target.value }))}
              data-testid="input-category-description"
            />
          </div>
        </div>
      </FormSheet>

      <div className="grid gap-3 md:grid-cols-4">
        <Card className="hover-elevate">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FolderTree className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Total Categories</p>
              <p className="text-xl font-bold">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Segments</p>
              <p className="text-xl font-bold">{stats.segments}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
              <FolderTree className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Families</p>
              <p className="text-xl font-bold">{stats.families}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover-elevate">
          <CardContent className="flex items-center gap-3 p-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">Commodities</p>
              <p className="text-xl font-bold">{stats.commodities}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <StatusCountBadges
          totalLabel="All"
          totalCount={categoriesMatchingSearch.length}
          selected={typeFilter}
          loading={isLoading}
          onSelect={(v) => setTypeFilter(v)}
          items={typeBadgeItems}
        />
        <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search categories by code or name..."
            className="pl-9"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            data-testid="input-search-categories"
          />
        </div>
        <div className="flex border rounded-md">
          <Button
            variant={viewMode === "tree" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("tree")}
            data-testid="button-view-tree"
          >
            <FolderTree className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === "table" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => setViewMode("table")}
            data-testid="button-view-table"
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="lg:col-span-2">
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-medium">Category Hierarchy</CardTitle>
            <CardDescription className="text-xs">
              {filteredCategories.length} categories found
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {viewMode === "tree" ? (
              <div className="border rounded-md max-h-[500px] overflow-auto">
                {rootCategories.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">
                    No categories found matching your search.
                  </div>
                ) : (
                  rootCategories.map(cat => (
                    <TreeNode
                      key={cat.id}
                      category={cat}
                      allCategories={treeCategoriesFiltered}
                      level={0}
                      expandedNodes={expandedNodes}
                      toggleNode={toggleNode}
                      onSelect={setSelectedCategory}
                      selectedCode={selectedCategory?.code || null}
                      matchingCodes={matchingCodes}
                    />
                  ))
                )}
              </div>
            ) : (
              <div className="border rounded-md overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Level</TableHead>
                      <TableHead>Parent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCategories.map(cat => (
                      <TableRow 
                        key={cat.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedCategory(cat)}
                        data-testid={`row-category-${cat.code}`}
                      >
                        <TableCell className="font-mono">{cat.code}</TableCell>
                        <TableCell>{cat.name}</TableCell>
                        <TableCell>
                          <LevelBadge level={cat.level as CategoryLevel} />
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground">
                          {cat.parentCode || "-"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm font-medium">Category Details</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            {selectedCategory ? (
              <div className="space-y-3">
                {(
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteCategoryMutation.mutate(String(selectedCategory.id))}
                    disabled={deleteCategoryMutation.isPending}
                    data-testid="button-delete-category"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Category
                  </Button>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Code</p>
                  <p className="font-mono text-base font-medium" data-testid="text-selected-code">{selectedCategory.code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Name</p>
                  <p className="text-sm font-medium" data-testid="text-selected-name">{selectedCategory.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Level</p>
                  <LevelBadge level={selectedCategory.level as CategoryLevel} />
                </div>
                {selectedCategory.description && (
                  <div>
                    <p className="text-xs text-muted-foreground">Description</p>
                    <p className="text-sm">{selectedCategory.description}</p>
                  </div>
                )}
                {selectedCategory.parentCode && (
                  <div>
                    <p className="text-xs text-muted-foreground">Parent Category</p>
                    <p className="font-mono text-sm">{selectedCategory.parentCode}</p>
                  </div>
                )}
                
                <div className="pt-3 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs font-medium">Qualified Suppliers</p>
                  </div>
                  {vendorCategories.length > 0 ? (
                    <div className="space-y-1.5">
                      {vendorCategories.map((vc: any) => (
                        <div key={vc.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/50">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs">Vendor ID: {vc.vendorId.slice(0, 8)}...</span>
                          <Badge variant="outline" className="ml-auto text-xs">
                            {vc.qualificationStatus}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No suppliers qualified for this category yet.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <FolderTree className="h-10 w-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Select a category to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
