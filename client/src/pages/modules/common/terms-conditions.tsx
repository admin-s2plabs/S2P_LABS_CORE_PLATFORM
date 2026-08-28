import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import React, { useState } from "react";

export interface TnCData {
    id: number;
    module_name: string;
    tnc_text: string;
    status: number;
    created_by: string;
    creation_time: string;
    filename: string;
    filetype: string;
    data: string;
}

export const base64ToBlobUrl = (base64: string, contentType: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    return URL.createObjectURL(blob);
};

export default function TermsConditions(props: { type: string, dataTestId?: string, className?: string }) {
    const { type } = props;

    const [tncClicked, setTncClicked] = useState(false);
    const [showSheet, setShowSheet] = useState(false);

    const { data: termsConditions, isLoading } = useQuery<TnCData>({
        queryKey: ["/api/terms-conditions-by-name/", type],
        queryFn: async () => {
            const res = await apiRequest("GET", `/api/terms-conditions-by-name/${type}`);
            if (!res.ok) throw new Error("Failed to fetch terms and conditions");
            return res.json();
        },
        enabled: tncClicked,
    });

    const toggleTermsConditions = (e: React.MouseEvent<HTMLSpanElement>) => {
        e.preventDefault();
        setShowSheet(true);
        setTncClicked(true);
    };

    return (
        <>
            <span 
                className={props.className ? props.className : "text-primary underline"}
                data-testid={props.dataTestId}
                onClick={(e) => toggleTermsConditions(e)}
                style={{ cursor: 'pointer' }}
            >
                Terms &amp; Conditions
            </span>

            <Sheet open={showSheet} onOpenChange={setShowSheet}>
                <SheetContent className="w-[65vw] sm:max-w-[65vw] overflow-y-auto p-4">
                    <SheetHeader className="space-y-0 pb-1">
                        <SheetTitle className="text-base">Terms and Conditions</SheetTitle>
                    </SheetHeader>

                    <div className="space-y-4 mt-2">
                        {isLoading ?
                            <div className="p-4 space-y-4">
                                <Skeleton className="h-8 w-48" />
                                <div className="grid gap-4 lg:grid-cols-3">
                                    <Skeleton className="h-80" />
                                    <Skeleton className="h-80 lg:col-span-2" />
                                </div>
                            </div>
                            : <></>
                        }
                        {termsConditions?.data && termsConditions.filetype ? (
                            <object
                                aria-label="terms-conditions-document"
                                data={`${base64ToBlobUrl(termsConditions.data, termsConditions.filetype)}#toolbar=0&navpanes=0&scrollbar=0`}
                                width="100%"
                                height="500"
                            />
                        ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                No terms &amp; conditions found
                            </div>
                        )}
                    </div>
                </SheetContent>
            </Sheet>
        </>
    );
};