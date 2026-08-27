import { Request } from "express";
import { suppRegApprRepo } from "../../modules/vendor-registration/vendor-register-appr-hst.repository"
import * as srmUserMgmtService from "../../modules/user-management/user-management.service"
import * as suppRepo from "../../modules/vendors/vendors.repository"
import {storage} from "../../storage"
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import Handlebars from "handlebars";
import * as adminRepo from "../../modules/administration/administration.repository";
import * as service from "../../modules/bids/bids.service";
import { getContextPool } from "../../tenant-context";
import { pool } from "../../db";
const getPool = () => getContextPool() ?? pool;

export function getLoggedInUser(req: Request | undefined | null): string {
  if (req == null) return "prokrayateam@gmail.com";
  return ((req as any).session?.user as any)?.username ?? "prokrayateam@gmail.com";
}

export const logApproversHistory = async (
  wfStepInstances: any[],
  module: string,
  entityId: string,
  supplierId: string,
  uObj: any,
  comments: string,
  taskCreationDate: Date | null,
  result: string,
  delegatedRoleUser: string,
  sessionUser: any
) => {
  try {
    const now = new Date();

    const getRequestedDate = () => taskCreationDate ?? now;
    // User objects come from raw SQL (snake_case) or session (camelCase) — handle both.
    const userName = (u: any) => u?.userName ?? u?.user_name ?? u?.email_id ?? u?.emailId ?? u?.email;
    const userEmail = (u: any) => u?.email_id ?? u?.emailId ?? u?.email ?? null;
    const loggedInUser = userName(sessionUser);
    const saveHistory = async (data: any) => {
      await suppRegApprRepo.saveSuppRegApprHstDtls(data);
    };

    if (wfStepInstances?.length > 0) {
      const step = wfStepInstances[0];

      // 🔹 USER Assignment
      if (
        (uObj.userName ?? uObj.user_name) !== step.currentAssignee &&
        step.assignmentType === "USER"
      ) {
        // const isAdmin = hasRole("SUPERADMIN") || hasRole("SYSADMIN");
        const isAdmin = "";
        const assignedUser = await srmUserMgmtService.getLoggedInUser(
          loggedInUser
        );

        if (!isAdmin) {
          // Delegated User entry
          await saveHistory({
            objectId: entityId,
            supplierId: Number(supplierId),
            approverId: assignedUser?.id,
            approverName: assignedUser?.name,
            attribute9: userEmail(assignedUser),
            attribute10: assignedUser?.designation,
            status: "Delegated User",
            requestedDate: getRequestedDate(),
            approvedDate: now,
            attribute1: module,
          });
        }

        // Actual approver entry
        await saveHistory({
          objectId: entityId,
          supplierId: Number(supplierId),
          comments,
          approverId: isAdmin ? assignedUser?.id : uObj.id,
          approverName: isAdmin ? assignedUser?.name : uObj.name,
          attribute9: isAdmin ? userEmail(assignedUser) : userEmail(uObj),
          attribute10: isAdmin ? assignedUser?.designation : uObj.designation,
          status: result,
          requestedDate: getRequestedDate(),
          approvedDate: now,
          attribute1: module,
        });
      }

      // 🔹 ROLE Assignment
      else if (step.assignmentType === "ROLE") {
        const loggedUser = await srmUserMgmtService.getLoggedInUser(
          loggedInUser
        );

        if (hasRole(sessionUser, step.currentAssignee)) {
          // Direct role approval
          await saveHistory({
            objectId: entityId,
            supplierId: Number(supplierId),
            approverId: loggedUser?.id ?? uObj.id,
            approverName: loggedUser?.name ?? uObj.name,
            attribute9: userEmail(loggedUser) ?? userEmail(uObj),
            attribute10: loggedUser?.designation ?? uObj.designation,
            comments,
            requestedDate: getRequestedDate(),
            approvedDate: now,
            attribute1: module,
            status: result,
          });
        } else {
          // Delegated Role
          const delegatedUserData =
            (await srmUserMgmtService.getUsersByEmail(
              delegatedRoleUser
            ))?.[0];

          // Delegated role entry
          await saveHistory({
            objectId: entityId,
            supplierId: Number(supplierId),
            approverId: loggedUser?.id ?? uObj.id,
            approverName: (delegatedUserData as any)?.name,
            attribute9: userEmail(loggedUser) ?? userEmail(uObj),
            attribute10: loggedUser?.designation ?? uObj.designation,
            comments,
            requestedDate: getRequestedDate(),
            approvedDate: now,
            attribute1: module,
            status: "Delegated Role",
          });

          // Actual approver entry
          await saveHistory({
            objectId: entityId,
            supplierId: Number(supplierId),
            approverId: loggedUser?.id ?? uObj.id,
            approverName: loggedUser?.name ?? uObj.name,
            attribute9: userEmail(loggedUser) ?? userEmail(uObj),
            attribute10: loggedUser?.designation ?? uObj.designation,
            comments,
            requestedDate: getRequestedDate(),
            approvedDate: now,
            attribute1: module,
            status: result,
          });
        }
      }

      // 🔹 Default case
      else {
        await saveHistory({
          objectId: entityId,
          supplierId: Number(supplierId),
          comments,
          approverId: uObj.id,
          approverName: uObj.name,
          attribute9: userEmail(uObj),
          attribute10: uObj.designation,
          status: result,
          requestedDate: getRequestedDate(),
          approvedDate: now,
          attribute1: module,
        });
      }
    }

    // 🔹 No workflow steps
    else {
      await suppRegApprRepo.saveSuppRegApprHstDtls({
        objectId: entityId,
        supplierId: Number(supplierId),
        comments,
        approverId: uObj.id,
        approverName: uObj.name,
        attribute9: userEmail(uObj),
        attribute10: uObj.designation,
        status: result,
        requestedDate: taskCreationDate ?? new Date(),
        approvedDate: new Date(),
        attribute1: module,
      });
    }
  } catch (error) {
    console.error("Error in logApproversHistory:", error);
  }
};

