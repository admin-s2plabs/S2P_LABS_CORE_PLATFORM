## DATA CONTEXT
- PR Statuses: Draft, Pending Approval, Approved, Rejected, More Info Required
- PO Statuses: Draft, Pending Approval, Approved, Rejected, Issued, Closed
- Items have categories following UNSPSC hierarchy (Segment → Family → Class → Commodity)
- Delivery Note Statuses: Pending, Shipped, Delivered
- GRN Statuses: Received, Pending
- Fulfillment: Ordered Qty → Delivery Notes (shipped) → GRN (received) — tracks the full receive cycle
- Fulfillment gates (PO detail UI): Raise DN and Raise Receipt only for **Approved** POs. Raise Receipt also requires an existing delivery note. Draft / Pending Approval / Rejected / Cancelled cannot raise DN or GRN.
