import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createCorsHeaders, verifyAuth, createUnauthorizedResponse } from "../_shared/auth.ts";
import { logApiUsage, estimateCost, extractOpenAIUsage } from "../_shared/logApiUsage.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')!;

// ============================================================
//  TOOL DEFINITIONS — 71 tools across 12 domains
// ============================================================

const TOOLS: any[] = [
  // ─── CLIENT MANAGEMENT ───
  {
    type: "function",
    function: {
      name: "search_clients",
      description: "Search for clients by name, email, or phone number. Returns matching client profiles with key details.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search term (name, email, or phone)" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_details",
      description: "Fetch full client profile: personal info, address, DOB, residential status, living situation, referral source, pipeline status.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_additional_contacts",
      description: "Retrieve co-borrowers/partners linked to a client including name, DOB, email, relationship, employment details.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_field",
      description: "Update individual client fields (email, phone, address, pipeline status, notes). REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          field: { type: "string", description: "Field name to update (e.g. primary_email, primary_mobile, pipeline_status, pipeline_notes, current_address)" },
          value: { type: "string", description: "New value for the field" },
        },
        required: ["client_id", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_activities",
      description: "Fetch activity timeline for a client (notes, status changes, calls, emails logged).",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" }, limit: { type: "number", description: "Max items (default 20)" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "log_client_activity",
      description: "Add a manual activity/note entry to a client's timeline. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          title: { type: "string", description: "Title of the activity" },
          description: { type: "string", description: "Description/notes" },
          activity_type: { type: "string", description: "Type: note, call, email, meeting, status_change" },
        },
        required: ["client_id", "title", "activity_type"],
      },
    },
  },

  // ─── DEALS & PIPELINE ───
  {
    type: "function",
    function: {
      name: "get_client_deals",
      description: "Get deal/pipeline information for a specific client including stages, risk status, key dates, and build progress.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_overview",
      description: "Get aggregated overview of all deals: by stage, at-risk counts, upcoming settlements, total pipeline value, commission forecast.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals_by_stage",
      description: "Filter deals by a specific stage name. Returns all deals currently at that stage with client names.",
      parameters: { type: "object", properties: { stage: { type: "string", description: "Stage name to filter by" } }, required: ["stage"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deals_by_risk",
      description: "Filter deals by risk status: on_track, needs_follow_up, or urgent.",
      parameters: { type: "object", properties: { risk_status: { type: "string", enum: ["on_track", "needs_follow_up", "urgent"], description: "Risk status to filter" } }, required: ["risk_status"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_settlement_countdown",
      description: "List deals settling within N days, with client name, address, loan amount, and days remaining.",
      parameters: { type: "object", properties: { days: { type: "number", description: "Number of days to look ahead (default 30)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_stale_deals",
      description: "Find deals with no stage movement in more than N days (default 14). Identifies potential bottlenecks.",
      parameters: { type: "object", properties: { days_threshold: { type: "number", description: "Days without movement (default 14)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_stage",
      description: "Move a deal to a new stage or update its stage number. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID of the deal" },
          new_stage: { type: "string", description: "New stage name" },
          new_stage_number: { type: "number", description: "New stage number" },
        },
        required: ["deal_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_risk_status",
      description: "Change a deal's risk status (on_track, needs_follow_up, urgent). REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID of the deal" },
          risk_status: { type: "string", enum: ["on_track", "needs_follow_up", "urgent"], description: "New risk status" },
        },
        required: ["deal_id", "risk_status"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_deal_field",
      description: "Update a deal field such as responsible_person, notes, settlement_date, property_address, loan_amount, etc. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          deal_id: { type: "string", description: "UUID of the deal" },
          field: { type: "string", description: "Field name to update" },
          value: { type: "string", description: "New value" },
        },
        required: ["deal_id", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clawback_monitor",
      description: "List all deals with active clawback risk: expiry dates, months remaining, commission at stake.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commission_forecast",
      description: "Calculate projected commission by month (next 6 months) based on deal settlement dates and commission estimates.",
      parameters: { type: "object", properties: { months_ahead: { type: "number", description: "Months to forecast (default 6)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_build_progress",
      description: "For House & Land deals: fetch build progress payment stages, invoice status, funds released, paid-to-builder flags.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "UUID of the deal" } }, required: ["deal_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "update_build_payment",
      description: "Toggle build payment checkboxes: builder_invoice_received, submitted_to_lender, funds_released, paid_to_builder. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          payment_id: { type: "string", description: "UUID of the build progress payment" },
          field: { type: "string", enum: ["builder_invoice_received", "submitted_to_lender", "funds_released", "paid_to_builder"], description: "Field to toggle" },
          value: { type: "boolean", description: "New boolean value" },
        },
        required: ["payment_id", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_builder_invoices",
      description: "List all builder invoices across deals with amounts, dates, and payment status.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "Optional deal_id to filter" } } },
    },
  },

  // ─── REMINDERS & FOLLOW-UPS ───
  {
    type: "function",
    function: {
      name: "get_client_reminders",
      description: "Get active reminders for a specific client, or all overdue reminders if no client specified.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client (optional)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_all_reminders",
      description: "Fetch all pending reminders across all clients, grouped by overdue, today, and upcoming.",
      parameters: { type: "object", properties: { include_milestones: { type: "boolean", description: "Include deal milestones (default true)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_overdue_reminders",
      description: "Specifically fetch reminders past their due date that are still pending.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_reminder",
      description: "Create a new client reminder with title, description, due_date, priority, and type. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          title: { type: "string", description: "Title of the reminder" },
          description: { type: "string", description: "Description" },
          due_date: { type: "string", description: "Due date in ISO format" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority level" },
          reminder_type: { type: "string", description: "Type: task, follow_up, call, meeting, document, general" },
        },
        required: ["client_id", "title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_reminder",
      description: "Mark a reminder as completed or snooze it. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          reminder_id: { type: "string", description: "UUID of the reminder" },
          action: { type: "string", enum: ["complete", "snooze", "dismiss"], description: "Action to take" },
          snooze_days: { type: "number", description: "Days to snooze (default 1)" },
        },
        required: ["reminder_id", "action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_reminder",
      description: "Remove a client reminder permanently. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { reminder_id: { type: "string", description: "UUID of the reminder" } }, required: ["reminder_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "set_follow_up_date",
      description: "Set or update the follow_up_date on a client record (triggers the amber bell icon). REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          follow_up_date: { type: "string", description: "Follow-up date in ISO format" },
        },
        required: ["client_id", "follow_up_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_upcoming_milestones",
      description: "List deal milestones (settlement, finance expiry, land settlement, build start, completion, clawback) within a date range.",
      parameters: { type: "object", properties: { days_ahead: { type: "number", description: "Days to look ahead (default 30)" } } },
    },
  },

  // ─── FINANCIAL DATA ───
  {
    type: "function",
    function: {
      name: "get_borrowing_capacity",
      description: "Get the latest borrowing capacity assessment for a client: capacity, band, DTI, surplus, stress-tested.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_borrowing_capacity_history",
      description: "Fetch up to 10 historical borrowing capacity assessments for trend analysis.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_income_sources",
      description: "List all income sources for a client: salary, rental, dividends, etc with amounts and frequencies.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_expenses",
      description: "List categorized monthly expenses for a client: essential vs discretionary, by category.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_liabilities",
      description: "List all liabilities: credit cards, personal loans, car loans, HECS, with balances and repayments.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_assets",
      description: "List assets: savings, shares, superannuation, vehicles, with values and institutions.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_properties",
      description: "List owned/investment properties for a client with addresses, values, loan details, and rental income.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_employment_details",
      description: "Fetch employment records for a client and co-borrowers: employer, role, salary, start date, type.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },

  // ─── EMAIL & COMMUNICATIONS ───
  {
    type: "function",
    function: {
      name: "get_client_emails",
      description: "Get recent emails linked to a specific client (subject, sender, date, snippet).",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" }, limit: { type: "number", description: "Max emails (default 15)" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_emails",
      description: "Search across all synced emails by subject, sender, or body content.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search term" }, limit: { type: "number", description: "Max results (default 20)" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_email_thread",
      description: "Fetch full conversation thread by conversation_id with all messages in order.",
      parameters: { type: "object", properties: { conversation_id: { type: "string", description: "Email conversation ID" } }, required: ["conversation_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_unlinked_emails",
      description: "Find emails not yet linked to any client (for manual assignment).",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "link_email_to_client",
      description: "Manually assign an unlinked email to a specific client. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          email_id: { type: "string", description: "UUID of the email" },
          client_id: { type: "string", description: "UUID of the client" },
        },
        required: ["email_id", "client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description: "Send an email to a recipient via the connected Outlook mailbox. Supports replies to existing emails, CC/BCC, and HTML body content. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          to: { type: "string", description: "Recipient email address" },
          subject: { type: "string", description: "Email subject line" },
          body: { type: "string", description: "Email body content (plain text or HTML)" },
          cc: { type: "array", items: { type: "string" }, description: "CC recipients (optional)" },
          bcc: { type: "array", items: { type: "string" }, description: "BCC recipients (optional)" },
          original_email_id: { type: "string", description: "Microsoft Graph email ID to reply to (optional, for replies)" },
          mailbox_source: { type: "string", enum: ["admin", "personal"], description: "Which mailbox to send from (default: admin)" },
        },
        required: ["to", "subject", "body"],
      },
    },
  },

  // ─── CALENDAR & APPOINTMENTS ───
  {
    type: "function",
    function: {
      name: "get_upcoming_calendar",
      description: "Get upcoming appointments and meetings for the next N days.",
      parameters: { type: "object", properties: { days_ahead: { type: "number", description: "Days to look ahead (default 7, max 30)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_appointments_for_client",
      description: "Fetch all appointments linked to a specific client/contact by email.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },

  // ─── CALL LOGS & VOICE AI ───
  {
    type: "function",
    function: {
      name: "get_recent_calls",
      description: "Fetch recent VAPI call logs with duration, outcome, sentiment, agent name.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max calls (default 20)" }, agent_name: { type: "string", description: "Filter by agent name" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_call_details",
      description: "Fetch full call detail: transcript, summary, sentiment analysis, severity score.",
      parameters: { type: "object", properties: { call_id: { type: "string", description: "UUID of the call" } }, required: ["call_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_calls",
      description: "Search calls by keyword in transcript, agent name, or phone number.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search term" }, limit: { type: "number", description: "Max results (default 20)" } }, required: ["query"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_call_alerts",
      description: "Fetch triggered call alert history (positive and negative alerts).",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max alerts (default 20)" }, unread_only: { type: "boolean", description: "Only unread alerts" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_call_analytics",
      description: "Aggregate call stats: total calls, avg duration, success rate, sentiment distribution, by agent.",
      parameters: { type: "object", properties: { days_back: { type: "number", description: "Days to analyze (default 30)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_flagged_calls",
      description: "Find calls with high severity scores (≥4) or negative sentiment for review.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 10)" } } },
    },
  },

  // ─── REPORTS & DOCUMENTS ───
  {
    type: "function",
    function: {
      name: "get_client_files",
      description: "List all files/reports stored for a client (investment reports, portfolio reviews, BC PDFs, VowNet forms).",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_investment_reports",
      description: "Fetch investment report summaries for a client: property address, status, quality score, created date.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client (optional)" }, limit: { type: "number", description: "Max reports (default 10)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_report_details",
      description: "Fetch full report content including property specs, financial calculations, demographics data.",
      parameters: { type: "object", properties: { report_id: { type: "string", description: "UUID of the investment report" } }, required: ["report_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "search_reports_by_address",
      description: "Find investment reports by property address substring.",
      parameters: { type: "object", properties: { address: { type: "string", description: "Address search term" } }, required: ["address"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio_reviews",
      description: "List portfolio review/analysis reports for a client.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },

  // ─── CHECKLISTS & OPERATIONS ───
  {
    type: "function",
    function: {
      name: "get_checklist_templates",
      description: "List all checklist templates (Daily Ops, Discovery Call, SMSF Review, etc.).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_active_checklists",
      description: "Fetch in-progress checklist instances with completion percentage.",
      parameters: { type: "object", properties: { status: { type: "string", description: "Filter by status: active, completed, archived" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_checklist_items",
      description: "Fetch all items for a specific checklist instance with checked/unchecked status.",
      parameters: { type: "object", properties: { instance_id: { type: "string", description: "UUID of the checklist instance" } }, required: ["instance_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_checklist_item",
      description: "Mark a checklist item as completed or uncompleted. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          item_id: { type: "string", description: "UUID of the checklist item" },
          is_checked: { type: "boolean", description: "New checked state" },
        },
        required: ["item_id", "is_checked"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_checklist_instance",
      description: "Generate a new checklist instance from a template. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { template_id: { type: "string", description: "UUID of the template" } }, required: ["template_id"] },
    },
  },

  // ─── ANALYTICS & SYSTEM ───
  {
    type: "function",
    function: {
      name: "get_recent_activity",
      description: "Fetch system-wide activity logs: who did what, when, to which entity.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max items (default 20, max 50)" }, entity_type: { type: "string", description: "Filter by entity type" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_api_usage_stats",
      description: "Fetch API usage metrics: total calls, tokens used, cost estimates, by service/model.",
      parameters: { type: "object", properties: { days_back: { type: "number", description: "Days to analyze (default 7)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_api_health",
      description: "Check health status of integrated services (Domain, ABS, VAPI, GHL, AI models).",
      parameters: { type: "object", properties: { days_back: { type: "number", description: "Days to analyze (default 7)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_cache_statistics",
      description: "Fetch cache hit rates and data freshness for census, crime, transport, economic data caches.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_dashboard_summary",
      description: "Composite morning briefing: total clients, active deals, pending reminders, upcoming settlements, overdue items. Use this for 'what's happening today' style queries.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── BRANDING & SETTINGS ───
  {
    type: "function",
    function: {
      name: "get_branding_profiles",
      description: "List client branding profiles (logos, colors, fonts) used for white-label PDF generation.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_user_permissions",
      description: "Check what modules/actions the current user has access to (admin vs sub-admin scoping).",
      parameters: { type: "object", properties: { user_id: { type: "string", description: "UUID of the user (defaults to current user)" } } },
    },
  },

  // ─── CALCULATORS ───
  {
    type: "function",
    function: {
      name: "calculate_stamp_duty",
      description: "Calculate stamp duty for a given state, property value, and buyer type.",
      parameters: {
        type: "object",
        properties: {
          state: { type: "string", enum: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"], description: "Australian state" },
          property_value: { type: "number", description: "Property value in dollars" },
          is_first_home_buyer: { type: "boolean", description: "First home buyer (default false)" },
          is_investment: { type: "boolean", description: "Investment property (default false)" },
        },
        required: ["state", "property_value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_lmi",
      description: "Estimate Lenders Mortgage Insurance based on LVR, property value, and loan amount.",
      parameters: {
        type: "object",
        properties: {
          property_value: { type: "number", description: "Property value" },
          loan_amount: { type: "number", description: "Loan amount" },
          is_first_home_buyer: { type: "boolean", description: "First home buyer" },
        },
        required: ["property_value", "loan_amount"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_loan_repayment",
      description: "Compute P&I or IO repayments given loan amount, rate, and term.",
      parameters: {
        type: "object",
        properties: {
          loan_amount: { type: "number", description: "Loan amount" },
          interest_rate: { type: "number", description: "Annual interest rate %" },
          loan_term_years: { type: "number", description: "Loan term in years" },
          repayment_type: { type: "string", enum: ["pi", "io"], description: "Principal & Interest or Interest Only" },
        },
        required: ["loan_amount", "interest_rate", "loan_term_years"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_rental_yield",
      description: "Calculate gross and net rental yield from property value and weekly rent.",
      parameters: {
        type: "object",
        properties: {
          property_value: { type: "number", description: "Property value" },
          weekly_rent: { type: "number", description: "Weekly rental income" },
          annual_expenses: { type: "number", description: "Annual property expenses (optional)" },
        },
        required: ["property_value", "weekly_rent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_equity_position",
      description: "Compute available equity: property value × 80% − current loan balance.",
      parameters: {
        type: "object",
        properties: {
          property_value: { type: "number", description: "Current property value" },
          current_loan_balance: { type: "number", description: "Outstanding loan balance" },
          target_lvr: { type: "number", description: "Target LVR % (default 80)" },
        },
        required: ["property_value", "current_loan_balance"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════
  //  NEW TOOLS — Batch expansion (34 tools)
  // ═══════════════════════════════════════════════════════════

  // ─── CLIENT CREATION & LIFECYCLE ───
  {
    type: "function",
    function: {
      name: "create_client",
      description: "Create a new client record with basic info (name, email, phone). REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          first_name: { type: "string", description: "First name" },
          surname: { type: "string", description: "Surname" },
          email: { type: "string", description: "Primary email" },
          mobile: { type: "string", description: "Primary mobile" },
          pipeline_status: { type: "string", description: "Pipeline status (default: lead)" },
        },
        required: ["first_name", "surname"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client",
      description: "Permanently delete a client and all associated records. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients_by_pipeline_status",
      description: "Filter clients by pipeline status (lead, engaged, pre_approved, settled, etc.).",
      parameters: { type: "object", properties: { status: { type: "string", description: "Pipeline status value" }, limit: { type: "number", description: "Max results (default 30)" } }, required: ["status"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_clients_needing_follow_up",
      description: "Find clients with overdue follow-up dates or no recent activity in N days.",
      parameters: { type: "object", properties: { days_inactive: { type: "number", description: "Days without activity (default 14)" } } },
    },
  },

  // ─── CLIENT NOTES CRUD ───
  {
    type: "function",
    function: {
      name: "get_client_notes",
      description: "Fetch all notes for a client (distinct from activity log).",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" }, limit: { type: "number", description: "Max notes (default 20)" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_client_note",
      description: "Add a note to a client record. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          content: { type: "string", description: "Note content" },
          note_type: { type: "string", description: "Type: general, call, meeting, strategy (default: general)" },
        },
        required: ["client_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_client_note",
      description: "Edit an existing client note. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          note_id: { type: "string", description: "UUID of the note" },
          content: { type: "string", description: "Updated content" },
        },
        required: ["note_id", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_client_note",
      description: "Remove a client note. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { note_id: { type: "string", description: "UUID of the note" } }, required: ["note_id"] },
    },
  },

  // ─── CLIENT SCORES & REVIEWS ───
  {
    type: "function",
    function: {
      name: "get_client_score",
      description: "Fetch client scoring/readiness data: overall score, risk level, cash flow, growth potential, portfolio health.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio_review_details",
      description: "Fetch full content of a specific portfolio review/analysis report.",
      parameters: { type: "object", properties: { review_id: { type: "string", description: "UUID of the portfolio review" } }, required: ["review_id"] },
    },
  },

  // ─── DEAL CREATION & DELETION ───
  {
    type: "function",
    function: {
      name: "create_deal",
      description: "Create a new deal for a client (existing_property, house_and_land, or refinance). REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          deal_type: { type: "string", enum: ["existing_property", "house_and_land", "refinance"], description: "Type of deal" },
          property_address: { type: "string", description: "Property address (optional)" },
          loan_amount: { type: "number", description: "Loan amount (optional)" },
        },
        required: ["client_id", "deal_type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_deal",
      description: "Remove a deal and its associated stages/payments. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "UUID of the deal" } }, required: ["deal_id"] },
    },
  },

  // ─── PIPELINE ANALYTICS ───
  {
    type: "function",
    function: {
      name: "get_conversion_funnel",
      description: "Get stage-to-stage conversion rates across deals for pipeline analytics.",
      parameters: { type: "object", properties: { deal_type: { type: "string", description: "Filter by deal type (optional)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_pipeline_velocity",
      description: "Calculate average days per stage and identify bottleneck stages.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commission_actuals",
      description: "Get actual received commissions from build payments vs forecasted amounts.",
      parameters: { type: "object", properties: { months_back: { type: "number", description: "Months to look back (default 6)" } } },
    },
  },

  // ─── ADDITIONAL CONTACTS MANAGEMENT ───
  {
    type: "function",
    function: {
      name: "add_additional_contact",
      description: "Add a co-borrower/partner to a client. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          first_name: { type: "string", description: "First name" },
          surname: { type: "string", description: "Surname" },
          relationship: { type: "string", description: "Relationship: spouse, partner, co_borrower, guarantor" },
          email: { type: "string", description: "Email (optional)" },
          mobile: { type: "string", description: "Mobile (optional)" },
          dob: { type: "string", description: "Date of birth ISO format (optional)" },
        },
        required: ["client_id", "first_name", "surname"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_additional_contact",
      description: "Update a co-borrower/partner's details. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID of the additional contact" },
          field: { type: "string", description: "Field to update (first_name, surname, email, mobile, dob, relationship)" },
          value: { type: "string", description: "New value" },
        },
        required: ["contact_id", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_additional_contact",
      description: "Remove a co-borrower/partner from a client. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { contact_id: { type: "string", description: "UUID of the additional contact" } }, required: ["contact_id"] },
    },
  },

  // ─── CASH FLOW ANALYSIS ───
  {
    type: "function",
    function: {
      name: "get_cash_flow_analysis",
      description: "Fetch stored 10-year cash flow analyses for a report, including comparison data.",
      parameters: { type: "object", properties: { report_id: { type: "string", description: "UUID of the investment report (optional)" }, limit: { type: "number", description: "Max results (default 5)" } } },
    },
  },

  // ─── AUTOMATION & AUTO-REPORTS ───
  {
    type: "function",
    function: {
      name: "get_auto_report_switches",
      description: "List automation rules/switches for auto-report generation with enabled state and criteria.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_auto_report_switch",
      description: "Enable or disable an automation switch. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          switch_id: { type: "string", description: "UUID of the switch" },
          is_enabled: { type: "boolean", description: "Enable (true) or disable (false)" },
        },
        required: ["switch_id", "is_enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_auto_report_log",
      description: "Fetch recent auto-report generation results with status and errors.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max results (default 20)" } } },
    },
  },

  // ─── CHECKLIST TEMPLATE MANAGEMENT ───
  {
    type: "function",
    function: {
      name: "delete_checklist_instance",
      description: "Archive or delete a checklist instance. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          instance_id: { type: "string", description: "UUID of the checklist instance" },
          action: { type: "string", enum: ["archive", "delete"], description: "Archive or permanently delete" },
        },
        required: ["instance_id"],
      },
    },
  },

  // ─── CALENDAR ENHANCEMENTS ───
  {
    type: "function",
    function: {
      name: "get_todays_schedule",
      description: "Get today's full agenda: appointments, reminders due today, deal milestones.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── CLIENT FILE MANAGEMENT ───
  {
    type: "function",
    function: {
      name: "delete_client_file",
      description: "Remove a file record from a client. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { file_id: { type: "string", description: "UUID of the file record" } }, required: ["file_id"] },
    },
  },

  // ─── BULK OPERATIONS ───
  {
    type: "function",
    function: {
      name: "get_bulk_generation_status",
      description: "Check status of bulk report generation jobs: completed, failed, in-progress.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Max jobs (default 5)" } } },
    },
  },

  // ─── LENDING RATES ───
  {
    type: "function",
    function: {
      name: "get_lending_rates",
      description: "Fetch cached bank lending rates for comparison across lenders.",
      parameters: { type: "object", properties: { lender_name: { type: "string", description: "Filter by lender name (optional)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_lender_rates",
      description: "Compare rates across multiple lenders side by side.",
      parameters: { type: "object", properties: { loan_amount: { type: "number", description: "Loan amount for comparison" }, loan_type: { type: "string", description: "Filter by loan type (optional)" } } },
    },
  },

  // ─── COLLABORATION & SHARING ───
  {
    type: "function",
    function: {
      name: "share_conversation",
      description: "Share the current conversation with another team member. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          target_user_name: { type: "string", description: "Name or email of user to share with" },
          permission: { type: "string", enum: ["view", "collaborate", "admin"], description: "Permission level (default: view)" },
          handoff_note: { type: "string", description: "Optional note for the recipient about what this conversation covers" },
          handoff_type: { type: "string", enum: ["transfer", "collaborate", "escalate", "return"], description: "Type of handoff (default: collaborate)" },
        },
        required: ["target_user_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_shared_conversations",
      description: "List conversations shared with the current user by other team members.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_conversation_collaborators",
      description: "See who has access to the current conversation and their permission levels.",
      parameters: { type: "object", properties: { conversation_id: { type: "string", description: "Conversation UUID" } }, required: ["conversation_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "revoke_conversation_share",
      description: "Remove a user's access to a shared conversation. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          conversation_id: { type: "string", description: "Conversation UUID" },
          user_id: { type: "string", description: "UUID of user to remove" },
        },
        required: ["conversation_id", "user_id"],
      },
    },
  },

  // ─── USER PREFERENCES / MEMORY ───
  {
    type: "function",
    function: {
      name: "get_user_preferences",
      description: "Retrieve stored user preferences (preferred mailbox, default report format, favourite clients, etc.).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_user_preference",
      description: "Store a user preference for future sessions. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Preference key (e.g. preferred_mailbox, default_report_format, favorite_clients)" },
          value: { type: "string", description: "Preference value (JSON string for complex values)" },
        },
        required: ["key", "value"],
      },
    },
  },

  // ─── AUDIT TRAIL ───
  {
    type: "function",
    function: {
      name: "get_audit_trail",
      description: "View the audit trail of all agent actions performed by the current user or for a specific client.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "Filter by client UUID (optional)" },
          limit: { type: "number", description: "Max records (default 20)" },
          tool_name: { type: "string", description: "Filter by specific tool name (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "undo_action",
      description: "Undo/rollback a previously executed agent action using its audit log ID. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          action_id: { type: "string", description: "UUID of the action from the audit trail" },
        },
        required: ["action_id"],
      },
    },
  },

  // ─── PROACTIVE INSIGHTS (Batch 2) ───
  {
    type: "function",
    function: {
      name: "get_proactive_insights",
      description: "Scan the entire system for anomalies, risks, and opportunities. Detects: stalling deals, overdue follow-ups, clawback risks within 90 days, finance expiry, disengaged clients, upcoming settlements, urgent deals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_clients",
      description: "Side-by-side comparison of 2-4 clients across financial metrics, deal status, pipeline position, borrowing capacity, and engagement level.",
      parameters: {
        type: "object",
        properties: {
          client_ids: { type: "array", items: { type: "string" }, description: "Array of 2-4 client UUIDs to compare" },
        },
        required: ["client_ids"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_follow_up",
      description: "Generate a context-aware follow-up email draft for a client based on their activity, deal status, and history. Returns a pre-composed email ready for review.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          follow_up_type: { type: "string", enum: ["general_check_in", "deal_update", "document_request", "settlement_prep", "post_settlement", "stale_reengagement"], description: "Type of follow-up" },
          custom_context: { type: "string", description: "Additional context (optional)" },
        },
        required: ["client_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_system_health_check",
      description: "Comprehensive system health scan: database record counts, API success rates, cache freshness, stale data detection, and overall platform health score.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── DEAL STAGE COMPLETION ───
  {
    type: "function",
    function: {
      name: "complete_deal_stage",
      description: "Mark a specific deal stage as complete and optionally advance to the next stage. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          stage_id: { type: "string", description: "UUID of the deal stage" },
          advance_deal: { type: "boolean", description: "Also advance the deal's current_stage (default true)" },
        },
        required: ["stage_id"],
      },
    },
  },

  // ─── EMAIL STATS ───
  {
    type: "function",
    function: {
      name: "get_email_stats",
      description: "Get email statistics: total synced, unread count, unlinked count, by mailbox source.",
      parameters: { type: "object", properties: {} },
    },
  },
];

// ============================================================
//  WRITE TOOLS — require user confirmation
// ============================================================

const WRITE_TOOLS = [
  'update_client_field', 'log_client_activity',
  'update_deal_stage', 'update_deal_risk_status', 'update_deal_field', 'update_build_payment',
  'create_reminder', 'update_reminder', 'delete_reminder', 'set_follow_up_date',
  'link_email_to_client', 'send_email',
  'toggle_checklist_item', 'create_checklist_instance',
  'create_client', 'delete_client',
  'create_client_note', 'update_client_note', 'delete_client_note',
  'create_deal', 'delete_deal',
  'add_additional_contact', 'update_additional_contact', 'remove_additional_contact',
  'toggle_auto_report_switch',
  'delete_checklist_instance',
  'delete_client_file',
  'complete_deal_stage',
  'share_conversation', 'revoke_conversation_share',
  'set_user_preference', 'undo_action',
];

// ============================================================
//  TOOL EXECUTORS
// ============================================================

// ─── PROACTIVE INSIGHTS (Batch 2) ───

async function executeGetProactiveInsights(sb: any) {
  const now = new Date();
  const insights: { category: string; severity: 'critical' | 'warning' | 'info' | 'opportunity'; title: string; detail: string; action_suggestion: string; affected_ids?: string[] }[] = [];

  // 1. Stale deals (no movement in 14+ days)
  const staleCutoff = new Date(now.getTime() - 14 * 86400000).toISOString();
  const { data: staleDeals } = await sb.from('client_deals')
    .select('id, property_address, current_stage, updated_at, client_id, clients:client_id(primary_first_name, primary_surname)')
    .lt('updated_at', staleCutoff).limit(10);
  if (staleDeals?.length) {
    insights.push({
      category: '🐌 Stalling Deals', severity: 'warning',
      title: `${staleDeals.length} deal(s) with no movement in 14+ days`,
      detail: staleDeals.map((d: any) => `• ${d.clients?.primary_first_name || ''} ${d.clients?.primary_surname || ''} — "${d.current_stage}" (${Math.floor((now.getTime() - new Date(d.updated_at).getTime()) / 86400000)}d stale)`).join('\n'),
      action_suggestion: 'Review these deals and update their stages or add notes.',
      affected_ids: staleDeals.map((d: any) => d.id),
    });
  }

  // 2. Overdue reminders
  const { data: overdueReminders } = await sb.from('client_reminders')
    .select('id, title, due_date, priority, client_id')
    .eq('status', 'pending').lt('due_date', now.toISOString()).limit(10);
  if (overdueReminders?.length) {
    const urgent = overdueReminders.filter((r: any) => r.priority === 'urgent' || r.priority === 'high');
    insights.push({
      category: '⏰ Overdue Reminders', severity: urgent.length > 0 ? 'critical' : 'warning',
      title: `${overdueReminders.length} overdue reminder(s) (${urgent.length} high-priority)`,
      detail: overdueReminders.slice(0, 5).map((r: any) => `• "${r.title}" — due ${r.due_date?.substring(0, 10)} (${r.priority})`).join('\n'),
      action_suggestion: 'Complete, snooze, or dismiss these reminders.',
    });
  }

  // 3. Clawback risk within 90 days
  const clawbackWindow = new Date(now.getTime() + 90 * 86400000).toISOString();
  const { data: clawbackDeals } = await sb.from('client_deals')
    .select('id, property_address, clawback_expiry_date, commission_estimate, clients:client_id(primary_first_name, primary_surname)')
    .not('clawback_expiry_date', 'is', null)
    .gte('clawback_expiry_date', now.toISOString()).lte('clawback_expiry_date', clawbackWindow).limit(10);
  if (clawbackDeals?.length) {
    const totalAtRisk = clawbackDeals.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
    insights.push({
      category: '⚠️ Clawback Risk', severity: 'critical',
      title: `${clawbackDeals.length} deal(s) with clawback expiring within 90 days ($${totalAtRisk.toLocaleString()} at risk)`,
      detail: clawbackDeals.map((d: any) => {
        const days = Math.ceil((new Date(d.clawback_expiry_date).getTime() - now.getTime()) / 86400000);
        return `• ${d.clients?.primary_first_name || ''} ${d.clients?.primary_surname || ''} — ${days} days remaining ($${(d.commission_estimate || 0).toLocaleString()})`;
      }).join('\n'),
      action_suggestion: 'Monitor these clients closely and ensure loan retention.',
    });
  }

  // 4. Finance clause expiring within 7 days
  const financeWindow = new Date(now.getTime() + 7 * 86400000).toISOString();
  const { data: financeExpiring } = await sb.from('client_deals')
    .select('id, property_address, finance_clause_expiry, clients:client_id(primary_first_name, primary_surname)')
    .not('finance_clause_expiry', 'is', null)
    .gte('finance_clause_expiry', now.toISOString()).lte('finance_clause_expiry', financeWindow).limit(10);
  if (financeExpiring?.length) {
    insights.push({
      category: '🔥 Finance Clause Expiry', severity: 'critical',
      title: `${financeExpiring.length} deal(s) with finance expiring within 7 days`,
      detail: financeExpiring.map((d: any) => `• ${d.clients?.primary_first_name || ''} ${d.clients?.primary_surname || ''} — expires ${d.finance_clause_expiry?.substring(0, 10)}`).join('\n'),
      action_suggestion: 'Urgently follow up on approvals and lender timelines.',
    });
  }

  // 5. Clients with no activity in 30+ days (disengaged)
  const inactiveCutoff = new Date(now.getTime() - 30 * 86400000).toISOString();
  const { data: inactiveClients } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, pipeline_status, updated_at')
    .lt('updated_at', inactiveCutoff)
    .in('pipeline_status', ['lead', 'engaged', 'pre_approved'])
    .limit(10);
  if (inactiveClients?.length) {
    insights.push({
      category: '👻 Disengaged Clients', severity: 'info',
      title: `${inactiveClients.length} active client(s) with no activity in 30+ days`,
      detail: inactiveClients.slice(0, 5).map((c: any) => `• ${c.primary_first_name || ''} ${c.primary_surname || ''} — ${c.pipeline_status} (last active ${c.updated_at?.substring(0, 10)})`).join('\n'),
      action_suggestion: 'Consider a re-engagement follow-up or pipeline status review.',
    });
  }

  // 6. Upcoming settlements this week (opportunity)
  const weekEnd = new Date(now.getTime() + 7 * 86400000).toISOString();
  const { data: upcomingSettlements } = await sb.from('client_deals')
    .select('id, property_address, settlement_date, loan_amount, clients:client_id(primary_first_name, primary_surname)')
    .gte('settlement_date', now.toISOString()).lte('settlement_date', weekEnd);
  if (upcomingSettlements?.length) {
    insights.push({
      category: '🏠 Upcoming Settlements', severity: 'opportunity',
      title: `${upcomingSettlements.length} settlement(s) this week`,
      detail: upcomingSettlements.map((d: any) => `• ${d.clients?.primary_first_name || ''} ${d.clients?.primary_surname || ''} — ${d.settlement_date?.substring(0, 10)} ($${(d.loan_amount || 0).toLocaleString()})`).join('\n'),
      action_suggestion: 'Ensure all settlement documents are ready and clients are informed.',
    });
  }

  // 7. At-risk deals
  const { data: urgentDeals } = await sb.from('client_deals')
    .select('id, property_address, risk_status, current_stage, clients:client_id(primary_first_name, primary_surname)')
    .eq('risk_status', 'urgent').limit(10);
  if (urgentDeals?.length) {
    insights.push({
      category: '🚨 Urgent Risk Deals', severity: 'critical',
      title: `${urgentDeals.length} deal(s) flagged as urgent risk`,
      detail: urgentDeals.map((d: any) => `• ${d.clients?.primary_first_name || ''} ${d.clients?.primary_surname || ''} — "${d.current_stage}"`).join('\n'),
      action_suggestion: 'Prioritize these deals for immediate attention.',
    });
  }

  if (!insights.length) {
    return { message: '🎉 No significant issues detected. Your pipeline looks healthy!', insights: [], health_score: 100 };
  }

  const critCount = insights.filter(i => i.severity === 'critical').length;
  const warnCount = insights.filter(i => i.severity === 'warning').length;
  const healthScore = Math.max(0, 100 - (critCount * 20) - (warnCount * 10));

  return {
    health_score: healthScore,
    total_insights: insights.length,
    critical: critCount, warnings: warnCount,
    insights: insights.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2, opportunity: 3 };
      return order[a.severity] - order[b.severity];
    }),
  };
}

// ─── COMPARATIVE CLIENT ANALYSIS (Batch 2) ───

async function executeCompareClients(sb: any, args: any) {
  const ids = args.client_ids;
  if (!ids || ids.length < 2 || ids.length > 4) return { error: 'Provide 2-4 client IDs for comparison.' };

  const comparisons: any[] = [];
  for (const id of ids) {
    const [clientRes, dealsRes, bcRes, remindersRes, activitiesRes] = await Promise.all([
      sb.from('clients').select('id, primary_first_name, primary_surname, primary_email, pipeline_status, follow_up_date, borrowing_capacity, created_at, updated_at').eq('id', id).single(),
      sb.from('client_deals').select('id, deal_type, current_stage, risk_status, loan_amount, commission_estimate, settlement_date').eq('client_id', id),
      sb.from('borrowing_capacity_assessments').select('borrowing_capacity, serviceability_band, monthly_surplus, dti_ratio, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(1),
      sb.from('client_reminders').select('id').eq('client_id', id).eq('status', 'pending'),
      sb.from('client_activities').select('id, created_at').eq('client_id', id).order('created_at', { ascending: false }).limit(1),
    ]);

    const client = clientRes.data;
    if (!client) { comparisons.push({ id, error: 'Client not found' }); continue; }

    const deals = dealsRes.data || [];
    const bc = bcRes.data?.[0];
    const lastActivity = activitiesRes.data?.[0];
    const daysSinceActivity = lastActivity ? Math.floor((Date.now() - new Date(lastActivity.created_at).getTime()) / 86400000) : null;

    comparisons.push({
      id: client.id,
      name: `${client.primary_first_name || ''} ${client.primary_surname || ''}`.trim(),
      pipeline_status: client.pipeline_status,
      total_deals: deals.length,
      active_deals: deals.filter((d: any) => !['settled', 'cancelled'].includes(d.current_stage?.toLowerCase())).length,
      total_loan_value: deals.reduce((s: number, d: any) => s + (d.loan_amount || 0), 0),
      total_commission: deals.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0),
      risk_deals: deals.filter((d: any) => ['urgent', 'needs_follow_up'].includes(d.risk_status)).length,
      borrowing_capacity: bc?.borrowing_capacity || client.borrowing_capacity || null,
      serviceability_band: bc?.serviceability_band || null,
      monthly_surplus: bc?.monthly_surplus || null,
      dti_ratio: bc?.dti_ratio || null,
      pending_reminders: remindersRes.data?.length || 0,
      days_since_last_activity: daysSinceActivity,
      engagement_level: daysSinceActivity === null ? 'unknown' : daysSinceActivity <= 7 ? 'high' : daysSinceActivity <= 30 ? 'medium' : 'low',
      follow_up_date: client.follow_up_date,
      member_since: client.created_at?.substring(0, 10),
    });
  }

  return { clients: comparisons, compared_at: new Date().toISOString() };
}

// ─── SMART FOLLOW-UP DRAFTING (Batch 2) ───

async function executeDraftFollowUp(sb: any, args: any, userId: string) {
  // Gather client context
  const { data: client } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, primary_email, pipeline_status, follow_up_date')
    .eq('id', args.client_id).single();
  if (!client) return { error: 'Client not found.' };

  const clientName = `${client.primary_first_name || ''} ${client.primary_surname || ''}`.trim();

  // Get recent deals
  const { data: deals } = await sb.from('client_deals')
    .select('deal_type, current_stage, risk_status, property_address, settlement_date, loan_amount')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(3);

  // Get recent activities  
  const { data: activities } = await sb.from('client_activities')
    .select('title, activity_type, created_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(5);

  // Get recent emails
  const { data: emails } = await sb.from('email_copilot_emails')
    .select('subject, received_at, sender')
    .eq('client_id', args.client_id).order('received_at', { ascending: false }).limit(3);

  const type = args.follow_up_type || 'general_check_in';
  
  const templates: Record<string, { subject: string; body: string }> = {
    general_check_in: {
      subject: `Checking In — ${clientName}`,
      body: `Hi ${client.primary_first_name},\n\nI hope you're doing well. I wanted to touch base and see how things are progressing on your end.\n\n${deals?.length ? `I can see we have ${deals.length} active deal(s) in progress. Your current stage is "${deals[0]?.current_stage}".` : 'I wanted to discuss any potential property investment opportunities.'}\n\nPlease let me know if there's anything you need from our side, or if you'd like to schedule a quick catch-up.\n\nKind regards`,
    },
    deal_update: {
      subject: `Deal Update — ${deals?.[0]?.property_address || clientName}`,
      body: `Hi ${client.primary_first_name},\n\nI wanted to provide you with an update on your ${deals?.[0]?.deal_type?.replace(/_/g, ' ') || 'property'} deal.\n\n**Current Status:** ${deals?.[0]?.current_stage || 'In Progress'}\n${deals?.[0]?.settlement_date ? `**Settlement Date:** ${deals[0].settlement_date.substring(0, 10)}` : ''}\n${deals?.[0]?.loan_amount ? `**Loan Amount:** $${deals[0].loan_amount.toLocaleString()}` : ''}\n\nPlease don't hesitate to reach out if you have any questions.\n\nKind regards`,
    },
    document_request: {
      subject: `Documents Required — ${clientName}`,
      body: `Hi ${client.primary_first_name},\n\nI hope this email finds you well. To progress your application, we require the following documents:\n\n1. [Document 1]\n2. [Document 2]\n3. [Document 3]\n\nCould you please provide these at your earliest convenience? This will help us move forward without delay.\n\nThank you for your cooperation.\n\nKind regards`,
    },
    settlement_prep: {
      subject: `Settlement Preparation — ${deals?.[0]?.property_address || clientName}`,
      body: `Hi ${client.primary_first_name},\n\nExciting news — your settlement${deals?.[0]?.settlement_date ? ` on ${deals[0].settlement_date.substring(0, 10)}` : ''} is approaching!\n\nHere's a quick checklist to ensure everything goes smoothly:\n\n- [ ] Final inspection completed\n- [ ] Insurance arranged from settlement date\n- [ ] Utility connections set up\n- [ ] Settlement funds confirmed with lender\n\nPlease let me know if you have any questions.\n\nKind regards`,
    },
    post_settlement: {
      subject: `Congratulations on Your Settlement! — ${clientName}`,
      body: `Hi ${client.primary_first_name},\n\nCongratulations on your successful settlement! 🎉\n\nI wanted to follow up and make sure everything has gone smoothly with the transition.\n\nA few things to keep in mind:\n- Ensure your property insurance is active\n- Set up direct debits for your loan repayments\n- Keep records of any settlement-related expenses for tax time\n\nIt's been a pleasure working with you. If you or anyone you know is considering property investment in the future, I'd be happy to assist.\n\nWarm regards`,
    },
    stale_reengagement: {
      subject: `It's Been a While — ${clientName}`,
      body: `Hi ${client.primary_first_name},\n\nI noticed it's been a little while since we last connected, and I wanted to reach out to see how things are going.\n\n${client.borrowing_capacity ? `Based on your last assessment, your borrowing capacity was around $${Number(client.borrowing_capacity).toLocaleString()}.` : ''} The property market has had some interesting developments recently that might be worth discussing.\n\nWould you be open to a quick 15-minute catch-up call this week?\n\nLooking forward to hearing from you.\n\nKind regards`,
    },
  };

  const template = templates[type] || templates.general_check_in;

  // Add custom context if provided
  let body = template.body;
  if (args.custom_context) {
    body += `\n\n**Additional Note:** ${args.custom_context}`;
  }

  return {
    draft: {
      to: client.primary_email || '[no email on file]',
      subject: template.subject,
      body,
      follow_up_type: type,
    },
    client_context: {
      name: clientName,
      pipeline_status: client.pipeline_status,
      deals_count: deals?.length || 0,
      recent_activities: activities?.length || 0,
      recent_emails: emails?.length || 0,
      last_email: emails?.[0]?.received_at?.substring(0, 10) || 'N/A',
    },
    suggestion: `Draft generated. Review and use send_email to send, or ask me to modify the content.`,
  };
}

// ─── SYSTEM HEALTH CHECK (Batch 2) ───

async function executeRunSystemHealthCheck(sb: any) {
  const checks: { area: string; status: 'healthy' | 'warning' | 'critical'; metric: string; detail?: string }[] = [];

  // Record counts
  const [clients, deals, reminders, emails, reports] = await Promise.all([
    sb.from('clients').select('id', { count: 'exact', head: true }),
    sb.from('client_deals').select('id', { count: 'exact', head: true }),
    sb.from('client_reminders').select('id', { count: 'exact', head: true }),
    sb.from('email_copilot_emails').select('id', { count: 'exact', head: true }),
    sb.from('investment_reports').select('id', { count: 'exact', head: true }),
  ]);

  checks.push({ area: 'Database', status: 'healthy', metric: `Clients: ${clients.count || 0} | Deals: ${deals.count || 0} | Reminders: ${reminders.count || 0} | Emails: ${emails.count || 0} | Reports: ${reports.count || 0}` });

  // API health (last 24h)
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const { data: healthLogs } = await sb.from('api_health_log')
    .select('service_name, status').gte('created_at', since24h);
  if (healthLogs?.length) {
    const errors = healthLogs.filter((h: any) => h.status === 'error');
    const rate = Math.round(((healthLogs.length - errors.length) / healthLogs.length) * 100);
    checks.push({
      area: 'API Health (24h)',
      status: rate >= 95 ? 'healthy' : rate >= 80 ? 'warning' : 'critical',
      metric: `${rate}% success rate (${healthLogs.length} calls, ${errors.length} errors)`,
    });
  } else {
    checks.push({ area: 'API Health', status: 'healthy', metric: 'No API calls in last 24h' });
  }

  // Agent usage (last 24h)
  const { data: agentLogs } = await sb.from('api_usage_log')
    .select('tokens_used, cost_estimate_usd')
    .eq('service_name', 'lovable-ai-gateway')
    .gte('created_at', since24h);
  const totalTokens = (agentLogs || []).reduce((s: number, l: any) => s + (l.tokens_used || 0), 0);
  const totalCost = (agentLogs || []).reduce((s: number, l: any) => s + (l.cost_estimate_usd || 0), 0);
  checks.push({
    area: 'Agent Usage (24h)',
    status: totalTokens > 500000 ? 'warning' : 'healthy',
    metric: `${(agentLogs || []).length} interactions | ${totalTokens.toLocaleString()} tokens | ~$${totalCost.toFixed(4)}`,
  });

  // Pending/overdue items
  const { data: overdue } = await sb.from('client_reminders')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending').lt('due_date', new Date().toISOString());
  checks.push({
    area: 'Task Health',
    status: (overdue?.count || 0) > 10 ? 'warning' : 'healthy',
    metric: `${overdue?.count || 0} overdue reminders`,
  });

  const critCount = checks.filter(c => c.status === 'critical').length;
  const warnCount = checks.filter(c => c.status === 'warning').length;
  const overallScore = Math.max(0, 100 - (critCount * 25) - (warnCount * 10));

  return {
    overall_health: overallScore >= 80 ? '🟢 Healthy' : overallScore >= 50 ? '🟡 Needs Attention' : '🔴 Critical',
    health_score: overallScore,
    checks,
    timestamp: new Date().toISOString(),
  };
}

//  TOOL DISPATCHER
// ============================================================

async function executeTool(sb: any, name: string, args: any, userId: string): Promise<any> {
  switch (name) {
    // Client
    case 'search_clients': return executeSearchClients(sb, args);
    case 'get_client_details': return executeGetClientDetails(sb, args);
    case 'get_client_additional_contacts': return executeGetClientAdditionalContacts(sb, args);
    case 'update_client_field': return executeUpdateClientField(sb, args);
    case 'get_client_activities': return executeGetClientActivities(sb, args);
    case 'log_client_activity': return executeLogClientActivity(sb, args, userId);
    // Deals
    case 'get_client_deals': return executeGetClientDeals(sb, args);
    case 'get_pipeline_overview': return executeGetPipelineOverview(sb);
    case 'get_deals_by_stage': return executeGetDealsByStage(sb, args);
    case 'get_deals_by_risk': return executeGetDealsByRisk(sb, args);
    case 'get_settlement_countdown': return executeGetSettlementCountdown(sb, args);
    case 'get_stale_deals': return executeGetStaleDeals(sb, args);
    case 'update_deal_stage': return executeUpdateDealStage(sb, args);
    case 'update_deal_risk_status': return executeUpdateDealRiskStatus(sb, args);
    case 'update_deal_field': return executeUpdateDealField(sb, args);
    case 'get_clawback_monitor': return executeGetClawbackMonitor(sb);
    case 'get_commission_forecast': return executeGetCommissionForecast(sb, args);
    case 'get_build_progress': return executeGetBuildProgress(sb, args);
    case 'update_build_payment': return executeUpdateBuildPayment(sb, args);
    case 'get_builder_invoices': return executeGetBuilderInvoices(sb, args);
    // Reminders
    case 'get_client_reminders': return executeGetClientReminders(sb, args);
    case 'get_all_reminders': return executeGetAllReminders(sb, args);
    case 'get_overdue_reminders': return executeGetOverdueReminders(sb);
    case 'create_reminder': return executeCreateReminder(sb, args, userId);
    case 'update_reminder': return executeUpdateReminder(sb, args);
    case 'delete_reminder': return executeDeleteReminder(sb, args);
    case 'set_follow_up_date': return executeSetFollowUpDate(sb, args);
    case 'get_upcoming_milestones': return executeGetUpcomingMilestones(sb, args);
    // Financial
    case 'get_borrowing_capacity': return executeGetBorrowingCapacity(sb, args);
    case 'get_borrowing_capacity_history': return executeGetBCHistory(sb, args);
    case 'get_income_sources': return executeGetIncomeSources(sb, args);
    case 'get_client_expenses': return executeGetClientExpenses(sb, args);
    case 'get_client_liabilities': return executeGetClientLiabilities(sb, args);
    case 'get_client_assets': return executeGetClientAssets(sb, args);
    case 'get_client_properties': return executeGetClientProperties(sb, args);
    case 'get_employment_details': return executeGetEmploymentDetails(sb, args);
    // Email
    case 'get_client_emails': return executeGetClientEmails(sb, args);
    case 'search_emails': return executeSearchEmails(sb, args);
    case 'get_email_thread': return executeGetEmailThread(sb, args);
    case 'get_unlinked_emails': return executeGetUnlinkedEmails(sb, args);
    case 'link_email_to_client': return executeLinkEmailToClient(sb, args);
    case 'send_email': return executeSendEmail(sb, args);
    // Calendar
    case 'get_upcoming_calendar': return executeGetUpcomingCalendar(sb, args);
    case 'get_appointments_for_client': return executeGetAppointmentsForClient(sb, args);
    // Calls
    case 'get_recent_calls': return executeGetRecentCalls(sb, args);
    case 'get_call_details': return executeGetCallDetails(sb, args);
    case 'search_calls': return executeSearchCalls(sb, args);
    case 'get_call_alerts': return executeGetCallAlerts(sb, args);
    case 'get_call_analytics': return executeGetCallAnalytics(sb, args);
    case 'get_flagged_calls': return executeGetFlaggedCalls(sb, args);
    // Reports
    case 'get_client_files': return executeGetClientFiles(sb, args);
    case 'get_investment_reports': return executeGetInvestmentReports(sb, args);
    case 'get_report_details': return executeGetReportDetails(sb, args);
    case 'search_reports_by_address': return executeSearchReportsByAddress(sb, args);
    case 'get_portfolio_reviews': return executeGetPortfolioReviews(sb, args);
    // Checklists
    case 'get_checklist_templates': return executeGetChecklistTemplates(sb);
    case 'get_active_checklists': return executeGetActiveChecklists(sb, args);
    case 'get_checklist_items': return executeGetChecklistItems(sb, args);
    case 'toggle_checklist_item': return executeToggleChecklistItem(sb, args, userId);
    case 'create_checklist_instance': return executeCreateChecklistInstance(sb, args, userId);
    // Analytics
    case 'get_recent_activity': return executeGetRecentActivity(sb, args);
    case 'get_api_usage_stats': return executeGetApiUsageStats(sb, args);
    case 'get_api_health': return executeGetApiHealth(sb, args);
    case 'get_cache_statistics': return executeGetCacheStatistics(sb);
    case 'get_dashboard_summary': return executeGetDashboardSummary(sb);
    // Branding
    case 'get_branding_profiles': return executeGetBrandingProfiles(sb);
    case 'get_user_permissions': return executeGetUserPermissions(sb, args);
    // Calculators (pure compute)
    case 'calculate_stamp_duty': return executeCalculateStampDuty(args);
    case 'calculate_lmi': return executeCalculateLMI(args);
    case 'calculate_loan_repayment': return executeCalculateLoanRepayment(args);
    case 'calculate_rental_yield': return executeCalculateRentalYield(args);
    case 'calculate_equity_position': return executeCalculateEquityPosition(args);

    // New tools — Client lifecycle
    case 'create_client': return executeCreateClient(sb, args, userId);
    case 'delete_client': return executeDeleteClient(sb, args);
    case 'get_clients_by_pipeline_status': return executeGetClientsByPipelineStatus(sb, args);
    case 'get_clients_needing_follow_up': return executeGetClientsNeedingFollowUp(sb, args);
    // New tools — Client notes
    case 'get_client_notes': return executeGetClientNotes(sb, args);
    case 'create_client_note': return executeCreateClientNote(sb, args, userId);
    case 'update_client_note': return executeUpdateClientNote(sb, args);
    case 'delete_client_note': return executeDeleteClientNote(sb, args);
    // New tools — Client scores & reviews
    case 'get_client_score': return executeGetClientScore(sb, args);
    case 'get_portfolio_review_details': return executeGetPortfolioReviewDetails(sb, args);
    // New tools — Deals
    case 'create_deal': return executeCreateDeal(sb, args, userId);
    case 'delete_deal': return executeDeleteDeal(sb, args);
    // New tools — Pipeline analytics
    case 'get_conversion_funnel': return executeGetConversionFunnel(sb, args);
    case 'get_pipeline_velocity': return executeGetPipelineVelocity(sb);
    case 'get_commission_actuals': return executeGetCommissionActuals(sb, args);
    // New tools — Additional contacts
    case 'add_additional_contact': return executeAddAdditionalContact(sb, args);
    case 'update_additional_contact': return executeUpdateAdditionalContact(sb, args);
    case 'remove_additional_contact': return executeRemoveAdditionalContact(sb, args);
    // New tools — Cash flow
    case 'get_cash_flow_analysis': return executeGetCashFlowAnalysis(sb, args);
    // New tools — Automation
    case 'get_auto_report_switches': return executeGetAutoReportSwitches(sb);
    case 'toggle_auto_report_switch': return executeToggleAutoReportSwitch(sb, args);
    case 'get_auto_report_log': return executeGetAutoReportLog(sb, args);
    // New tools — Checklists
    case 'delete_checklist_instance': return executeDeleteChecklistInstance(sb, args);
    // New tools — Calendar
    case 'get_todays_schedule': return executeGetTodaysSchedule(sb);
    // New tools — Files
    case 'delete_client_file': return executeDeleteClientFile(sb, args);
    // New tools — Bulk ops
    case 'get_bulk_generation_status': return executeGetBulkGenerationStatus(sb, args);
    // New tools — Lending rates
    case 'get_lending_rates': return executeGetLendingRates(sb, args);
    case 'compare_lender_rates': return executeCompareLenderRates(sb, args);
    // New tools — Deal stages
    case 'complete_deal_stage': return executeCompleteDealStage(sb, args);
    // New tools — Email stats
    case 'get_email_stats': return executeGetEmailStats(sb);
    // Batch 1 — Collaboration & Sharing
    case 'share_conversation': return executeShareConversation(sb, args, userId);
    case 'get_shared_conversations': return executeGetSharedConversations(sb, userId);
    case 'get_conversation_collaborators': return executeGetConversationCollaborators(sb, args);
    case 'revoke_conversation_share': return executeRevokeConversationShare(sb, args, userId);
    // Batch 1 — User Preferences
    case 'get_user_preferences': return executeGetUserPreferences(sb, userId);
    case 'set_user_preference': return executeSetUserPreference(sb, args, userId);
    // Batch 1 — Audit Trail
    case 'get_audit_trail': return executeGetAuditTrail(sb, args, userId);
    case 'undo_action': return executeUndoAction(sb, args, userId);
    // Batch 2 — Proactive & Analytics
    case 'get_proactive_insights': return executeGetProactiveInsights(sb);
    case 'compare_clients': return executeCompareClients(sb, args);
    case 'draft_follow_up': return executeDraftFollowUp(sb, args, userId);
    case 'run_system_health_check': return executeRunSystemHealthCheck(sb);

    default: return { error: `Unknown tool: ${name}` };
  }
}

// ============================================================
//  SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are Aurixa, the AI operating assistant for the NPC Property Dashboard — a property investment and mortgage brokerage management platform used by Naidu Property Consulting Services.

You have access to 120+ specialized tools across 23 domains:

📋 CLIENT MANAGEMENT — Search/view/update/create/delete clients, view co-borrowers, log activities, filter by pipeline status, find clients needing follow-up.
💰 DEALS & PIPELINE — View/filter/create/delete deals by stage/risk, settlement countdowns, stale deal detection, clawback monitoring, commission forecasting, build progress tracking, stage completion.
🔔 REMINDERS — Create/complete/snooze/delete reminders, view overdue/today/upcoming, set follow-up dates, track deal milestones.
💵 FINANCIAL — Borrowing capacity (current + history), income sources, expenses, liabilities, assets, properties, employment, client scores.
📧 EMAIL — Search/view emails, browse threads, find unlinked emails, link to clients, email statistics.
📅 CALENDAR — View upcoming appointments, find client appointments, today's full schedule.
📞 CALLS — View/search call logs, call details with transcripts, alerts, analytics, flagged calls.
📊 REPORTS — Client files, investment reports, report details, search by address, portfolio reviews with full content, cash flow analyses.
📝 CLIENT NOTES — Full CRUD: create, read, update, delete client notes.
👥 ADDITIONAL CONTACTS — Add, update, remove co-borrowers/partners.
✅ CHECKLISTS — Templates, active instances, items, toggle completion, create from template, archive/delete instances.
📈 ANALYTICS — Activity logs, API usage, service health, cache stats, dashboard summary, conversion funnel, pipeline velocity, commission actuals vs forecast.
🏢 BRANDING — Branding profiles, user permissions.
🧮 CALCULATORS — Stamp duty, LMI, loan repayments, rental yield, equity position.
🤖 AUTOMATION — Auto-report switches (view/toggle), generation logs, bulk generation status.
🏦 LENDING — Cached bank rates, multi-lender rate comparison.
🤝 COLLABORATION — Share conversations with team members, view shared chats, manage collaborators, handoff tracking.
🧠 PREFERENCES — Store and retrieve user preferences (preferred mailbox, default formats, favorite clients).
📜 AUDIT TRAIL — View all agent actions performed, undo/rollback previous actions.
🔍 PROACTIVE INSIGHTS — Automatic anomaly detection: stalling deals, overdue reminders, clawback risks, disengaged clients, finance expiry warnings, upcoming settlements.
📊 CLIENT COMPARISON — Side-by-side analysis of 2-4 clients across financials, deals, engagement, and borrowing capacity.
✉️ SMART FOLLOW-UPS — Context-aware email draft generation based on client history and deal status.
🏥 SYSTEM HEALTH — Comprehensive platform health check with scoring.

CRITICAL RULES:
1. When the user asks about a client, ALWAYS use search_clients first to find their ID, then use that ID for subsequent lookups.
2. For write operations (any tool marked REQUIRES USER CONFIRMATION), describe what you're about to do and ask the user to confirm BEFORE the action executes.
3. Present data in clean, readable markdown. Use tables for structured data, bullet points for lists.
4. If a query is ambiguous, ask for clarification rather than guessing.
5. You are an expert mortgage broker assistant. Provide context-aware insights.
6. Format dates human-readable (e.g., "15 March 2026"), monetary values with $ and commas.
7. Never fabricate data. If a tool returns no results, say so.
8. For pipeline queries, highlight at-risk deals and upcoming settlements.
9. For "morning briefing" or "what's happening" queries, use get_dashboard_summary first.
10. Be concise but thorough. Synthesize and present insights — don't repeat raw data.
11. When asked to calculate something (stamp duty, LMI, repayments, yield, equity), use the calculator tools for accurate results.
12. For financial overviews, combine borrowing capacity + income + expenses + liabilities for a complete picture.

EMAIL SENDING RULES:
When the user asks you to send an email, you MUST always:
1. Ask which mailbox to send from if not specified: "admin" (shared/company mailbox) or "personal".
2. Before calling the send_email tool, present a FULL email preview in your response using this exact format:

---
📧 **Email Preview**
**From:** [mailbox_source] mailbox
**To:** [recipient email]
**CC:** [cc list or "None"]
**BCC:** [bcc list or "None"]
**Subject:** [subject line]

**Body:**
[full email body text]
---

3. Only then call the send_email tool with all parameters. The user will see this preview alongside the Approve/Cancel buttons.
4. Always set the mailbox_source parameter explicitly based on user's choice.`;

// ============================================================
//  AI GATEWAY CALL
// ============================================================

async function callAI(messages: any[], supabase: any, userId: string): Promise<{ message: any; usage: any }> {
  const startTime = Date.now();

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'google/gemini-3-flash-preview',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[ai-dashboard-agent] AI Gateway error:', response.status, errorText);
    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again in a moment.');
    if (response.status === 402) throw new Error('AI credits exhausted. Please add credits to your Lovable workspace.');
    throw new Error(`AI Gateway error: ${response.status}`);
  }

  const result = await response.json();
  const elapsed = Date.now() - startTime;
  const usage = extractOpenAIUsage(result);

  logApiUsage(supabase, {
    service_name: 'lovable-ai-gateway',
    endpoint: '/v1/chat/completions',
    model_used: 'google/gemini-3-flash-preview',
    prompt_tokens: usage.prompt_tokens,
    completion_tokens: usage.completion_tokens,
    tokens_used: usage.total_tokens,
    response_time_ms: elapsed,
    status: 'success',
    user_id: userId,
    metadata: { feature: 'ai-dashboard-agent', tool_calls: result.choices?.[0]?.message?.tool_calls?.length || 0 },
  });

  return { message: result.choices?.[0]?.message, usage };
}

// ============================================================
//  CONVERSATION HANDLERS
// ============================================================

async function handleListConversations(sb: any, userId: string, cors: Record<string, string>) {
  // Fetch own conversations
  const { data: own, error } = await sb.from('agent_conversations').select('id, title, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;

  // Fetch conversations shared with this user
  const { data: shared } = await sb.from('agent_conversation_shares')
    .select('conversation_id, permission, handoff_note, agent_conversations(id, title, created_at, updated_at), custom_users!agent_conversation_shares_shared_by_fkey(username)')
    .eq('shared_with', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(20);

  const sharedConvos = (shared || []).map((s: any) => ({
    ...s.agent_conversations,
    shared: true,
    shared_by: s.custom_users?.username || 'Unknown',
    permission: s.permission,
    handoff_note: s.handoff_note,
  }));

  return new Response(JSON.stringify({ success: true, conversations: own || [], shared_conversations: sharedConvos }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleCreateConversation(sb: any, userId: string, title: string, cors: Record<string, string>) {
  const { data, error } = await sb.from('agent_conversations').insert({ user_id: userId, title: title || 'New Conversation' }).select().single();
  if (error) throw error;
  return new Response(JSON.stringify({ success: true, conversation: data }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleDeleteConversation(sb: any, userId: string, convId: string, cors: Record<string, string>) {
  const { error } = await sb.from('agent_conversations').delete().eq('id', convId).eq('user_id', userId);
  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleRenameConversation(sb: any, userId: string, convId: string, newTitle: string, cors: Record<string, string>) {
  const { error } = await sb.from('agent_conversations').update({ title: newTitle }).eq('id', convId).eq('user_id', userId);
  if (error) throw error;
  return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleGetMessages(sb: any, convId: string, cors: Record<string, string>) {
  const { data, error } = await sb.from('agent_messages').select('*').eq('conversation_id', convId).order('created_at', { ascending: true }).limit(200);
  if (error) throw error;
  return new Response(JSON.stringify({ success: true, messages: data || [] }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function handleConfirmAction(sb: any, body: any, cors: Record<string, string>) {
  const { message_id, approved, conversation_id } = body;
  await sb.from('agent_messages').update({ confirmation_status: approved ? 'approved' : 'rejected' }).eq('id', message_id);

  if (!approved) {
    await sb.from('agent_messages').insert({ conversation_id, role: 'assistant', content: 'Action cancelled. No changes were made.' });
    return new Response(JSON.stringify({ success: true, message: 'Action cancelled.' }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const { data: pendingMsg } = await sb.from('agent_messages').select('tool_calls').eq('id', message_id).single();
  if (pendingMsg?.tool_calls) {
    const results: any[] = [];
    for (const tc of pendingMsg.tool_calls) {
      const result = await executeTool(sb, tc.function.name, JSON.parse(tc.function.arguments), body.user_id || 'service_role');
      results.push({ tool_call_id: tc.id, result });
    }
    const content = results.map(r => r.result.success ? r.result.message : `⚠️ Error: ${r.result.error || 'Unknown'}`).join('\n');
    await sb.from('agent_messages').insert({ conversation_id, role: 'assistant', content });
    return new Response(JSON.stringify({ success: true, results }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify({ success: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ============================================================
//  MAIN CHAT HANDLER
// ============================================================

async function handleChat(sb: any, body: any, userId: string, username: string, cors: Record<string, string>) {
  const { conversation_id, message } = body;
  if (!conversation_id || !message) {
    return new Response(JSON.stringify({ error: 'conversation_id and message are required' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  await sb.from('agent_messages').insert({ conversation_id, role: 'user', content: message, sent_by: userId });

  // Load user preferences to inject into context
  const { data: prefs } = await sb.from('agent_user_preferences')
    .select('preference_key, preference_value').eq('user_id', userId);
  const prefsContext = prefs?.length
    ? `\n\nUser Preferences:\n${prefs.map((p: any) => `- ${p.preference_key}: ${JSON.stringify(p.preference_value)}`).join('\n')}`
    : '';

  const { data: history } = await sb.from('agent_messages')
    .select('role, content, tool_calls, tool_results')
    .eq('conversation_id', conversation_id).order('created_at', { ascending: true }).limit(30);

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nCurrent user: ${username} (ID: ${userId})\nCurrent conversation_id: ${conversation_id}\nCurrent time: ${new Date().toISOString()}${prefsContext}` },
  ];
  for (const msg of (history || [])) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content || '' });
    }
  }

  let finalResponse = '';
  let pendingConfirmation = false;
  let pendingToolCalls: any[] = [];

  try {
    for (let round = 0; round < 8; round++) {
      const { message: assistantMsg } = await callAI(messages, sb, userId);
      if (!assistantMsg) { finalResponse = 'I encountered an error. Please try again.'; break; }

      if (assistantMsg.tool_calls?.length) {
        const hasWrite = assistantMsg.tool_calls.some((tc: any) => WRITE_TOOLS.includes(tc.function.name));
        if (hasWrite) {
          pendingConfirmation = true;
          pendingToolCalls = assistantMsg.tool_calls;
          finalResponse = assistantMsg.content || '';
          break;
        }

        messages.push(assistantMsg);
        for (const tc of assistantMsg.tool_calls) {
          const args = JSON.parse(tc.function.arguments);
          console.log(`[ai-dashboard-agent] Tool: ${tc.function.name}`, JSON.stringify(args).substring(0, 200));
          const result = await executeTool(sb, tc.function.name, args, userId);
          messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).substring(0, 4000) });
        }
        continue;
      }

      finalResponse = assistantMsg.content || '';
      break;
    }
  } catch (err: any) {
    console.error('[ai-dashboard-agent] Chat error:', err);
    finalResponse = `⚠️ ${err.message || 'An error occurred.'}`;
  }

  if (pendingConfirmation) {
    await sb.from('agent_messages').insert({
      conversation_id, role: 'assistant', content: finalResponse,
      tool_calls: pendingToolCalls, requires_confirmation: true, confirmation_status: 'pending',
    });
  } else {
    await sb.from('agent_messages').insert({ conversation_id, role: 'assistant', content: finalResponse });
  }

  // Smart auto-title: use AI to generate concise title from first message
  const { count: msgTotal } = await sb.from('agent_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversation_id);
  if (msgTotal !== null && msgTotal <= 2) {
    try {
      const titleResp = await fetch('https://api.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash-preview-05-20',
          messages: [
            { role: 'system', content: 'Generate a concise 3-6 word title for this chat conversation based on the user\'s message. No quotes, no punctuation at the end. Just the title words. Examples: "Pipeline Overview Request", "Graham Client Lookup", "Commission Forecast Q2", "Stamp Duty Calculation VIC"' },
            { role: 'user', content: message },
          ],
          max_tokens: 20,
          temperature: 0.3,
        }),
      });
      if (titleResp.ok) {
        const titleData = await titleResp.json();
        const smartTitle = titleData.choices?.[0]?.message?.content?.trim();
        if (smartTitle && smartTitle.length > 0 && smartTitle.length <= 80) {
          await sb.from('agent_conversations').update({ title: smartTitle }).eq('id', conversation_id);
        } else {
          const fallback = message.length > 60 ? message.substring(0, 57) + '...' : message;
          await sb.from('agent_conversations').update({ title: fallback }).eq('id', conversation_id);
        }
      } else {
        const fallback = message.length > 60 ? message.substring(0, 57) + '...' : message;
        await sb.from('agent_conversations').update({ title: fallback }).eq('id', conversation_id);
      }
    } catch (titleErr) {
      console.error('[ai-dashboard-agent] Title generation error:', titleErr);
      const fallback = message.length > 60 ? message.substring(0, 57) + '...' : message;
      await sb.from('agent_conversations').update({ title: fallback }).eq('id', conversation_id);
    }
  }

  return new Response(JSON.stringify({
    success: true, response: finalResponse,
    requires_confirmation: pendingConfirmation,
    pending_tool_calls: pendingConfirmation ? pendingToolCalls : undefined,
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
}

// ============================================================
//  MAIN HANDLER
// ============================================================

serve(async (req) => {
  const origin = req.headers.get('origin');
  const cors = createCorsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { error: authErr, userId, username } = await verifyAuth(sb, req.headers, body);
    if (authErr) return createUnauthorizedResponse(authErr, cors);

    switch (body.action) {
      case 'list-conversations': return handleListConversations(sb, userId!, cors);
      case 'create-conversation': return handleCreateConversation(sb, userId!, body.title, cors);
      case 'delete-conversation': return handleDeleteConversation(sb, userId!, body.conversation_id, cors);
      case 'rename-conversation': return handleRenameConversation(sb, userId!, body.conversation_id, body.title, cors);
      case 'get-messages': return handleGetMessages(sb, body.conversation_id, cors);
      case 'confirm-action': return handleConfirmAction(sb, { ...body, user_id: userId }, cors);
      case 'chat': return handleChat(sb, body, userId!, username!, cors);
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  } catch (error: any) {
    console.error('[ai-dashboard-agent] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