export function hasRole(req: Request, role: string): boolean {

  const user = req.session.user;

  if (!user || !user.userRole) return false;

  const expectedRole = `ROLE_${role}`;

  return user.userRole.includes(expectedRole);
}

export async function getSupplierDataForPDF(supplierId: number) 
{
    try {
        let basicDetails = await storage.getDboSupplier(supplierId);
        const contacts = await storage.getDboSupplierContacts(supplierId);
        const bankDetails = await storage.getDboSupplierBanks(supplierId);
        const goodsServices1 = await storage.getDboSupplierServices(supplierId);
        const documents = await storage.getDboSupplierDocuments(supplierId);
        const supplierDocuments =documents?.filter((doc: any) => doc.recordType === "SUPPLIER_REG") ?? [];
        const orgData = await adminRepo.getOrgDetails();
        if (basicDetails?.annualTurnOver !== null && basicDetails?.annualTurnOver !== undefined &&basicDetails?.annualTurnOver !== "")
        {
            basicDetails.annualTurnOver = Number(basicDetails.annualTurnOver).toFixed(2);
        }

        let goodsServices: any[] = [];

        if (Array.isArray(goodsServices1)) 
        {
        goodsServices = goodsServices1.map(item => ({
        category: item.categoryCode,
        subCategory: item.subCategory
    }));
   }

        return {
            basicDetails,
            expiryDate: basicDetails?.expiryDate
                ? dayjs(basicDetails.expiryDate).format("DD/MM/YYYY")
                : "NA",
            taxEffectiveDate: basicDetails?.taxEffectiveDate
                ? dayjs(basicDetails.taxEffectiveDate).format("DD/MM/YYYY")
                : "NA",
            incorporationDate:  basicDetails?.busTradingDate
                ? dayjs(basicDetails.busTradingDate).format("DD/MM/YYYY")
                : "NA",
            contacts,
            bankDetails,
            goodsServices,
            documents:supplierDocuments,
            logo: orgData.org_logo_path,
            orgData
        };
    } 
    catch (error) 
    {
        console.error("Error while fetching supplier data:", error);
        return{
            success: false,
            message: "Failed to fetch supplier data",
            data: null
        };
    }
}

