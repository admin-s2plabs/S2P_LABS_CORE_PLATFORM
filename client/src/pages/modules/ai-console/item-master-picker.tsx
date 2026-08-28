/**
 * Item master combobox shared by the PR and PO recommendation cards.
 *
 * A recommendation line is only submittable once it points at a real catalog
 * item, so the picker renders the "Select item..." prompt for any line the
 * engine could not match — the free text the user typed is never offered as a
 * selectable value.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown } from "lucide-react";
import type { PrRecommendationLineItem } from "@shared/agent-pr-recommendation";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiRequest, parseJsonResponse } from "@/lib/queryClient";
import { cn } from "@/lib/utils";
import type { MasterItem } from "./recommendation-line-items";

export type { MasterItem };

/** Item master rows for the picker. Cached across cards in the same chat. */
export function useMasterItems() {
  return useQuery<MasterItem[]>({
    queryKey: ["/api/items", "recommendation-picker"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/items?page=1&limit=500");
      const json = await parseJsonResponse<{ items?: MasterItem[] } | MasterItem[]>(res);
      if (Array.isArray(json)) return json;
      return json.items ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function ItemMasterPicker({
  item,
  masterItems,
  disabled,
  onSelect,
}: {
  item: PrRecommendationLineItem;
  masterItems: MasterItem[];
  disabled: boolean;
  onSelect: (master: MasterItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = masterItems.find((entry) => entry.id === item.itemId);
  const label = item.itemId
    ? selected?.name || item.description || "Select item..."
    : "Select item...";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-8 w-full justify-between font-normal px-2"
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search item master..." />
          <CommandList>
            <CommandEmpty>No item found.</CommandEmpty>
            <CommandGroup>
              {masterItems.map((master) => (
                <CommandItem
                  key={master.id}
                  value={`${master.name} ${master.itemCode ?? ""} ${master.categoryName ?? ""}`}
                  onSelect={() => {
                    onSelect(master);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      item.itemId === master.id ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{master.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {[master.itemCode, master.categoryName].filter(Boolean).join(" · ") || master.id}
                    </p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
