import {
  AuctionPublishedEvent,
  SuppAuctionQuoteSubmittedEvent,
  AuctionExtendedEvent,
  BidDeleteRequestedEvent,
  BidDeleteApprovedEvent,
  ProxyBidPlacedEvent,
  AuctionEndingSoonEvent,
  AuctionClosedEvent,
  AuctionAwardedEvent,
  AuctionRegretEvent,
  AuctionAutoExtendEvent,
  EventTypes, AuctionAwardRejectedEvent
} from '../events';
import { BaseEmailHandler } from './baseHandler';
import {propertiesService} from "../../propertiesService.ts";

export class AuctionPublishedHandler extends BaseEmailHandler<AuctionPublishedEvent> {
  constructor() { super(EventTypes.AUCTION_PUBLISHED); }
  getRecipients(event: AuctionPublishedEvent) { return event.receiverEmail; }
  getCcRecipients(event: AuctionPublishedEvent) { return event.ccEmail; }
  async getTemplateParams(event: AuctionPublishedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      companyName: event.vendorName,
      auctionId: event.auctionId,
      auctionType:event.auctionType,
      auctionName: event.auctionName,
      startTime: event.startTime,
      endTime: event.endTime,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || '',
    };
  }
}

export class SuppAuctionQuoteSubmittedHandler extends BaseEmailHandler<SuppAuctionQuoteSubmittedEvent> {
  constructor() { super(EventTypes.SUPP_AUCTION_QUOTE_SUBMITTED); }
  getRecipients(event: SuppAuctionQuoteSubmittedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: SuppAuctionQuoteSubmittedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      user: event.userName,
      auctionId: event.auctionId,
      auctionType: event.auctionType,
      auctionName:event.auctionName,
      companyName: event.vendorName,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || ''

    };
  }
}

export class AuctionExtendedHandler extends BaseEmailHandler<AuctionExtendedEvent> {
  constructor() { super(EventTypes.AUCTION_EXTENDED); }
  getRecipients(event: AuctionExtendedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionExtendedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      companyName: event.vendorName,
      auctionId: event.auctionId,
      newEndTime: event.newEndTime,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || ''
    };
  }
}


export class AuctionAutoExtendHandler extends BaseEmailHandler<AuctionAutoExtendEvent> {
  constructor() { super(EventTypes.AUCTION_AUTO_EXTEND); }
  getRecipients(event: AuctionAutoExtendEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionAutoExtendEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      companyName: event.vendorName,
      auctionId: event.auctionId,
      auctionName: event.itemName,
      auctionTimeExtend: event.auctionTimeExtend,
      units: event.units,
      newEndTime: event.newEndTime,
      linkUrl: appUrl,
      orgLogoPath: event.orgLogoPath || ''
    };
  }
}

export class BidDeleteRequestedHandler extends BaseEmailHandler<BidDeleteRequestedEvent> {
  constructor() { super(EventTypes.BID_DELETE_REQUESTED); }
  getRecipients(event: BidDeleteRequestedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidDeleteRequestedEvent) {
    return {
      userName: event.userName,
      auctionId: event.auctionId,
      vendorName: event.vendorName,
      amount: event.amount,
      linkUrl: event.linkUrl
    };
  }
}

export class BidDeleteApprovedHandler extends BaseEmailHandler<BidDeleteApprovedEvent> {
  constructor() { super(EventTypes.BID_DELETE_APPROVED); }
  getRecipients(event: BidDeleteApprovedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: BidDeleteApprovedEvent) {
    return {
      vendorName: event.vendorName,
      auctionId: event.auctionId,
      amount: event.amount
    };
  }
}

export class ProxyBidPlacedHandler extends BaseEmailHandler<ProxyBidPlacedEvent> {
  constructor() { super(EventTypes.PROXY_BID_PLACED); }
  getRecipients(event: ProxyBidPlacedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: ProxyBidPlacedEvent) {
    return {
      vendorName: event.vendorName,
      auctionId: event.auctionId,
      amount: event.amount,
      linkUrl: event.linkUrl
    };
  }
}

export class AuctionEndingSoonHandler extends BaseEmailHandler<AuctionEndingSoonEvent> {
  constructor() { super(EventTypes.AUCTION_ENDING_SOON); }
  getRecipients(event: AuctionEndingSoonEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionEndingSoonEvent) {
    return {
      vendorName: event.vendorName,
      auctionId: event.auctionId,
      endTime: event.endTime,
      linkUrl: event.linkUrl
    };
  }
}

export class AuctionClosedHandler extends BaseEmailHandler<AuctionClosedEvent> {
  constructor() { super(EventTypes.AUCTION_CLOSED); }
  getRecipients(event: AuctionClosedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionClosedEvent) {
    return {
      vendorName: event.vendorName,
      auctionId: event.auctionId
    };
  }
}

export class AuctionAwardedHandler extends BaseEmailHandler<AuctionAwardedEvent> {
  constructor() { super(EventTypes.AUCTION_AWARDED); }
  getRecipients(event: AuctionAwardedEvent) { return event.receiverEmail; }
  getCcRecipients(event: AuctionAwardedEvent) { return event.ccEmail; }
  async getTemplateParams(event: AuctionAwardedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      companyName: event.vendorName,
      auctionId: event.auctionId,
      amount: event.amount,
      orgLogoPath: event.orgLogoPath || '',
      linkUrl: appUrl
    };
  }
}

export class AuctionAwardRejectedHandler extends BaseEmailHandler<AuctionAwardRejectedEvent> {
  constructor() { super(EventTypes.AUCTION_AWARD_REJECTED); }
  getRecipients(event: AuctionAwardRejectedEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionAwardRejectedEvent) {
    const appUrl = await propertiesService.getAppUrlForDomain(event.domain);
    return {
      companyName: event.vendorName,
      auctionId: event.auctionId,
      auctionName: event.auctionName,
      user: event.createdBy,
      approverName:event.approverName,
      orgLogoPath: event.orgLogoPath || '',
      linkUrl: appUrl
    };
  }
}

export class AuctionRegretHandler extends BaseEmailHandler<AuctionRegretEvent> {
  constructor() { super(EventTypes.AUCTION_REGRET); }
  getRecipients(event: AuctionRegretEvent) { return event.receiverEmail; }
  async getTemplateParams(event: AuctionRegretEvent) {
    return {
      vendorName: event.vendorName
    };
  }
}

export const auctionPublishedHandler = new AuctionPublishedHandler();
export const suppAuctionQuoteSubmittedHandler = new SuppAuctionQuoteSubmittedHandler();
export const auctionExtendedHandler = new AuctionExtendedHandler();
export const auctionAutoExtendHandler = new AuctionAutoExtendHandler();
export const bidDeleteRequestedHandler = new BidDeleteRequestedHandler();
export const bidDeleteApprovedHandler = new BidDeleteApprovedHandler();
export const proxyBidPlacedHandler = new ProxyBidPlacedHandler();
export const auctionEndingSoonHandler = new AuctionEndingSoonHandler();
export const auctionClosedHandler = new AuctionClosedHandler();
export const auctionAwardedHandler = new AuctionAwardedHandler();
export const auctionAwardRejectedHandler = new AuctionAwardRejectedHandler();
export const auctionRegretHandler = new AuctionRegretHandler();