export async function generatepdfReview(supplierid: string,pdfType: string,username: string): Promise<Buffer | { success: false; message: string }> 
{
    try 
    {
      let data;
      if(pdfType.includes("supplier"))
      {
        data = await getSupplierDataForPDF(Number(supplierid));
      }
      else if(pdfType.includes("bid"))
      {
        data = await getAllBidData(supplierid,username);
      }
      else if(pdfType.includes("comparisionsheet"))
      {
        data = await getComparisionData(supplierid,username);
      }
      else
      {
        return {
            success: false,
            message: "Unable to generate the PDF."
        };
      }
      console.log(data);
        Handlebars.registerHelper("defaultValue", function (value: any) {
        return value !== null &&
            value !== undefined &&
            value !== ""
            ? value
            : "";
    });

    Handlebars.registerHelper("inc", function (value: number) {
    return Number(value) + 1;
});

Handlebars.registerHelper("chunk", function (array: any[], size: number, options: any) {
    if (!Array.isArray(array)) {
        return "";
    }

    let output = "";

    for (let i = 0; i < array.length; i += size) {
        const chunk = array.slice(i, i + size);

        output += options.fn({
            suppliers: chunk,
            supplierStartIndex: i
        });
    }

    return output;
});
        if (!data || (data as any).success === false) 
        {
            return{
                success: false,
                message: "Unable to generate the PDF. Failed to fetch supplier data."
            };
        }

        let htmlTemplate;
        if(pdfType.includes("supplier"))
        {
          htmlTemplate =await getPool().query(`SELECT html_template FROM dbo.document_templates WHERE template_name = 'review-profile'`);
        }
        else if(pdfType.includes("bid"))
        {
          htmlTemplate =await getPool().query(`SELECT html_template FROM dbo.document_templates WHERE template_name = 'bid-audit'`);
        }
        else if(pdfType.includes("comparisionsheet"))
        {
          htmlTemplate =await getPool().query(`SELECT html_template FROM dbo.document_templates WHERE template_name = 'comparisionsheet'`);
        }
        else
        {
          
        }
        /*if(htmlTemplate)
        {
          return {
            success: false,
            message: "template is not defined Unable to generate the PDF."
          };
        }*/
        const templateSource = htmlTemplate?.rows[0].html_template;
        // const templateSource = fs.readFileSync(htmlTemplate, "utf8");
        const template = Handlebars.compile(templateSource);
        const html = template(data);

        const browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox"
            ]
        });

        try {
            const page = await browser.newPage();
            await page.setContent(html, {
                waitUntil: "load"
            });

            const pdfBuffer = await page.pdf({
                format: "A4",
                printBackground: true,
                displayHeaderFooter: false,
                margin: {
                    top: "15mm",
                    right: "10mm",
                    bottom: "15mm",
                    left: "10mm"
                }
            });

            return Buffer.from(pdfBuffer);
        } finally {
            await browser.close();
        }
    } 
    catch (error) 
    {
        console.error("Error generating supplier review PDF:", error);
        return {
            success: false,
            message: "Unable to generate the PDF."
        };
    }
}

