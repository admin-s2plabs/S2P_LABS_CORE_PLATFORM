import { Router, Request, Response, NextFunction } from "express";
import * as service from "../services/auctionEvents.service";
import type { AuAuctionSuppResponseEvent } from "@shared/schema";
import { upload } from "../../_shared/file-upload";
import { logAudit } from "../../administration/administration.service";
import { List } from "lucide-react";
import { createAuctionEvent } from "../services/auctionEvents.service";

const router = Router();

/** Multipart clients send the JSON body as a single `payload` field; plain JSON POST uses req.body directly. */
function parseAuctionSuppRespBody(body: Record<string, unknown>): Record<string, unknown> {
  const raw = body?.payload;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return body;
    }
  }
  return body;
}

function multipartPlaceProxyOptional(req: Request, res: Response, next: NextFunction) {
  const ct = String(req.headers["content-type"] || "");
  if (ct.includes("multipart/form-data")) {
    return upload.fields([{ name: "placeProxy" }])(req, res, next);
  }
  next();
}

function handleError(res: any, error: any, fallbackMessage: string) {
  if (error?.status) {
    return res.status(error.status).json({ error: error.message });
  }
  console.error(fallbackMessage + ":", error);
  res.status(500).json({ error: error?.message || fallbackMessage });
}

function audit(req: any, auditKey: string, auditAction: string, auditMessage: string, module: string) {
  const user = (req as any).user;
  logAudit({
    auditKey,
    auditAction,
    auditMessage,
    fullName: user?.name || "System",
    userId: user?.id || "system",
    module,
  }).catch((err: any) => console.error("[Audit] Failed to log:", err?.message));
}

router.get("/api/auctionEvents/getAllEventTemplates", async (_req, res) => {
  try {
    const templates = await service.getAllEventTemplates();
    res.json(templates);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch event templates");
  }
});

router.post("/api/auctionEvents/createEventTemplate", async (req, res) => {
  try {
    const user = (req as any).user || (req as any).session?.user || "Unknown User";
    const result = await service.createEventTemplate(req.body, user);
    res.json(result);
    audit(req, String(result.id), "CREATE", "Event template created", "AUCTIONS");
  } catch (error: any) {
    handleError(res, error, "Failed to create event template");
  }
});

router.get("/api/auctionEvents/getEventTemplateById/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await service.getEventTemplateById(id);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch event template");
  }
});

router.post(
  "/api/auctionEvents/createAuctionEvent",
  upload.fields([{ name: "buyerDocs" }, { name: "suppDocs" },]),
  async (req, res) => {
    let user = (req as any).user || (req as any).session?.user || "Unknown User";
    const orgId = user?.orgId;
    const files = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const buyerDocs = files["buyerDocs"] ?? [];
    const suppDocs = files["suppDocs"] ?? [];
    try {
      const result = await createAuctionEvent(
        req.body,
        buyerDocs,
        suppDocs,
        user,
        orgId
      );

      res.json({ eventId: result });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  }
);

router.get("/api/auctionEvents/getAllAuctionEvents", async (_req, res) => {
  try {
    const result = await service.getAllAuctionEvents();
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch auction events");
  }
});

router.get("/api/auctionEvents/getAllActiveAuctions", async (_req, res) => {
  try {
    const result = await service.getAllActiveAuctions();
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch active auctions");
  }
});



router.get("/api/auctionEvents/getAllUpcomingAuctions", async (_req, res) => {
  try {
    const result = await service.getAllUpcomingAuctions();
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch upcoming auctions");
  }
});

/** Buyer auctions page — queryKey in client: `/api/auctionEvents/getLiveAuctions` */
router.get("/api/auctionEvents/getLiveAuctions", async (_req, res) => {
  try {
    let list = await service.getLiveAuctions();
    list = (list as any[]).map((auct: any) => ({
      ...auct,
      suppIds: null,
      templateRows: null,
      tncIds: null,
    }));
    res.json(list);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch live auctions");
  }
});

router.get("/api/auctionEvents/getScheduledAuctions", async (_req, res) => {
  try {
    let list = await service.getScheduledAuctions();
    list = (list as any[]).map((auct: any) => ({
      ...auct,
      suppIds: null,
      templateRows: null,
      tncIds: null,
    }));
    res.json(list);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch scheduled auctions");
  }
});

router.get("/api/auctionEvents/getClosedAuctions", async (_req, res) => {
  try {
    let list = await service.getClosedAuctions();
    list = (list as any[]).map((auct: any) => ({
      ...auct,
      suppIds: null,
      templateRows: null,
      tncIds: null,
    }));
    list = await Promise.all(
      (list as any[]).map(async (auct: any) => {
        const currentApprover = await service.getCurrentApprover(auct.id, "Auction");
        return {
          ...auct,
          currentApprover: currentApprover?.name || null,
        };
      })
    );
    res.json(list);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch closed auctions");
  }
});

router.get("/api/auctionEvents/getAuctionEventById/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const result = await service.getAuctionEventById(id);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch auction event");
  }
});

