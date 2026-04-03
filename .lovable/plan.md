
## Conversations Hub & Notification System — Implementation Plan

### Phase 1: Database & Permissions Setup
- **Add `conversation_reply` notification type** to the `notifications_type_check` constraint
- **Create a DB trigger** on `ghl_conversation_messages` — when an **inbound** message is inserted, auto-create a notification with the sender name, channel type, and message preview (linked to the conversation's `client_id`)
- **Register `conversations` module** in `dashboard_modules` so it can be permission-controlled for sub-admins
- **Add `ghl_conversations` to the `supabase_realtime` publication** for live updates on the page

### Phase 2: Standalone Conversations Page
- **Create `/conversations` route** with `ModuleGuard` wrapping
- **Build a full-page Conversations Hub** (`src/pages/Conversations.tsx`) featuring:
  - **Left panel**: All conversations across all clients, sorted by most recent, searchable/filterable by channel (SMS, Email, WhatsApp) and client name
  - **Right panel**: Selected conversation thread with the same chat UI as the client modal (messages, date separators, attachments)
  - **Client context bar**: Shows which client the conversation belongs to, with a quick link to open their full profile
  - **Reply composer**: Same multi-channel composer (SMS/Email/WhatsApp) with mailbox selector for email (routing through Email Copilot as just implemented)
  - **Unread indicators**: Badge counts on conversations, auto-cleared when opened
  - **Sync button**: Manual sync option per conversation
- **Add sidebar navigation item** for "Conversations" with the `MessageSquare` icon

### Phase 3: Real-Time Notifications
- **Update `ghl-webhook-receiver`** to insert a notification row when an inbound message arrives (in addition to the DB trigger as a fallback)
- **Frontend notification handling**: The existing notification system (realtime subscription on `notifications` table) will automatically pick up `conversation_reply` events — toast will show sender + preview
- **Deep-link from notification**: Clicking a conversation notification navigates to `/conversations` with the relevant conversation pre-selected (via query param or state)

### Phase 4: Polish & Edge Cases
- **Mark as read**: When a conversation is opened on the Conversations page, reset its `unread_count` to 0
- **Responsive layout**: On mobile (your current 424px viewport), stack panels vertically (list → thread view, same as the modal pattern)
- **Empty states**: No conversations, no messages, no client linked
- **Loading states**: Skeleton loaders for conversation list and messages

---

### Key Architecture Decisions
- The page queries `ghl_conversations` directly via `get-client-data` (with a new "all conversations" mode that doesn't require a `client_id` filter) or a lightweight dedicated edge function
- Notifications use the existing `notifications` table + realtime subscription pattern — no new infrastructure needed
- Email replies continue routing through `send-email-reply` (Email Copilot) as just configured
