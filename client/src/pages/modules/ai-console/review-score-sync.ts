import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQuery } from "@tanstack/react-query";

/**
 * Sourcing Agent review cards are rendered *after* the agent has already run and
 * persisted AI scoring server-side, so a cached (pre-AI) copy of the evaluation
 * data must never be shown. The global query defaults are `staleTime: Infinity`
 * with no refetch triggers, so these queries opt out and additionally report
 * whether the data on hand came from a fetch started at/after mount.
 */
export function useLiveQuery<T = any>(queryKey: (string | number)[], enabled = true) {
  const keyId = queryKey.join("|");
  const requestedAt = useMemo(() => Date.now(), [keyId, enabled]);

  const query = useQuery<T>({
    queryKey,
    enabled,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const isFresh =
    !enabled || query.dataUpdatedAt >= requestedAt || query.errorUpdatedAt >= requestedAt;

  return { ...query, isFresh };
}

export interface ReviewScoreRow {
  reqId: string;
  score: string;
  remarks: string;
}

interface ServerSeededScores {
  scores: ReviewScoreRow[];
  setScores: Dispatch<SetStateAction<ReviewScoreRow[]>>;
  markDirty: (reqId: string) => void;
}

/**
 * Keeps the editable score rows in sync with whatever the server last persisted
 * (including AI scores that land after the panel has opened), while leaving rows
 * the reviewer has already touched alone. Call `markDirty` before editing a row.
 */
export function useServerSeededScores(
  responseId: string,
  requirements: Array<{ id: string | number }>,
  serverScoreRows: any[] | undefined,
): ServerSeededScores {
  const [scores, setScores] = useState<ReviewScoreRow[]>([]);
  const dirtyReqIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    dirtyReqIds.current.clear();
    setScores([]);
  }, [responseId]);

  const serverScores = useMemo(() => {
    const map = new Map<string, ReviewScoreRow>();
    for (const row of serverScoreRows || []) {
      if (String(row.bid_resp_id) !== String(responseId)) continue;
      const reqId = String(row.bid_resp_req_id);
      map.set(reqId, {
        reqId,
        score: row.score == null ? "" : String(row.score),
        remarks: row.comments ?? "",
      });
    }
    return map;
  }, [serverScoreRows, responseId]);

  const requirementKey = requirements.map((req) => String(req.id)).join(",");

  useEffect(() => {
    if (requirements.length === 0) return;
    setScores((prev) =>
      requirements.map((req, idx) => {
        const reqId = String(req.id);
        if (dirtyReqIds.current.has(reqId)) {
          return prev[idx] ?? { reqId, score: "", remarks: "" };
        }
        const fromServer = serverScores.get(reqId);
        return { reqId, score: fromServer?.score ?? "", remarks: fromServer?.remarks ?? "" };
      }),
    );
    // `requirements` is rebuilt on every render; requirementKey tracks real changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirementKey, serverScores]);

  const markDirty = useCallback((reqId: string) => {
    dirtyReqIds.current.add(reqId);
  }, []);

  return { scores, setScores, markDirty };
}
