// Types used by auctions-convert module.
// These interfaces are minimal placeholders. Update with real fields as you map the Java domain models.

export interface AuctionEventTemplate {
  id?: number;
  name?: string;
  createdBy?: string;
  creationTime?: string | Date;
  lastModifiedBy?: string;
  lastModificationTime?: string | Date;
  // ...add other properties as needed
}

export interface AuctionEvent {
  id?: number;
  name?: string;
  status?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  createdBy?: string;
  creationTime?: string | Date;
  lastModificationTime?: string | Date;
  lastModifiedBy?: string;
  // ...add other properties as needed
}

export interface AuctionEventDetails extends AuctionEvent {
  // extend with more details
}

export interface AuctionSuppResponseEvent {
  id?: number;
  supplierId?: number;
  supplierName?: string;
  // ...add other properties as needed
}

export interface AuctionBroadCastMessage {
  id?: number;
  auctionId?: number;
  message?: string;
  createdBy?: string;
  creationTime?: string | Date;
}

export interface AuctionExtendTimeRemain {
  auctionId?: number;
  extendTimeUnits?: String;
  extendTime?: number;

}

export interface AuctionMinBidDiff {
  auctionId?: number;
  products: AuAuctionMinBidDiffProduct[];
}

export interface AuAuctionMinBidDiffProduct {
  product?: string;
  mbdvalue?: string;
  auRowId?: number;
  columnId?: string;
}

export interface AuctionWithdraw {
  auctionId?: number;
  reason?: string;
}

export interface AuctionPartialAward {
  // define as needed
}

export interface AuctionAwardDTO {
  // define as needed
}

export interface AwardBidHeaderDTO {
  // define as needed
}


export interface AuctionResponseHistoryDTO {
  deliveryDateStr?: string;
  startDateStr?: string;
  endDateStr?: string;
  datePattern?: string;
  latestBid?: boolean;
}