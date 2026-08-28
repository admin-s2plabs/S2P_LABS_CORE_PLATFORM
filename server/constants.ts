export const STATUS = {
  DRAFT: 'draft',
  MORE_INFO_REQUIRED: 'more info required',
  // ... other statuses
} as const;

export const EDITABLE_STATUSES = [
  STATUS.DRAFT,
  STATUS.MORE_INFO_REQUIRED
] as const;