// need more to work 
router.get("/api/auctionEvents/getAuctionEventDetailsById/:id", async (req, res) => { 
  try {
    const id = Number(req.params.id);
    const result = await service.getAuctionEventDetailsById(id);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch auction event details");
  }
});

router.get("/api/auctionEvents/getAllAuctionEventsBySupplier/:supplierId", async (req, res) => {
  try {
    const supplierId = Number(req.params.supplierId);
    const result = await service.getAllAuctionEventsBySupplier(supplierId);
    res.json(result);
  } catch (error: any) {
    handleError(res, error, "Failed to fetch auction events by supplier");
  }
});

router.get("/api/auctionEvents/getAllActiveAuctionBySupplier/:supplierId", async (req, res) => {
	 try {
    const supplierId = Number(req.params.supplierId);
    const pageNo = req.query.pageNo ? Number(req.query.pageNo) : 0;
    const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 10;

    let suppEvents = await service.getActiveAuctionsBySupplierId(supplierId, pageNo, pageSize);

    suppEvents = await service.locationsOfAuctions(suppEvents);

    suppEvents = suppEvents.map((auct: any) => ({
      ...auct,
      suppIds: null,
      templateRows: null,
      tncIds: null
    }));

    res.json(suppEvents);

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching auctions" });
  }
});

router.get("/api/auctionEvents/getAllCompletedAuctions", async (req, res) =>{
    try{
    let auctionList = await service.getAllCompletedAuctions();
        auctionList = auctionList.map((auct: any) => ({
            ...auct,
            suppIds: null,
            templateRows: null,
            tncIds: null
        }));
		return res.json(auctionList);
    }catch(error){
        console.error(error);
        handleError(res, error, "Failed to fetch completed auctions");
    }
});

router.get("/api/auctionEvents/getAllCompletedAuctionBySupplier/:supplierId", async (req, res) =>{
    try{
        const supplierId = Number(req.params.supplierId);
        const pageNo = req.query.pageNo ? Number(req.query.pageNo) : 0;
        const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 10;
    
        let events = await service.getCompletedAuctionsBySupplierId(supplierId, pageNo, pageSize);
        events = await service.locationsOfAuctions(events);

        events = events.map((auct: any) => ({
            ...auct,
            suppIds: null,
            templateRows: null,
            tncIds: null
        }));
        return res.json(events);
    }catch(error){
        console.error(error);
        handleError(res, error, "Failed to fetch completed auctions by supplier");
    }

});

router.get("/api/auctionEvents/getAllUpcomingAuctionBySupplier/:supplierId", async (req, res) => {
	try{
        const supplierId = Number(req.params.supplierId);
        const pageNo = Number(req.query.pageNo) || 0;
        const pageSize = Number(req.query.pageSize) || 10;  
        let events = await service.getUpcomingAuctionsBySupplierId(supplierId, pageNo, pageSize);
        events = await service.locationsOfAuctions(events);
        events = events.map((auct: any) => ({
            ...auct,
            suppIds: null,
            templateRows: null,
            tncIds: null
        }));
        return res.json(events);
    }catch(error){
        console.error(error);
        handleError(res, error, "Failed to fetch upcoming auctions by supplier");
    }
});