async function getAllBidData(bidId: string,username:string) 
{
  try
  {
    const bid = await service.getDboBidDetail(Number(bidId));   
    const auditTrail = await service.getAuditHistoryForBid(Number(bidId));
    let reportSummary = await service.getAllReportStatus(Number(bidId));
    let responseSummary = await service.getResponseSummaryByBidId(Number(bidId));
    let approvalCount = await service.getApprovalCount(bidId);
    let organization = await adminRepo.getOrganizationNameById((bid as any).org_id);
  const vendorParticipation = reportSummary?.rows.map((row: any) => {
    const status = row?.resp_status?.trim().toLowerCase();

    return {
    vendorName: row.supplier_name,
    invited: "Yes",
    participated: row?.ack_status?.includes("Not Participated") ? "No" : "Yes",
    responseStatus: status?.includes("draft")
      ? "Draft Saved"
      : ((status?.includes("submitted") || status?.includes("awarded"))
      ? "Submitted": "Not Participated"),
    submittedOn: row?.last_updated_date
      ? dayjs(row.last_updated_date).format("DD/MM/YYYY")
      : "NA",
    };
  });

    const count =(responseSummary ?? []).filter((row: any) =>row.response_status?.toLowerCase().includes("submitted")).length;
    const vendorResponseSummary = responseSummary?.map((row: any) => ({
    supplier_name: row.supplier_name,
    commercialResponse: row.response_status?.includes("Submitted")? "Yes": row.response_status?.includes("Awarded")?"Yes":row.response_status?.includes("Draft")? "Pending": "",
    technicalResponse: (bid as any)?.type.includes("RFQ")? "NA": 
    row.response_status?.toLowerCase().includes("Submitted".toLocaleLowerCase())? "Yes": row.response_status?.toLowerCase().includes("Draft".toLowerCase())? 
    "Pending": row.response_status?.toLowerCase().includes("awarded".toLocaleLowerCase())? "Yes": "",
    attachmentCount: row.document_count,
    finalStatus: row.response_status?.includes("Submitted")? "Qualified": row.response_status?.toLowerCase().includes("Draft".toLowerCase())? "In Progress": 
    row.response_status?.toLowerCase().includes("awarded".toLocaleLowerCase())? "Qualified": "",
     }));

    const approvalHistory = approvalCount?.map((row: any) => ({
    approver: row.approver_name,
    decision: row.approver_action,
    comments: row.comments,
    dateTime: row?.approved_date ? dayjs(String(row.approved_date)).add(5, "hour").add(30, "minute").format("DD/MM/YYYY HH:mm"): "NA",
     }));

    return {
    bid,auditTrail: auditTrail?.rows ?? [],vendorParticipation,vendorResponseSummary,generatedBy:username,date:dayjs().add(5, "hour").add(30, "minute").format("DD/MM/YYYY hh:mm A"),
    enddate: bid?.enddate? dayjs(String(bid.enddate)).add(5, "hour").add(30, "minute").format("DD/MM/YYYY hh:mm A"): "NA",
    startDate: bid?.startdate? dayjs(String(bid.startdate)).add(5, "hour").add(30, "minute").format("DD/MM/YYYY hh:mm A"): "NA",
    approvalHistory,
    approvalStages: String(approvalHistory?.length ?? 0),
    organization,
    responsecount:count
    };
  }
  catch(error)  
  {
   console.error(error);
   return{
            success: false,
            message: "Failed to fetch Bid data",
            data: null
        };
  }  
}

async function getComparisionData(bidId: string,username:string) 
{
  try
  {
    const bidDetails = await service.getDboBidDetail(Number(bidId));   
    const bidResponses = await service.getBidResponseDetailsAndRemarks(Number(bidId));
    const suppliers = bidResponses.filter((row: any) => row?.status === "Submitted").map((row: any) => ({
    supplierName: row.supplier_name,
    responseId: row.id,
      remarks: row.technical_remarks,
      score:row.total_score,
    commercial:
    {
      quotedAmount: row.bidtotal,
      tax:row.tax_amount,
      total:row.grosstotal,
      commercialScore:row.finscore
    }
    }));

    const recommendation = bidResponses.filter((row: any) => row?.status === "Submitted" && (row.fin_recommended === 'Y' || row.recommended==='Y')).map((row: any) => ({
    supplierName: row.supplier_name,
    remarks:row.total_score,
    }));
    return {
      bidDetails,generatedBy:username,date:dayjs().add(5, "hour").add(30, "minute").format("DD/MM/YYYY hh:mm A"),
      suppliers,recommendation,
      technicalComparisons:{
        suppliers
      }
    };
  }
  catch(error)
  {
    console.error(error);
  }
}