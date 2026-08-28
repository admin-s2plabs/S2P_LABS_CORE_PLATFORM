# Vendor AI Agent - Design Guidelines

## Design Approach

**Selected Approach**: Design System - Material Design 3 + Modern Enterprise SaaS (inspired by Linear, Attio, Salesforce Lightning)

**Justification**: This is an information-dense, utility-focused enterprise application requiring consistency, clarity, and efficiency. Material Design 3 provides robust patterns for data tables, forms, and complex workflows while modern SaaS aesthetics ensure the interface feels contemporary and trustworthy.

---

## Typography System

**Font Families**:
- Primary: Inter (Google Fonts) - body text, forms, data
- Monospace: JetBrains Mono (Google Fonts) - reference numbers, codes, IDs

**Type Scale**:
- Headings: text-3xl (dashboard titles), text-2xl (section headers), text-xl (card headers)
- Body: text-base (primary content), text-sm (secondary info, labels)
- Small: text-xs (metadata, timestamps, helper text)
- Weights: font-medium (headings, labels), font-normal (body), font-semibold (emphasis, CTAs)

---

## Layout System

**Spacing Primitives**: Tailwind units of 2, 4, 6, 8, 12, 16 (focus on 4, 8, 16 for consistency)

**Grid Structure**:
- Dashboard: 12-column grid with sidebar (16rem fixed width)
- Content area: max-w-7xl with px-6 lg:px-8 padding
- Forms: Two-column layout (lg:grid-cols-2) for efficiency, single column on mobile
- Data tables: Full-width within content container

**Container Strategy**:
- Fixed sidebar navigation (w-64, min-h-screen)
- Main content: flex-1 with proper padding
- Modal overlays: max-w-2xl for forms, max-w-6xl for document viewers

---

## Component Library

### Navigation & Structure

**Main Sidebar**:
- Fixed left navigation (64px compact icons or 256px expanded with labels)
- Logo/company name at top
- Primary navigation items with icons (Heroicons)
- User profile/settings at bottom
- Active state: subtle background fill + accent indicator line
- Collapsible on mobile with overlay

**Top Bar**:
- Breadcrumb navigation (text-sm with chevron separators)
- Search bar (prominent, w-96)
- Notification bell icon
- User avatar with dropdown

**AI Chat Interface**:
- Fixed bottom-right floating button (64x64, rounded-full)
- Chat panel slides up (h-[600px], w-96, shadow-2xl)
- Message bubbles: user (align-right), AI (align-left)
- Input field with send button at bottom
- Typing indicator animation

### Forms & Inputs

**Form Layout**:
- Clear section grouping with dividers
- Two-column responsive grid (single on mobile)
- Inline field validation with icons
- Required field indicators (asterisk)
- Help text below fields (text-sm)

**Input Components**:
- Text fields: border-2 focus state, rounded-lg, p-3
- Dropdowns: Custom styled with icons
- File upload: Drag-and-drop zone with visual feedback
- Checkboxes/Radio: Material Design styled
- Date pickers: Calendar overlay

**Document Upload Area**:
- Large drop zone (min-h-48, border-2 border-dashed)
- File type icons and size limits displayed
- Upload progress bars
- Document preview thumbnails in grid
- OCR extraction status indicators

### Data Display

**Tables**:
- Sticky header row
- Alternating row backgrounds for scannability
- Action column on right (icons only)
- Sort indicators in headers
- Pagination at bottom
- Row selection with checkboxes
- Expandable rows for details

**Cards**:
- Vendor cards: flex layout with avatar/logo left, content right
- Status badges: rounded-full px-3 py-1 text-xs font-medium
- Document cards: thumbnail, filename, metadata, actions
- Metric cards: Large number, label, trend indicator

**Status Indicators**:
- Risk scoring: Progress bar with label (0-100 scale)
- Compliance status: Badge with icon (verified, pending, expired, missing)
- Document validation: Icon + text (check circle, alert, error)
- Timeline: Vertical stepper showing onboarding progress

### Interactive Elements

**Buttons**:
- Primary: Solid, rounded-lg, px-6 py-3
- Secondary: Outline style
- Tertiary: Ghost/text only
- Icon buttons: p-2, rounded-md
- Loading states: spinner + disabled appearance

**Modals/Dialogs**:
- Overlay backdrop (backdrop-blur-sm)
- Centered modal with shadow-2xl
- Header with title + close button
- Content area with appropriate padding (p-6)
- Footer with action buttons (right-aligned)

**AI Suggestions Panel**:
- Inline suggestion cards with icon
- Accept/dismiss actions
- Confidence score indicator
- Explanation text expandable

---

## Images

**No large hero images** - This is an enterprise application focused on functionality.

**Required Images**:
- Company/vendor logos: Square avatars (64x64, rounded-md)
- Document thumbnails: Preview images for uploaded files
- Empty state illustrations: Simple line art for empty tables/lists
- OCR preview: Visual highlighting of extracted fields on document images
- User avatars: Circular, 40x40 in header, 32x32 in lists

---

## Animations

**Minimal & Purposeful**:
- Page transitions: Fade-in only (duration-200)
- Modal appearance: Scale + fade (duration-300)
- AI chat messages: Slide-up as they appear
- Form validation: Shake animation on error
- Loading states: Subtle spinner, skeleton screens for tables
- No scroll-triggered animations
- No hover transforms beyond subtle scale (hover:scale-102)

---

## Accessibility

**Critical Requirements**:
- WCAG AA compliance mandatory for government/PSU clients
- All form inputs with proper labels and ARIA attributes
- Keyboard navigation for all interactive elements
- Focus states clearly visible (ring-2 ring-offset-2)
- Screen reader announcements for AI suggestions
- Sufficient touch targets (min 44x44)
- Error messages linked to form fields

---

## Key Differentiators

- **AI confidence visualization**: Clear indicators when AI provides suggestions
- **Human-in-the-loop emphasis**: All AI actions require explicit approval
- **Audit trail visibility**: Timestamps and user attribution throughout
- **Multi-step form progress**: Clear stepper component showing completion
- **Document-centric design**: Large preview areas with annotation capability
- **Dual-user optimization**: Interfaces optimized for both vendors and procurement teams