// need to work
router.get("/api/auctionEvents/getAllAuctionRespEvents", async(req, res) => {
    service.getAllAuctionRespEvents().then((result) => {
        res.json(result);
    }).catch((error) => {   
        console.error(error);
        handleError(res, error, "Failed to fetch auction response events");
    });
})

router.get("/api/auctionEvents/getDraftAuctions", async(req, res) => {
    try{
        let auctionList = await service.getDraftAuctions();
        auctionList = auctionList.map((auct: any)=>({
            ...auct,
            suppIds: null,
            templateRows: null,
            tncIds: null
        }));
        return res.json(auctionList);
    }catch(error){
        console.error(error);
        handleError(res, error, "Failed to fetch draft auctions");
    }
});

router.get("/api/auctionEvents/getDraftAuctionById/:auctionId", async(req, res) => {
    try{
        const auctionId = Number(req.params.auctionId); 
        let auctionItem = await service.getDraftAuctionById(auctionId);
        return res.json(auctionItem);
    }catch(error){
        console.error(error);
        handleError(res, error, "Failed to fetch draft auction details");
    }
});

router.get("/api/auctionEvents/getOrderActivity/:auctionId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    try {
      const auction = await service.getAuctionorderActivity(auctionId);
      return res.json(auction);
    } catch (error: any) {
      handleError(res, error, "Failed to fetch order activity");
    }
});


router.get("/api/auctionEvents/getBroadCastMessage/:auctionId", async(req, res) => {
  try{
  const auctionId = Number(req.params.auctionId);
  let message = await service.getBroadCastMessage(auctionId);
  return res.json(message);
  }catch(error){
    console.error(error);
    handleError(res, error, "Failed to fetch broadcast message");
  }
});



	router.get("/api/auctionEvents/getBidSummary/:auctionId", async(req, res) => {
   try{
    const auctionId = Number(req.params.auctionId);
    let summary = await service.getBidSummary(auctionId);
    return res.json(summary);
   }catch(error){
    console.error(error);
    handleError(res, error, "Failed to fetch bid summary");
    }
  });

  router.post("/api/auctionEvents/broadcastMessage", async(req, res) => {
    try {
      const sessionUser = (req as any).user || (req as any).session?.user || {};
      const createdBy: string =
        sessionUser?.username ?? sessionUser?.email ?? sessionUser?.userName ?? "";
      const result = await service.broadcastMessage(req.body, createdBy);
      return res.json(result);
    } catch (error: any) {
      handleError(res, error, "Failed to broadcast message");
    }
  });

router.post("/api/auctionEvents/extendTimeRemain", async(req, res) => {
    try {
      const event = await service.extendTimeRemain(req.body);
      if (event) {
        return res.json({ message: "Successfully processed your request!" });
      }
      return res.status(400).json({ message: "Error - Unable to Extend Auction Time" });
    } catch (error: any) {
      handleError(res, error, "Failed to extend auction time");
    }
});

router.post("/api/auctionEvents/updateSupplierAuctionSeenStatus/:auctionId/:suppId", async( req , res ) =>{
  const auctionId = Number(req.params.auctionId);
  const suppId = Number(req.params.suppId);
  const user = (req as any).user?.name || req.session?.user?.name || "Unknown User";

  service.updateSupplierAuctionSeenStatus(auctionId, suppId, user);
});

router.post("/api/auctionEvents/withdrawAuction", async(req, res) => {
    let requestBody = req.body;
    let user = req.session?.user?.name || "Unknown User";
    let event = await service.withdrawAuction(requestBody, user);

    if(event) {
        return res.json({ message: "Successfully processed your request!" });
    }else{
        return res.status(400).json({ message: "Error - Unable to Withdraw Auction" });
    }
});

