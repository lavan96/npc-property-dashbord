
## Conversations Hub & Notification System — Implementation Plan

### ✅ Phase 1: Database & Permissions Setup — COMPLETE
- **Added `conversation_reply` notification type** to the `notifications_type_check` constraint
- **Created DB trigger** `notify_conversation_reply()` on `ghl_conversation_messages` — auto-creates notification for inbound messages with sender name, channel, and preview
- **Registered `conversations` module** in `dashboard_modules`
- **Added `ghl_conversations` and `ghl_conversation_messages`** to `supabase_realtime` publication

### ✅ Phase 2: Standalone Conversations Page — COMPLETE
- **Created `/conversations` route** with `ModuleGuard` wrapping
- **Built full-page Conversations Hub** (`src/pages/Conversations.tsx`) with:
  - Left panel: all conversations across all clients, sorted by most recent, searchable/filterable by channel
  - Right panel: selected conversation thread with chat UI, date separators, attachments
  - Client context bar with quick link to client profile
  - Reply composer with SMS/Email/WhatsApp channels, mailbox selector for email (Email Copilot)
  - Unread indicators with badge counts
  - Real-time subscriptions for live updates
- **Added sidebar navigation item** "Conversations" with MessageSquare icon (desktop + mobile)

### ✅ Phase 3: Real-Time Notifications — COMPLETE
- **Updated `ghl-webhook-receiver`** to insert notification row on inbound message (supplements DB trigger)
- **Added `conversation_reply` to frontend NotificationType** — toasts auto-appear via existing system
- **Deep-link from notification** — clicking navigates to `/conversations`

### ✅ Phase 4: Polish & Edge Cases — COMPLETE
- **Mark as read**: Opening a conversation resets `unread_count` to 0 (optimistic local update + DB write)
- **Responsive layout**: Mobile stacks panels vertically (list → thread with back button)
- **Empty states**: No conversations, no messages, filter no-results
- **Loading states**: Skeleton loaders for conversation list

---

### Key Architecture Decisions
- Page queries `ghl_conversations` directly via Supabase client (no edge function needed for reads)
- Dual notification paths: DB trigger + webhook handler for reliability
- Email replies route through `send-email-reply` (Email Copilot) with signature support
- Real-time subscriptions on both tables for instant UI updates
