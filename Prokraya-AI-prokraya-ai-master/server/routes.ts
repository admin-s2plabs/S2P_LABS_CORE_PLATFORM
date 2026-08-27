import type { Express } from "express";
import { createServer, type Server } from "http";
import { oidcController } from "./modules/auth/oidc.controller";
import { ssoController } from "./modules/auth/sso.controller";
import { commonController } from "./modules/common/common.controller";
import { vendorRegistrationController } from "./modules/vendor-registration/vendor-registration.controller";
import { procurementController } from "./modules/procurement/procurement.controller";
import { bidsController } from "./modules/bids/bids.controller";
import { budgetsController } from "./modules/budgets/budgets.controller";
import { administrationController } from "./modules/administration/administration.controller";
import { userManagementController } from "./modules/user-management/user-management.controller";
import { vendorsController } from "./modules/vendors/vendors.controller";
import { aiConsoleController } from "./modules/ai-console/ai-console.controller";
import { invoicesController } from "./modules/invoices/invoices.controller";
import { integrationsController } from "./modules/integrations/integrations.controller";
import { inboundGatewayController } from "./modules/integrations/inbound-gateway.controller";
import { spendAnalysisController } from "./modules/spend-analysis/spend-analysis.controller";
import { reportsController } from "./modules/reports/reports.controller";
import { auctionEventsController } from "./modules/auctions/controller/auctionEvents.controller";
import { freeTrialController } from "./modules/free-trial/free-trial.controller";
import { contractsController } from "./modules/contracts/contracts.controller";
import { contractCopilotController } from "./modules/ai-console/contract-copilot.controller";
import { supplierRankController } from "./modules/vendors/supplier-rank.controller";
import { guardDeleteRequest } from "./modules/_shared/delete-guard";
import { surveyFormController } from "./modules/survey-form/surveyform.controller";
import { tatController } from "./modules/tat/tat.controller";
import { chatbotController } from "./modules/chatbot/chatbot.controller";
import { fmpiController, fmpController } from "./modules/fmpi/fmpi.controller";
import { rfiController } from "./modules/rfi/rfi.controller";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Superadmin + DELETED_FUNCTION lookup gate for module DELETE APIs
  // app.use(guardDeleteRequest);

  // Register modular controllers
  app.use(oidcController);
  app.use(ssoController);
  app.use(freeTrialController);
  app.use(commonController);
  app.use(vendorRegistrationController);
  app.use(procurementController);
  app.use(bidsController);
  app.use(budgetsController);
  app.use(administrationController);
  app.use(userManagementController);
  app.use(vendorsController);
  app.use(aiConsoleController);
  app.use(invoicesController);
  app.use(integrationsController);
  app.use(inboundGatewayController);
  app.use(spendAnalysisController);
  app.use(reportsController);
  app.use(auctionEventsController);
  app.use(contractsController);
  app.use(contractCopilotController);
  app.use(supplierRankController);
  app.use(surveyFormController);
  app.use(tatController);
  app.use(chatbotController);
  app.use(fmpiController);
  app.use(fmpController);
  app.use(rfiController);
  return httpServer;
}