router.post("/api/auctionEvents/updateMinBidDiff", async(req, res) => {
    let requestBody = req.body;
    let user = req.session?.user?.name || "Unknown User";
    let event = await service.updateMinBidDiff(requestBody, user);

    if(event) {
        return res.json({ message: "Successfully processed your request!" });
    }else{
        return res.status(400).json({ message: "Error - Unable to Update Minimum Bid Difference" });
    }
});

router.post("/api/auctionEvents/copyAuction/:auctionId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const user = req.session?.user?.name || "Unknown User";
    let result = await service.copyAuction(auctionId, user);
    if(result === "Success") {
        return res.json({ message: "Successfully copied the auction!" });
    } else {
        return res.status(400).json({ message: result || "Error - Unable to copy the auction" });
    }
});

router.post("/api/auctionEvents/awardAuction/:auctionId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const supplierId = Number(req.body.supplierId);
    const awardComments = req.body.awardComments;
    const user = (req as any).user|| "Unknown User";
    let result = await service.awardAuction(auctionId, supplierId, awardComments, user);
    if(result && !String(result).toLowerCase().includes("error")) {
        const awardId = Number(result);
        return res.json({
          message: "Successfully awarded the auction!",
          awardId: Number.isFinite(awardId) ? awardId : undefined,
          data: result,
        });
    } else {
        return res.status(400).json({ message: typeof result === "string" ? result : "Error - Unable to award the auction" });
    }
});

router.post("/api/auctionEvents/partialAwardAuction/:auctionId/:awardComments", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const awardComments = req.params.awardComments;
    const partialAward = req.body;
    const user = (req as any).user|| "Unknown User";
    let result = await service.awardAuctionPartial(auctionId, partialAward, awardComments, user);
    if(result) {
        return res.json({ message: "Successfully awarded the auction partially!" });
    } else {
        return res.status(400).json({ message: "Error - Unable to award the auction partially" });
    }
});

router.post("/api/auctionEvents/cancelAward/:awardId", async(req, res) => {
    const awardId = Number(req.params.awardId);
    let result = await service.cancelAward(awardId);
    if(result) {
        return res.json({ message: "Successfully cancelled the award!" });
    } else {
        return res.status(400).json({ message: "Error - Unable to cancel the award" });
    }
});
// Additional endpoints can be added here following the patterns from the Java controller.
router.post("/api/auctionEvents/deleteTemplateRows/:auctionId/:rowId", async(req, res) => {  
    const auctionId = Number(req.params.auctionId);
    const rowId = Number(req.params.rowId);
    let result = await service.deleteTemplateRows(auctionId, rowId);
    if(result) {
        return res.json({ message: "Successfully deleted the template rows!" });
    } else {
        return res.status(400).json({ message: "Error - Unable to delete the template rows" });
    }
});

router.post("/api/auctionEvents/deleteResponse/:auctionId/:supplierId/:id", async(req, res) => {
  try {
    const auctionId = Number(req.params.auctionId);
    const supplierId = Number(req.params.supplierId);
    const id = Number(req.params.id);
    const user = (req as any).user?.user_name
      || (req as any).user?.userName
      || req.session?.user?.name
      || "Unknown User";

    if (!Number.isFinite(auctionId) || !Number.isFinite(supplierId) || !Number.isFinite(id)) {
      return res.status(400).json({ message: "Invalid auctionId, supplierId or response id" });
    }

    const result = await service.deleteResponse(auctionId, supplierId, id, user);
    if (result === "Success") {
      return res.json({ message: "Successfully deleted the response!" });
    }
    return res.status(400).json({ message: result || "Error - Unable to delete the response" });
  } catch (err: any) {
    console.error("[deleteResponse] Unhandled error:", err?.message ?? err);
    return res.status(500).json({ message: err?.message || "Internal server error" });
  }
});


// Need to work on below APIs
router.post("/api/auctionEvents/addAuctionSuppliers/:auctionId/:suppIds", async(req, res) => {
    try {
      const auctionId = Number(req.params.auctionId);
      const suppIds = req.params.suppIds.split(",").map((id: string) => Number(id));
      const user = req.session?.user?.name || "Unknown User";
      const result = await service.addAuctionSuppliers(auctionId, suppIds, user);
      if (typeof result === "string" && result.startsWith("Error")) {
        return res.status(400).json({ message: result });
      }
      if (result == null) {
        return res.status(400).json({ message: "Unable to add suppliers" });
      }
      return res.json({ message: result });
    } catch (error: any) {
      handleError(res, error, "Failed to add auction suppliers");
    }
});

  router.post("/api/auctionEvents/processAwardApproval/:taskId", async(req, res) => {
    const taskId = req.params.taskId;
    const result = req.body.result;
    const comments = req.body.comments;
    const auctionAwardId = req.body.auctionAwardId;
    const delegatedUser = req.body.delegatedUser;
    const loggedInUser = (req as any).user || req.session?.user || {};
    let serviceResult = await service.processAwardAppr(
      taskId,
      result,
      comments,
      auctionAwardId,
      delegatedUser,
      loggedInUser
    );
    if (typeof serviceResult === "string" && /error/i.test(serviceResult)) {
      return res.status(400).json({ message: serviceResult });
    }
    return res.json({ message: serviceResult ?? "Successfully processed your request." });
  });

  router.post("/api/auctionEvents/submitAwardApprovalPartial/:auctionAwardNo", async(req, res) => {
    const auctionAwardNo = Number(req.params.auctionAwardNo);
    const awardNotes = req.body.awardNotes;
    let serviceResult = await service.submitAuctionAwardApprovalPartial(auctionAwardNo, awardNotes, (req as any).user);
    if (typeof serviceResult === "string" && /error/i.test(serviceResult)) {
      return res.status(400).json({ message: serviceResult });
    }
    return res.json({ message: serviceResult ?? "Successfully processed your request." });
  });

  router.post("/api/auctionEvents/processAwardApprovalPartial/:taskId", async(req, res) => {
    const taskId = req.params.taskId;
    const result = req.body.result;
    const comments = req.body.comments;
    const auctionAwardId = req.body.auctionAwardId;
    const delegatedUser = req.body.delegatedUser;
     const loggedInUser = (req as any).user || {};
    let serviceResult = await service.processAwardApprPartial(taskId, result, comments, auctionAwardId, delegatedUser, loggedInUser);
    if (typeof serviceResult === "string" && /error/i.test(serviceResult)) {
      return res.status(400).json({ message: serviceResult });
    }
    return res.json({ message: serviceResult ?? "Successfully processed your request." });
  });

  router.post("/api/auctionEvents/createPOFromAward", async(req, res) => {
    const awardBidHeaderDTO = req.body;
    const loggedInUser = (req as any).user || {};
    let serviceResult = await service.createPOFromAward(awardBidHeaderDTO, loggedInUser);
    return res.json(serviceResult);
  });

  router.get("/api/auctionEvents/getSupplierResponseBySupplierId/:supplierId", async(req, res) => {
     const supplierId = Number(req.params.supplierId);
     let result = await service.getSupplierResponseBySupplierId(supplierId);
     return res.json(result);
  }
  );

  router.get("/api/auctionEvents/getSupplierResponsesByAuctionId/:auctionId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    let result = await service.getSupplierResponsesByAuctionId(auctionId);
    return res.json(result);
  });

  router.get("/api/auctionEvents/getAuctionEventDetailsBySupp/:auctionId/:suppId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const suppId = Number(req.params.suppId);
    let result = await service.getAuctionEventDetailsBySupp(auctionId, suppId);
    return res.json(result);
  }
  );
 router.get("/api/auctionEvents/getBidSummaryHistBySupplier/:auctionId/:supplierId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const suppId = Number(req.params.supplierId);
    let result = await service.getBidSummaryHistBySupplier(auctionId, suppId);
    return res.json(result);
  }
  );

  router.get("/api/auctionEvents/getBidDeleteRequestBySupp/:auctionId/:supplierId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const suppId = Number(req.params.supplierId);
    let result = await service.getBidDeleteRequestBySupp(auctionId, suppId);
    return res.json(result);
  }
  );

  router.get("/api/auctionEvents/getBidSummaryPartial/:auctionId/:auctionType", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    const auctionType = req.params.auctionType;
    let result = await service.getBidSummaryPartial(auctionId, auctionType);
    return res.json(result);
  }
);

router.get("/api/auctionEvents/getAwardDetails/:auctionAwardNo", async(req, res) => {
    const auctionAwardNo = Number(req.params.auctionAwardNo);
    let result = await service.getAwardDetails(auctionAwardNo);
    return res.json(result);
  }
);

router.get("/api/auctionEvents/getAwardApprovalHistory/:awardNo", async (req, res) => {
  try {
    const awardNo = Number(req.params.awardNo);
    if (!Number.isFinite(awardNo)) return res.status(400).json({ error: "Invalid award number" });
    const result = await service.getAwardApprovalHistory(awardNo);
    return res.json(result);
  } catch (error: any) {
    return res.status(500).json({ error: error?.message || "Failed to fetch approval history" });
  }
});

  router.get("/api/auctionEvents/auctionLineGraph/:auctionId", async(req, res) => {
    const auctionId = Number(req.params.auctionId);
    let result = await service.auctionLineGraph(auctionId);
    return res.json(result);
  });

  router.post("/api/auctionEvents/sendAuctionSuppRespEvents",
    upload.fields([{ name: "placeProxy"}]),
     async(req, res) => {
    const auAuctionSuppResponseEvent = parseAuctionSuppRespBody(
      req.body as Record<string, unknown>
    ) as unknown as AuAuctionSuppResponseEvent;
    const placeProxy = (req.files ?? {}) as Record<string, Express.Multer.File[]>;
    const placeProxyFile = placeProxy["placeProxy"] ?? [];
    const user = (req as any )?.user|| "Unknown User";
    let result = await service.createAuctionSuppRespEvents(auAuctionSuppResponseEvent, user, placeProxyFile);
    return res.json(result);
  }
);

  router.post("/api/auctionEvents/updateAuctionSuppRespEvents", multipartPlaceProxyOptional, async(req, res) => {
    const auAuctionSuppResponseEvent = parseAuctionSuppRespBody(
      req.body as Record<string, unknown>
    ) as unknown as AuAuctionSuppResponseEvent;
    const user = (req as any)?.user;
    let result = await service.updateAuctionSuppRespEvents(auAuctionSuppResponseEvent, user);
    return res.json(result);
  });

router.post("/api/auctionEvents/submitAwardApproval/:auctionAwardNo", async(req, res) => {
    const auctionAwardNo = Number(req.params.auctionAwardNo);
    const awardNotes = req.body.awardNotes;
    let serviceResult = await service.submitAuctionAwardForApproval(auctionAwardNo, awardNotes,(req as any).user);
    if (typeof serviceResult === "string" && /error/i.test(serviceResult)) {
      return res.status(400).json({ message: serviceResult });
    }
    return res.json({ message: serviceResult ?? "Successfully processed your request." });
  });

router.post("/api/auctionEvents/reRaiseAward/:awardId", async (req, res) => {
  const awardId = Number(req.params.awardId);
  if (!Number.isFinite(awardId) || awardId <= 0) {
    return res.status(400).json({ message: "Invalid award ID" });
  }
  const result = await service.reRaiseAuctionAward(awardId);
  if (typeof result === "string" && /error/i.test(result)) {
    return res.status(400).json({ message: result });
  }
  return res.json({ message: result ?? "Award re-raised successfully." });
});

router.delete("/api/auctionEvents/:auctionId", async (req, res) => {
  try {
    const auctionId = Number(req.params.auctionId);
    if (!Number.isFinite(auctionId)) {
      return res.status(400).json({ error: "Invalid auction ID" });
    }
    const result = await service.deleteAuctionEvent(auctionId);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error?.message || "Failed to delete auction" });
  }
});

export const auctionEventsController = router;
