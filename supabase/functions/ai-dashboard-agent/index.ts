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

  // ═══════════════════════════════════════════════════════════
  //  BATCH 3 TOOLS — Playbooks, Scheduled Tasks, Bulk Ops,
  //  NL Chart Builder, Voice-to-Report
  // ═══════════════════════════════════════════════════════════

  // ─── SAVED PLAYBOOKS ───
  {
    type: "function",
    function: {
      name: "get_playbooks",
      description: "List all saved playbooks (own and public). Playbooks are reusable multi-step sequences of agent tools.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_playbook",
      description: "Save a reusable playbook (multi-step tool sequence). Steps are an array of {tool_name, arguments, description}. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Playbook name" },
          description: { type: "string", description: "What this playbook does" },
          icon: { type: "string", description: "Emoji icon (default 📋)" },
          steps: { type: "array", items: { type: "object", properties: { tool_name: { type: "string" }, arguments: { type: "object" }, description: { type: "string" } } }, description: "Ordered steps" },
          is_public: { type: "boolean", description: "Share with team (default false)" },
        },
        required: ["name", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_playbook",
      description: "Execute a saved playbook by ID. Runs each step sequentially, collecting results. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          playbook_id: { type: "string", description: "UUID of the playbook" },
          overrides: { type: "object", description: "Optional argument overrides for steps (keyed by step index)" },
        },
        required: ["playbook_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_playbook",
      description: "Delete a saved playbook. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { playbook_id: { type: "string", description: "UUID of the playbook" } }, required: ["playbook_id"] },
    },
  },

  // ─── SCHEDULED TASKS ───
  {
    type: "function",
    function: {
      name: "get_scheduled_tasks",
      description: "List all scheduled tasks with their cron schedules, last run status, and next run time.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "create_scheduled_task",
      description: "Schedule a playbook or single tool to run on a cron schedule. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Task name" },
          description: { type: "string", description: "What this scheduled task does" },
          task_type: { type: "string", enum: ["playbook", "single_tool"], description: "Type of task" },
          playbook_id: { type: "string", description: "UUID of playbook (if task_type=playbook)" },
          tool_name: { type: "string", description: "Tool name (if task_type=single_tool)" },
          tool_arguments: { type: "object", description: "Tool arguments (if task_type=single_tool)" },
          schedule_cron: { type: "string", description: "Cron expression (e.g. '0 8 * * 1-5' for weekdays at 8am)" },
          schedule_description: { type: "string", description: "Human-readable schedule (e.g. 'Every weekday at 8am')" },
        },
        required: ["name", "schedule_cron"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_scheduled_task",
      description: "Enable or disable a scheduled task. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          task_id: { type: "string", description: "UUID of the scheduled task" },
          is_enabled: { type: "boolean", description: "Enable or disable" },
        },
        required: ["task_id", "is_enabled"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_scheduled_task",
      description: "Delete a scheduled task. REQUIRES USER CONFIRMATION.",
      parameters: { type: "object", properties: { task_id: { type: "string", description: "UUID of the scheduled task" } }, required: ["task_id"] },
    },
  },

  // ─── BULK OPERATIONS ───
  {
    type: "function",
    function: {
      name: "bulk_update_clients",
      description: "Update a field on multiple clients at once. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_ids: { type: "array", items: { type: "string" }, description: "Array of client UUIDs" },
          field: { type: "string", description: "Field to update" },
          value: { type: "string", description: "New value" },
        },
        required: ["client_ids", "field", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_create_reminders",
      description: "Create the same reminder for multiple clients at once. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_ids: { type: "array", items: { type: "string" }, description: "Array of client UUIDs" },
          title: { type: "string", description: "Reminder title" },
          description: { type: "string", description: "Reminder description" },
          due_date: { type: "string", description: "Due date (ISO format)" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"], description: "Priority" },
          reminder_type: { type: "string", description: "Type: task, follow_up, call, meeting, document, general" },
        },
        required: ["client_ids", "title", "due_date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bulk_set_follow_up_dates",
      description: "Set follow-up dates for multiple clients at once. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          client_ids: { type: "array", items: { type: "string" }, description: "Array of client UUIDs" },
          follow_up_date: { type: "string", description: "Follow-up date (ISO format)" },
        },
        required: ["client_ids", "follow_up_date"],
      },
    },
  },

  // ─── NATURAL LANGUAGE CHART BUILDER ───
  {
    type: "function",
    function: {
      name: "generate_chart_data",
      description: "Generate chart-ready data from a natural language query. Returns structured data with labels, values, chart_type, and title that can be rendered as a chart in the chat. Examples: 'deals by stage', 'monthly commission trend', 'client pipeline distribution', 'borrowing capacity comparison'.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Natural language description of the chart (e.g. 'deals by stage', 'commission by month')" },
          chart_type: { type: "string", enum: ["bar", "pie", "line", "doughnut"], description: "Chart type (default: auto-detect)" },
        },
        required: ["query"],
      },
    },
  },

  // ─── VOICE-TO-REPORT ───
  {
    type: "function",
    function: {
      name: "generate_client_summary_report",
      description: "Generate a comprehensive text-based client summary report covering profile, financials, deals, properties, and recent activity. Perfect for voice-dictated 'give me a report on [client]' requests.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          sections: { type: "array", items: { type: "string", enum: ["profile", "financials", "deals", "properties", "reminders", "activities", "emails"] }, description: "Sections to include (default: all)" },
        },
        required: ["client_id"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════
  //  BATCH 4 TOOLS — Smart Intelligence, Trend Analysis,
  //  Data Export, Goal Tracking, Deal Timeline, Advanced Search
  // ═══════════════════════════════════════════════════════════

  // ─── TREND ANALYSIS ───
  {
    type: "function",
    function: {
      name: "get_pipeline_trends",
      description: "Analyze pipeline trends over time: new clients/deals per week, conversion velocity changes, growth trajectory. Returns data for trend charts.",
      parameters: { type: "object", properties: { weeks_back: { type: "number", description: "Weeks to analyze (default 12)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_revenue_forecast",
      description: "Multi-scenario revenue forecast: optimistic, baseline, conservative based on current pipeline, conversion rates, and average deal values.",
      parameters: { type: "object", properties: { months_ahead: { type: "number", description: "Months to forecast (default 6)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_client_engagement_score",
      description: "Calculate a 0-100 engagement score for a client based on activity frequency, email responses, call frequency, deal progress, and reminder completion.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_top_clients",
      description: "Rank clients by total loan value, deal count, commission potential, or engagement score.",
      parameters: {
        type: "object",
        properties: {
          sort_by: { type: "string", enum: ["loan_value", "deal_count", "commission", "engagement"], description: "Ranking criteria (default: loan_value)" },
          limit: { type: "number", description: "Number of clients (default 10)" },
        },
      },
    },
  },

  // ─── DEAL TIMELINE ───
  {
    type: "function",
    function: {
      name: "get_deal_timeline",
      description: "Full chronological timeline of a deal: stage changes, key dates, milestones, activities, notes. Returns events with timestamps for visualization.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "UUID of the deal" } }, required: ["deal_id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "get_deal_health_score",
      description: "Calculate a comprehensive health score (0-100) for a deal based on: days in stage, risk status, document completeness, milestone progress, clawback proximity.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "UUID of the deal" } }, required: ["deal_id"] },
    },
  },

  // ─── DATA EXPORT ───
  {
    type: "function",
    function: {
      name: "export_pipeline_data",
      description: "Export pipeline data as a formatted markdown table or CSV-style text. Includes all deals with client names, stages, loan amounts, risk status, and key dates.",
      parameters: {
        type: "object",
        properties: {
          format: { type: "string", enum: ["markdown_table", "csv_text", "summary"], description: "Export format (default: markdown_table)" },
          filter_stage: { type: "string", description: "Filter to specific stage (optional)" },
          filter_risk: { type: "string", description: "Filter to specific risk status (optional)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "export_client_portfolio",
      description: "Export a client's complete portfolio: all properties, loans, borrowing capacity, income, and net position as a formatted report.",
      parameters: { type: "object", properties: { client_id: { type: "string", description: "UUID of the client" } }, required: ["client_id"] },
    },
  },

  // ─── GOAL TRACKING ───
  {
    type: "function",
    function: {
      name: "get_performance_metrics",
      description: "Calculate KPIs: deals closed this month/quarter, total commission earned, average deal size, conversion rate, time-to-settlement.",
      parameters: { type: "object", properties: { period: { type: "string", enum: ["week", "month", "quarter", "year"], description: "Time period (default: month)" } } },
    },
  },
  {
    type: "function",
    function: {
      name: "get_weekly_digest",
      description: "Comprehensive weekly digest: new clients, deals progressed, settlements completed, commission earned, upcoming milestones, alerts triggered. Perfect for 'weekly summary' or 'what happened this week' queries.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── SMART CONTEXTUAL SEARCH ───
  {
    type: "function",
    function: {
      name: "smart_search",
      description: "Unified intelligent search across clients, deals, emails, calls, and notes. Returns categorized results with relevance. Use for broad 'find anything about X' queries.",
      parameters: { type: "object", properties: { query: { type: "string", description: "Search term" }, categories: { type: "array", items: { type: "string", enum: ["clients", "deals", "emails", "calls", "notes"] }, description: "Categories to search (default: all)" } }, required: ["query"] },
    },
  },

  // ─── WHAT-IF SCENARIOS ───
  {
    type: "function",
    function: {
      name: "what_if_analysis",
      description: "Run what-if scenarios: 'What if interest rates increase by 0.5%?', 'What if client's income drops by 10%?'. Recalculates borrowing capacity and repayments with modified parameters.",
      parameters: {
        type: "object",
        properties: {
          client_id: { type: "string", description: "UUID of the client" },
          scenario_type: { type: "string", enum: ["rate_change", "income_change", "expense_change", "deposit_change"], description: "Type of scenario" },
          adjustment_value: { type: "number", description: "Adjustment value (e.g., 0.5 for +0.5% rate, -10 for -10% income)" },
          adjustment_unit: { type: "string", enum: ["percentage", "absolute"], description: "Whether adjustment is % or absolute $ (default: percentage)" },
        },
        required: ["client_id", "scenario_type", "adjustment_value"],
      },
    },
  },

  // ─── DOCUMENT CHECKLIST ───
  {
    type: "function",
    function: {
      name: "get_document_readiness",
      description: "Check document readiness for a deal: what's submitted, what's missing, what's expired. Returns a checklist of required documents with status.",
      parameters: { type: "object", properties: { deal_id: { type: "string", description: "UUID of the deal" } }, required: ["deal_id"] },
    },
  },

  // ─── COMPETITOR RATE ANALYSIS ───
  {
    type: "function",
    function: {
      name: "find_best_rates",
      description: "Find the best lending rates for a specific loan scenario: amount, LVR, loan type, repayment type. Returns top 5 lenders with rates.",
      parameters: {
        type: "object",
        properties: {
          loan_amount: { type: "number", description: "Desired loan amount" },
          property_value: { type: "number", description: "Property value" },
          loan_type: { type: "string", enum: ["variable", "fixed_1yr", "fixed_2yr", "fixed_3yr", "fixed_5yr"], description: "Loan type preference" },
          repayment_type: { type: "string", enum: ["pi", "io"], description: "P&I or Interest Only" },
        },
        required: ["loan_amount", "property_value"],
      },
    },
  },

  // ═══════════════════════════════════════════════════════════
  //  BATCH 5 TOOLS — Memory, Report Triggers, Notifications
  // ═══════════════════════════════════════════════════════════

  // ─── CONTEXTUAL MEMORY ───
  {
    type: "function",
    function: {
      name: "save_memory",
      description: "Save a contextual note/memory about the user's preferences, habits, or important context for future conversations. Use this when the user reveals something worth remembering. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          key: { type: "string", description: "Memory key (e.g. 'communication_style', 'priority_clients', 'report_preferences', 'working_hours')" },
          value: { type: "string", description: "Memory content (descriptive text or JSON)" },
          category: { type: "string", enum: ["preference", "context", "instruction", "habit"], description: "Memory category (default: context)" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "recall_memories",
      description: "Recall all stored memories/context about the current user. Use this at the start of conversations to personalize responses.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── INVESTMENT REPORT TRIGGER ───
  {
    type: "function",
    function: {
      name: "trigger_investment_report",
      description: "Trigger generation of an investment report for a property address. Invokes the generate-investment-report edge function. REQUIRES USER CONFIRMATION.",
      parameters: {
        type: "object",
        properties: {
          property_address: { type: "string", description: "Full property address to generate a report for" },
          client_id: { type: "string", description: "Client UUID to associate the report with (optional)" },
        },
        required: ["property_address"],
      },
    },
  },

  // ─── PROACTIVE NOTIFICATION ALERTS ───
  {
    type: "function",
    function: {
      name: "get_notification_summary",
      description: "Get a condensed notification summary: count of overdue items, urgent deals, approaching deadlines, unread alerts. Used to power the notification badge in the UI.",
      parameters: { type: "object", properties: {} },
    },
  },

  // ─── CONVERSATION MANAGEMENT ───
  {
    type: "function",
    function: {
      name: "get_team_members",
      description: "List all team members available for conversation sharing/handoff.",
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
  // Batch 3
  'create_playbook', 'run_playbook', 'delete_playbook',
  'create_scheduled_task', 'toggle_scheduled_task', 'delete_scheduled_task',
  'bulk_update_clients', 'bulk_create_reminders', 'bulk_set_follow_up_dates',
  // Batch 5
  'save_memory', 'trigger_investment_report',
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

// ─── BATCH 3 EXECUTORS ───

async function executeGetPlaybooks(sb: any, userId: string) {
  const { data } = await sb.from('agent_playbooks').select('*').or(`user_id.eq.${userId},is_public.eq.true`).order('updated_at', { ascending: false }).limit(30);
  return { playbooks: data || [] };
}
async function executeCreatePlaybook(sb: any, args: any, userId: string) {
  const { data, error } = await sb.from('agent_playbooks').insert({ user_id: userId, name: args.name, description: args.description || null, icon: args.icon || '📋', steps: args.steps, is_public: args.is_public || false }).select().single();
  if (error) return { error: error.message };
  return { success: true, message: `Playbook "${args.name}" saved with ${args.steps.length} steps.`, playbook: data };
}
async function executeRunPlaybook(sb: any, args: any, userId: string) {
  const { data: pb } = await sb.from('agent_playbooks').select('*').eq('id', args.playbook_id).single();
  if (!pb) return { error: 'Playbook not found.' };
  const results: any[] = [];
  for (let i = 0; i < (pb.steps || []).length; i++) {
    const step = pb.steps[i];
    const stepArgs = args.overrides?.[i] ? { ...step.arguments, ...args.overrides[i] } : (step.arguments || {});
    try { results.push({ step: i+1, tool: step.tool_name, status: 'success', result: await executeTool(sb, step.tool_name, stepArgs, userId) }); }
    catch (e: any) { results.push({ step: i+1, tool: step.tool_name, status: 'error', error: e.message }); }
  }
  await sb.from('agent_playbooks').update({ run_count: (pb.run_count||0)+1, last_run_at: new Date().toISOString() }).eq('id', args.playbook_id);
  return { success: true, message: `Playbook "${pb.name}": ${results.filter(r=>r.status==='success').length}/${pb.steps.length} steps succeeded.`, results };
}
async function executeDeletePlaybook(sb: any, args: any) {
  await sb.from('agent_playbooks').delete().eq('id', args.playbook_id);
  return { success: true, message: 'Playbook deleted.' };
}
async function executeGetScheduledTasks(sb: any, userId: string) {
  const { data } = await sb.from('agent_scheduled_tasks').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(30);
  return { tasks: data || [] };
}
async function executeCreateScheduledTask(sb: any, args: any, userId: string) {
  const { data, error } = await sb.from('agent_scheduled_tasks').insert({ user_id: userId, name: args.name, description: args.description||null, task_type: args.task_type||'single_tool', playbook_id: args.playbook_id||null, tool_name: args.tool_name||null, tool_arguments: args.tool_arguments||null, schedule_cron: args.schedule_cron, schedule_description: args.schedule_description||null }).select().single();
  if (error) return { error: error.message };
  return { success: true, message: `Scheduled task "${args.name}" created.`, task: data };
}
async function executeToggleScheduledTask(sb: any, args: any) {
  await sb.from('agent_scheduled_tasks').update({ is_enabled: args.is_enabled }).eq('id', args.task_id);
  return { success: true, message: `Task ${args.is_enabled?'enabled':'disabled'}.` };
}
async function executeDeleteScheduledTask(sb: any, args: any) {
  await sb.from('agent_scheduled_tasks').delete().eq('id', args.task_id);
  return { success: true, message: 'Scheduled task deleted.' };
}
async function executeBulkUpdateClients(sb: any, args: any) {
  if (!args.client_ids?.length) return { error: 'No client IDs.' };
  let ok = 0; for (const id of args.client_ids) { const { error } = await sb.from('clients').update({ [args.field]: args.value }).eq('id', id); if (!error) ok++; }
  return { success: true, message: `Updated "${args.field}" on ${ok} client(s).` };
}
async function executeBulkCreateReminders(sb: any, args: any, userId: string) {
  if (!args.client_ids?.length) return { error: 'No client IDs.' };
  const { data: u } = await sb.from('custom_users').select('id').eq('id', userId).single();
  let ok = 0; for (const cid of args.client_ids) { const { error } = await sb.from('client_reminders').insert({ client_id: cid, title: args.title, description: args.description||null, due_date: args.due_date, priority: args.priority||'medium', reminder_type: args.reminder_type||'task', status: 'pending', created_by: u?userId:null }); if (!error) ok++; }
  return { success: true, message: `Created "${args.title}" for ${ok} client(s).` };
}
async function executeBulkSetFollowUpDates(sb: any, args: any) {
  if (!args.client_ids?.length) return { error: 'No client IDs.' };
  let ok = 0; for (const id of args.client_ids) { const { error } = await sb.from('clients').update({ follow_up_date: args.follow_up_date }).eq('id', id); if (!error) ok++; }
  return { success: true, message: `Set follow-up for ${ok} client(s).` };
}
async function executeGenerateChartData(sb: any, args: any) {
  const q = (args.query||'').toLowerCase(); let chartType = args.chart_type||'bar', title='', labels: string[]=[], values: number[]=[];
  if (q.includes('pipeline')) {
    title='Client Pipeline Distribution'; chartType=args.chart_type||'pie';
    const { data } = await sb.from('clients').select('pipeline_status');
    const c: Record<string,number>={}; (data||[]).forEach((d:any)=>{const s=d.pipeline_status||'unknown';c[s]=(c[s]||0)+1;}); labels=Object.keys(c); values=Object.values(c);
  } else if (q.includes('commission')&&(q.includes('month')||q.includes('trend'))) {
    title='Commission by Month'; chartType=args.chart_type||'line';
    const { data } = await sb.from('client_deals').select('settlement_date,commission_estimate').not('settlement_date','is',null);
    const m: Record<string,number>={}; (data||[]).forEach((d:any)=>{if(d.settlement_date){const mo=d.settlement_date.substring(0,7);m[mo]=(m[mo]||0)+(d.commission_estimate||0);}});
    const s=Object.entries(m).sort((a,b)=>a[0].localeCompare(b[0])).slice(-12); labels=s.map(([k])=>k); values=s.map(([,v])=>v);
  } else if (q.includes('risk')) {
    title='Deal Risk Distribution'; chartType=args.chart_type||'doughnut';
    const { data } = await sb.from('client_deals').select('risk_status');
    const c: Record<string,number>={}; (data||[]).forEach((d:any)=>{const r=d.risk_status||'unknown';c[r]=(c[r]||0)+1;}); labels=Object.keys(c); values=Object.values(c);
  } else {
    title='Deals by Stage'; const { data } = await sb.from('client_deals').select('current_stage');
    const c: Record<string,number>={}; (data||[]).forEach((d:any)=>{const s=d.current_stage||'Unknown';c[s]=(c[s]||0)+1;}); labels=Object.keys(c); values=Object.values(c);
  }
  const colors=['#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#ec4899','#06b6d4','#84cc16','#f97316','#6366f1'];
  return { chart: { type: chartType, title, labels, datasets: [{ label: title, data: values, backgroundColor: colors.slice(0,labels.length) }] }, summary: `${title}: ${labels.map((l,i)=>`${l}(${values[i]})`).join(', ')}`, __chart_data: true };
}
async function executeGenerateClientSummaryReport(sb: any, args: any) {
  const secs = args.sections||['profile','financials','deals','properties','reminders'];
  const r: string[] = [];
  const { data: client } = await sb.from('clients').select('*').eq('id', args.client_id).single();
  if (!client) return { error: 'Client not found.' };
  if (secs.includes('profile')) { r.push(`# Client Summary: ${client.primary_first_name||''} ${client.primary_surname||''}\n- Email: ${client.primary_email||'N/A'} | Phone: ${client.primary_mobile||'N/A'}\n- Pipeline: ${client.pipeline_status||'N/A'} | Follow-up: ${client.follow_up_date?.substring(0,10)||'None'}\n`); }
  if (secs.includes('financials')) {
    const [inc,exp,liab,ass,bc] = await Promise.all([sb.from('client_income').select('*').eq('client_id',args.client_id),sb.from('client_expenses').select('*').eq('client_id',args.client_id),sb.from('client_liabilities').select('*').eq('client_id',args.client_id),sb.from('client_assets').select('*').eq('client_id',args.client_id),sb.from('borrowing_capacity_assessments').select('borrowing_capacity,serviceability_band,monthly_surplus').eq('client_id',args.client_id).order('created_at',{ascending:false}).limit(1)]);
    r.push(`## Financials\n- Income: $${(inc.data||[]).reduce((s:number,i:any)=>s+(i.annual_amount||i.amount||0),0).toLocaleString()}/yr\n- Assets: $${(ass.data||[]).reduce((s:number,a:any)=>s+(a.value||0),0).toLocaleString()}\n- Liabilities: $${(liab.data||[]).reduce((s:number,l:any)=>s+(l.balance||l.amount||0),0).toLocaleString()}`);
    if (bc.data?.[0]) r.push(`- Borrowing Capacity: $${bc.data[0].borrowing_capacity?.toLocaleString()||'N/A'} (${bc.data[0].serviceability_band||'N/A'})\n`);
  }
  if (secs.includes('deals')) {
    const { data: deals } = await sb.from('client_deals').select('deal_type,current_stage,risk_status,property_address,loan_amount,settlement_date').eq('client_id',args.client_id);
    r.push('## Deals'); if (deals?.length) deals.forEach((d:any,i:number)=>r.push(`${i+1}. **${d.property_address||'N/A'}** — ${d.current_stage||'N/A'} | Loan: $${d.loan_amount?.toLocaleString()||'N/A'}`)); else r.push('_None._'); r.push('');
  }
  if (secs.includes('properties')) {
    const { data: props } = await sb.from('client_properties').select('address,property_type,current_value').eq('client_id',args.client_id);
    r.push('## Properties'); if (props?.length) props.forEach((p:any)=>r.push(`- ${p.address||'N/A'} (${p.property_type||'N/A'}) — $${p.current_value?.toLocaleString()||'N/A'}`)); else r.push('_None._'); r.push('');
  }
  if (secs.includes('reminders')) {
    const { data: rems } = await sb.from('client_reminders').select('title,due_date,priority').eq('client_id',args.client_id).eq('status','pending').order('due_date').limit(10);
    r.push('## Reminders'); if (rems?.length) rems.forEach((rem:any)=>r.push(`- ${rem.priority==='urgent'?'🔴':'🔵'} ${rem.title} — ${rem.due_date?.substring(0,10)}`)); else r.push('_None._');
  }
  r.push(`\n---\n*Generated ${new Date().toISOString().substring(0,16).replace('T',' ')} UTC*`);
  return { report: r.join('\n'), sections_included: secs };
}

// ─── BATCH 4 EXECUTORS ───

async function executeGetPipelineTrends(sb: any, args: any) {
  const weeksBack = args.weeks_back || 12;
  const cutoff = new Date(Date.now() - weeksBack * 7 * 86400000).toISOString();
  const [clientsRes, dealsRes, settledRes] = await Promise.all([
    sb.from('clients').select('id, created_at').gte('created_at', cutoff),
    sb.from('client_deals').select('id, created_at, current_stage').gte('created_at', cutoff),
    sb.from('client_deals').select('id, settlement_date, loan_amount, commission_estimate').not('settlement_date', 'is', null).gte('settlement_date', cutoff),
  ]);
  const weeklyData: Record<string, { new_clients: number; new_deals: number; settlements: number; commission: number }> = {};
  const getWeek = (d: string) => { const dt = new Date(d); const start = new Date(dt); start.setDate(start.getDate() - start.getDay()); return start.toISOString().substring(0, 10); };
  for (const c of (clientsRes.data || [])) { const w = getWeek(c.created_at); if (!weeklyData[w]) weeklyData[w] = { new_clients: 0, new_deals: 0, settlements: 0, commission: 0 }; weeklyData[w].new_clients++; }
  for (const d of (dealsRes.data || [])) { const w = getWeek(d.created_at); if (!weeklyData[w]) weeklyData[w] = { new_clients: 0, new_deals: 0, settlements: 0, commission: 0 }; weeklyData[w].new_deals++; }
  for (const s of (settledRes.data || [])) { if (s.settlement_date) { const w = getWeek(s.settlement_date); if (!weeklyData[w]) weeklyData[w] = { new_clients: 0, new_deals: 0, settlements: 0, commission: 0 }; weeklyData[w].settlements++; weeklyData[w].commission += (s.commission_estimate || 0); } }
  const sorted = Object.entries(weeklyData).sort((a, b) => a[0].localeCompare(b[0]));
  return { weeks: sorted.map(([week, data]) => ({ week, ...data })), total_weeks: sorted.length, period: `Last ${weeksBack} weeks` };
}

async function executeGetRevenueForecast(sb: any, args: any) {
  const months = args.months_ahead || 6;
  const { data: deals } = await sb.from('client_deals').select('id, current_stage, loan_amount, commission_estimate, settlement_date, risk_status').not('current_stage', 'ilike', '%settled%').not('current_stage', 'ilike', '%cancelled%');
  const { data: settled } = await sb.from('client_deals').select('commission_estimate, settlement_date').ilike('current_stage', '%settled%').order('settlement_date', { ascending: false }).limit(50);
  const avgCommission = settled?.length ? settled.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0) / settled.length : 15000;
  const activePipeline = (deals || []).reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
  const forecast = [];
  for (let i = 1; i <= months; i++) {
    const dt = new Date(); dt.setMonth(dt.getMonth() + i);
    const monthLabel = dt.toISOString().substring(0, 7);
    const dealsThisMonth = (deals || []).filter((d: any) => d.settlement_date?.startsWith(monthLabel));
    const confirmed = dealsThisMonth.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
    forecast.push({
      month: monthLabel,
      optimistic: Math.round(confirmed + avgCommission * 2),
      baseline: Math.round(confirmed + avgCommission * 0.8),
      conservative: Math.round(confirmed * 0.7),
    });
  }
  return { forecast, active_pipeline_value: activePipeline, active_deals: deals?.length || 0, avg_commission: Math.round(avgCommission) };
}

async function executeGetClientEngagementScore(sb: any, args: any) {
  const cid = args.client_id;
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  const [activities, emails, calls, reminders, deals] = await Promise.all([
    sb.from('client_activities').select('id, created_at').eq('client_id', cid).gte('created_at', thirtyDaysAgo),
    sb.from('email_copilot_emails').select('id').eq('client_id', cid).gte('received_at', thirtyDaysAgo),
    sb.from('vapi_call_logs').select('id').ilike('caller_phone', `%${cid.substring(0, 8)}%`).gte('created_at', thirtyDaysAgo),
    sb.from('client_reminders').select('id, status').eq('client_id', cid).gte('created_at', thirtyDaysAgo),
    sb.from('client_deals').select('id, updated_at, risk_status').eq('client_id', cid),
  ]);
  let score = 0;
  score += Math.min(30, (activities.data?.length || 0) * 5); // Activity: max 30
  score += Math.min(20, (emails.data?.length || 0) * 4); // Emails: max 20
  score += Math.min(15, (calls.data?.length || 0) * 5); // Calls: max 15
  const completed = (reminders.data || []).filter((r: any) => r.status === 'completed').length;
  const total = reminders.data?.length || 0;
  score += total > 0 ? Math.round((completed / total) * 15) : 0; // Reminder completion: max 15
  const activeDeals = (deals.data || []).filter((d: any) => d.risk_status !== 'urgent');
  score += Math.min(20, activeDeals.length * 10); // Deals health: max 20
  const level = score >= 75 ? 'highly_engaged' : score >= 50 ? 'engaged' : score >= 25 ? 'moderate' : 'disengaged';
  return { client_id: cid, engagement_score: Math.min(100, score), level, breakdown: { activity_score: Math.min(30, (activities.data?.length || 0) * 5), email_score: Math.min(20, (emails.data?.length || 0) * 4), call_score: Math.min(15, (calls.data?.length || 0) * 5), reminder_score: total > 0 ? Math.round((completed / total) * 15) : 0, deal_score: Math.min(20, activeDeals.length * 10) } };
}

async function executeGetTopClients(sb: any, args: any) {
  const sortBy = args.sort_by || 'loan_value';
  const lim = args.limit || 10;
  const { data: clients } = await sb.from('clients').select('id, primary_first_name, primary_surname, pipeline_status, borrowing_capacity, created_at, updated_at').limit(200);
  const { data: deals } = await sb.from('client_deals').select('client_id, loan_amount, commission_estimate, current_stage');
  const clientMap: Record<string, any> = {};
  for (const c of (clients || [])) {
    clientMap[c.id] = { ...c, name: `${c.primary_first_name||''} ${c.primary_surname||''}`.trim(), total_loan: 0, deal_count: 0, total_commission: 0 };
  }
  for (const d of (deals || [])) { if (clientMap[d.client_id]) { clientMap[d.client_id].total_loan += (d.loan_amount || 0); clientMap[d.client_id].deal_count++; clientMap[d.client_id].total_commission += (d.commission_estimate || 0); } }
  const list = Object.values(clientMap);
  if (sortBy === 'loan_value') list.sort((a: any, b: any) => b.total_loan - a.total_loan);
  else if (sortBy === 'deal_count') list.sort((a: any, b: any) => b.deal_count - a.deal_count);
  else if (sortBy === 'commission') list.sort((a: any, b: any) => b.total_commission - a.total_commission);
  return { top_clients: list.slice(0, lim).map((c: any, i: number) => ({ rank: i + 1, id: c.id, name: c.name, pipeline_status: c.pipeline_status, total_loan_value: c.total_loan, deal_count: c.deal_count, total_commission: c.total_commission })), sorted_by: sortBy };
}

async function executeGetDealTimeline(sb: any, args: any) {
  const did = args.deal_id;
  const [deal, stages, payments, activities] = await Promise.all([
    sb.from('client_deals').select('*, clients:client_id(primary_first_name, primary_surname)').eq('id', did).single(),
    sb.from('deal_stages').select('*').eq('deal_id', did).order('stage_number', { ascending: true }),
    sb.from('build_progress_payments').select('*').eq('deal_id', did).order('stage_number', { ascending: true }),
    sb.from('client_activities').select('id, title, description, activity_type, created_at').eq('entity_id', did).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!deal.data) return { error: 'Deal not found.' };
  const events: any[] = [];
  events.push({ type: 'created', date: deal.data.created_at, title: 'Deal Created', detail: deal.data.deal_type });
  for (const s of (stages.data || [])) { if (s.completed_at) events.push({ type: 'stage_complete', date: s.completed_at, title: `Stage Completed: ${s.stage_name}`, detail: `Stage ${s.stage_number}` }); }
  for (const p of (payments.data || [])) { if (p.builder_invoice_date) events.push({ type: 'invoice', date: p.builder_invoice_date, title: `Invoice: ${p.stage_name}`, detail: `$${p.amount?.toLocaleString() || 'N/A'}` }); }
  for (const a of (activities.data || [])) { events.push({ type: a.activity_type, date: a.created_at, title: a.title, detail: a.description }); }
  if (deal.data.settlement_date) events.push({ type: 'milestone', date: deal.data.settlement_date, title: 'Settlement Date', detail: `$${deal.data.loan_amount?.toLocaleString() || 'N/A'}` });
  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  return { deal: { id: did, address: deal.data.property_address, client: `${deal.data.clients?.primary_first_name||''} ${deal.data.clients?.primary_surname||''}`.trim() }, timeline: events, total_events: events.length };
}

async function executeGetDealHealthScore(sb: any, args: any) {
  const did = args.deal_id;
  const { data: deal } = await sb.from('client_deals').select('*').eq('id', did).single();
  if (!deal) return { error: 'Deal not found.' };
  let score = 100;
  const now = Date.now();
  // Days in current stage penalty
  const daysInStage = Math.floor((now - new Date(deal.updated_at).getTime()) / 86400000);
  if (daysInStage > 30) score -= 25;
  else if (daysInStage > 14) score -= 15;
  else if (daysInStage > 7) score -= 5;
  // Risk status
  if (deal.risk_status === 'urgent') score -= 30;
  else if (deal.risk_status === 'needs_follow_up') score -= 15;
  // Clawback proximity
  if (deal.clawback_expiry_date) { const daysToClawback = Math.ceil((new Date(deal.clawback_expiry_date).getTime() - now) / 86400000); if (daysToClawback < 30) score -= 20; else if (daysToClawback < 90) score -= 10; }
  // Finance expiry
  if (deal.finance_clause_expiry) { const daysToFinance = Math.ceil((new Date(deal.finance_clause_expiry).getTime() - now) / 86400000); if (daysToFinance < 3) score -= 20; else if (daysToFinance < 7) score -= 10; }
  score = Math.max(0, score);
  const band = score >= 80 ? 'healthy' : score >= 50 ? 'needs_attention' : 'critical';
  return { deal_id: did, health_score: score, band, factors: { days_in_stage: daysInStage, risk_status: deal.risk_status, clawback_expiry: deal.clawback_expiry_date, finance_expiry: deal.finance_clause_expiry } };
}

async function executeExportPipelineData(sb: any, args: any) {
  let query = sb.from('client_deals').select('id, deal_type, current_stage, risk_status, property_address, loan_amount, commission_estimate, settlement_date, clients:client_id(primary_first_name, primary_surname)');
  if (args.filter_stage) query = query.ilike('current_stage', `%${args.filter_stage}%`);
  if (args.filter_risk) query = query.eq('risk_status', args.filter_risk);
  const { data: deals } = await query.order('created_at', { ascending: false }).limit(200);
  if (!deals?.length) return { export: 'No deals found matching filters.', count: 0 };
  const fmt = args.format || 'markdown_table';
  if (fmt === 'csv_text') {
    const header = 'Client,Address,Stage,Risk,Loan Amount,Commission,Settlement';
    const rows = deals.map((d: any) => `"${d.clients?.primary_first_name||''} ${d.clients?.primary_surname||''}","${d.property_address||''}","${d.current_stage||''}","${d.risk_status||''}","${d.loan_amount||''}","${d.commission_estimate||''}","${d.settlement_date?.substring(0,10)||''}"`);
    return { export: [header, ...rows].join('\n'), count: deals.length, format: 'csv' };
  }
  if (fmt === 'summary') {
    const total = deals.reduce((s: number, d: any) => s + (d.loan_amount || 0), 0);
    const comm = deals.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
    return { export: `**Pipeline Summary**: ${deals.length} deals | Total Loan: $${total.toLocaleString()} | Total Commission: $${comm.toLocaleString()}`, count: deals.length, format: 'summary' };
  }
  // markdown_table
  const header = '| Client | Address | Stage | Risk | Loan | Commission | Settlement |\n|--------|---------|-------|------|------|------------|------------|';
  const rows = deals.map((d: any) => `| ${d.clients?.primary_first_name||''} ${d.clients?.primary_surname||''} | ${d.property_address||'N/A'} | ${d.current_stage||'N/A'} | ${d.risk_status||'N/A'} | $${d.loan_amount?.toLocaleString()||'0'} | $${d.commission_estimate?.toLocaleString()||'0'} | ${d.settlement_date?.substring(0,10)||'N/A'} |`);
  return { export: [header, ...rows].join('\n'), count: deals.length, format: 'markdown_table' };
}

async function executeExportClientPortfolio(sb: any, args: any) {
  const cid = args.client_id;
  const [client, deals, props, inc, liab, bc] = await Promise.all([
    sb.from('clients').select('*').eq('id', cid).single(),
    sb.from('client_deals').select('deal_type, current_stage, property_address, loan_amount, commission_estimate, settlement_date, risk_status').eq('client_id', cid),
    sb.from('client_properties').select('address, property_type, current_value, loan_balance, rental_income_weekly').eq('client_id', cid),
    sb.from('client_income').select('income_type, amount, frequency').eq('client_id', cid),
    sb.from('client_liabilities').select('liability_type, balance, repayment_amount').eq('client_id', cid),
    sb.from('borrowing_capacity_assessments').select('borrowing_capacity, serviceability_band, monthly_surplus').eq('client_id', cid).order('created_at', { ascending: false }).limit(1),
  ]);
  if (!client.data) return { error: 'Client not found.' };
  const c = client.data;
  const totalProperty = (props.data || []).reduce((s: number, p: any) => s + (p.current_value || 0), 0);
  const totalLoans = (props.data || []).reduce((s: number, p: any) => s + (p.loan_balance || 0), 0);
  const totalLiabilities = (liab.data || []).reduce((s: number, l: any) => s + (l.balance || 0), 0);
  const netPosition = totalProperty - totalLoans - totalLiabilities;
  return {
    portfolio: {
      client: `${c.primary_first_name||''} ${c.primary_surname||''}`.trim(),
      pipeline_status: c.pipeline_status,
      properties: props.data || [],
      total_property_value: totalProperty,
      total_loans: totalLoans,
      net_equity: totalProperty - totalLoans,
      total_liabilities: totalLiabilities,
      net_position: netPosition,
      borrowing_capacity: bc.data?.[0]?.borrowing_capacity || null,
      serviceability: bc.data?.[0]?.serviceability_band || null,
      active_deals: deals.data?.length || 0,
      income_sources: inc.data || [],
    },
  };
}

async function executeGetPerformanceMetrics(sb: any, args: any) {
  const period = args.period || 'month';
  const now = new Date();
  let cutoff: Date;
  if (period === 'week') cutoff = new Date(now.getTime() - 7 * 86400000);
  else if (period === 'quarter') { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 3); }
  else if (period === 'year') { cutoff = new Date(now); cutoff.setFullYear(cutoff.getFullYear() - 1); }
  else { cutoff = new Date(now); cutoff.setMonth(cutoff.getMonth() - 1); }
  const [settled, allDeals, newClients] = await Promise.all([
    sb.from('client_deals').select('id, loan_amount, commission_estimate, settlement_date').ilike('current_stage', '%settled%').gte('settlement_date', cutoff.toISOString()),
    sb.from('client_deals').select('id, current_stage, created_at').gte('created_at', cutoff.toISOString()),
    sb.from('clients').select('id').gte('created_at', cutoff.toISOString()),
  ]);
  const settledDeals = settled.data || [];
  const totalCommission = settledDeals.reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
  const avgDealSize = settledDeals.length > 0 ? settledDeals.reduce((s: number, d: any) => s + (d.loan_amount || 0), 0) / settledDeals.length : 0;
  const totalDeals = allDeals.data?.length || 0;
  const conversionRate = totalDeals > 0 ? Math.round((settledDeals.length / totalDeals) * 100) : 0;
  return {
    period, deals_closed: settledDeals.length, total_commission: totalCommission, avg_deal_size: Math.round(avgDealSize),
    conversion_rate: conversionRate, new_clients: newClients.data?.length || 0, total_deals_created: totalDeals,
  };
}

async function executeGetWeeklyDigest(sb: any) {
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
  const [newClients, newDeals, settlements, activities, remCompleted, alerts] = await Promise.all([
    sb.from('clients').select('id, primary_first_name, primary_surname').gte('created_at', weekAgo),
    sb.from('client_deals').select('id, property_address, deal_type').gte('created_at', weekAgo),
    sb.from('client_deals').select('id, property_address, loan_amount, commission_estimate, clients:client_id(primary_first_name, primary_surname)').ilike('current_stage', '%settled%').gte('settlement_date', weekAgo),
    sb.from('client_activities').select('id').gte('created_at', weekAgo),
    sb.from('client_reminders').select('id').eq('status', 'completed').gte('updated_at', weekAgo),
    sb.from('call_alert_history').select('id, is_positive').gte('triggered_at', weekAgo),
  ]);
  const totalComm = (settlements.data || []).reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
  return {
    week_ending: new Date().toISOString().substring(0, 10),
    new_clients: newClients.data?.length || 0,
    new_deals: newDeals.data?.length || 0,
    settlements_completed: settlements.data?.length || 0,
    commission_earned: totalComm,
    activities_logged: activities.data?.length || 0,
    reminders_completed: remCompleted.data?.length || 0,
    alerts_triggered: alerts.data?.length || 0,
    positive_alerts: (alerts.data || []).filter((a: any) => a.is_positive).length,
    settlement_details: (settlements.data || []).map((s: any) => ({ address: s.property_address, loan: s.loan_amount, commission: s.commission_estimate, client: `${s.clients?.primary_first_name||''} ${s.clients?.primary_surname||''}`.trim() })),
  };
}

async function executeSmartSearch(sb: any, args: any) {
  const q = args.query; const cats = args.categories || ['clients', 'deals', 'emails', 'calls', 'notes'];
  const results: any = {};
  if (cats.includes('clients')) {
    const { data } = await sb.from('clients').select('id, primary_first_name, primary_surname, primary_email, pipeline_status').or(`primary_first_name.ilike.%${q}%,primary_surname.ilike.%${q}%,primary_email.ilike.%${q}%`).limit(10);
    results.clients = (data || []).map((c: any) => ({ id: c.id, name: `${c.primary_first_name||''} ${c.primary_surname||''}`.trim(), email: c.primary_email, status: c.pipeline_status }));
  }
  if (cats.includes('deals')) {
    const { data } = await sb.from('client_deals').select('id, property_address, current_stage, loan_amount, clients:client_id(primary_first_name, primary_surname)').ilike('property_address', `%${q}%`).limit(10);
    results.deals = (data || []).map((d: any) => ({ id: d.id, address: d.property_address, stage: d.current_stage, client: `${d.clients?.primary_first_name||''} ${d.clients?.primary_surname||''}`.trim() }));
  }
  if (cats.includes('emails')) {
    const { data } = await sb.from('email_copilot_emails').select('id, subject, sender, received_at').or(`subject.ilike.%${q}%,sender.ilike.%${q}%`).order('received_at', { ascending: false }).limit(10);
    results.emails = data || [];
  }
  if (cats.includes('calls')) {
    const { data } = await sb.from('vapi_call_logs').select('id, agent_name, summary, created_at').ilike('summary', `%${q}%`).order('created_at', { ascending: false }).limit(10);
    results.calls = data || [];
  }
  if (cats.includes('notes')) {
    const { data } = await sb.from('client_notes').select('id, content, note_type, created_at, client_id').ilike('content', `%${q}%`).order('created_at', { ascending: false }).limit(10);
    results.notes = data || [];
  }
  const totalResults = Object.values(results).reduce((s: number, r: any) => s + (r?.length || 0), 0);
  return { query: q, total_results: totalResults, results };
}

async function executeWhatIfAnalysis(sb: any, args: any) {
  const { data: bc } = await sb.from('borrowing_capacity_assessments').select('*').eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(1);
  if (!bc?.[0]) return { error: 'No borrowing capacity assessment found for this client.' };
  const current = bc[0];
  const adj = args.adjustment_value;
  const unit = args.adjustment_unit || 'percentage';
  let newCapacity = current.borrowing_capacity;
  let description = '';
  switch (args.scenario_type) {
    case 'rate_change': {
      const currentRate = current.interest_rate_used || 6.5;
      const newRate = unit === 'percentage' ? currentRate + adj : adj;
      const rateRatio = (currentRate / newRate);
      newCapacity = Math.round(current.borrowing_capacity * rateRatio);
      description = `Interest rate ${adj > 0 ? 'increase' : 'decrease'} from ${currentRate}% to ${newRate.toFixed(2)}%`;
      break;
    }
    case 'income_change': {
      const factor = unit === 'percentage' ? (1 + adj / 100) : (current.gross_annual_income + adj) / current.gross_annual_income;
      newCapacity = Math.round(current.borrowing_capacity * factor);
      description = `Income ${adj > 0 ? 'increase' : 'decrease'} by ${unit === 'percentage' ? adj + '%' : '$' + Math.abs(adj).toLocaleString()}`;
      break;
    }
    case 'expense_change': {
      const monthlyChange = unit === 'percentage' ? current.living_expenses_monthly * (adj / 100) : adj;
      const annualChange = monthlyChange * 12;
      newCapacity = Math.round(current.borrowing_capacity - annualChange * 5);
      description = `Expenses ${adj > 0 ? 'increase' : 'decrease'} by ${unit === 'percentage' ? adj + '%' : '$' + Math.abs(adj).toLocaleString()}/month`;
      break;
    }
    case 'deposit_change': {
      const depositChange = unit === 'percentage' ? (current.deposit_amount || 0) * (adj / 100) : adj;
      newCapacity = Math.round(current.borrowing_capacity + depositChange);
      description = `Deposit ${adj > 0 ? 'increase' : 'decrease'} by ${unit === 'percentage' ? adj + '%' : '$' + Math.abs(adj).toLocaleString()}`;
      break;
    }
  }
  const change = newCapacity - current.borrowing_capacity;
  return {
    scenario: description,
    current_capacity: current.borrowing_capacity,
    projected_capacity: newCapacity,
    change_amount: change,
    change_percentage: Math.round((change / current.borrowing_capacity) * 100),
    impact: change > 0 ? 'positive' : change < 0 ? 'negative' : 'neutral',
    current_band: current.serviceability_band,
  };
}

async function executeGetDocumentReadiness(sb: any, args: any) {
  const { data: deal } = await sb.from('client_deals').select('*, clients:client_id(primary_first_name, primary_surname)').eq('id', args.deal_id).single();
  if (!deal) return { error: 'Deal not found.' };
  const { data: files } = await sb.from('client_files').select('file_name, file_type, created_at').eq('client_id', deal.client_id);
  const requiredDocs = ['ID Verification', 'Income Evidence', 'Bank Statements', 'Tax Returns', 'Employment Letter', 'Contract of Sale', 'Valuation Report', 'Insurance Certificate'];
  const fileNames = (files || []).map((f: any) => f.file_name?.toLowerCase() || '');
  const checklist = requiredDocs.map(doc => {
    const found = fileNames.some(fn => fn.includes(doc.toLowerCase().split(' ')[0]));
    return { document: doc, status: found ? 'submitted' : 'missing', required: true };
  });
  const submitted = checklist.filter(d => d.status === 'submitted').length;
  return { deal_id: args.deal_id, client: `${deal.clients?.primary_first_name||''} ${deal.clients?.primary_surname||''}`.trim(), readiness_score: Math.round((submitted / requiredDocs.length) * 100), submitted, total_required: requiredDocs.length, checklist, uploaded_files: files?.length || 0 };
}

async function executeFindBestRates(sb: any, args: any) {
  const lvr = Math.round((args.loan_amount / args.property_value) * 100);
  const { data: rates } = await sb.from('bank_lending_rates_cache').select('lender_name, rates').order('lender_name');
  if (!rates?.length) return { message: 'No lending rates data available. Rates cache may need refreshing.', lvr, loan_amount: args.loan_amount };
  const ranked: any[] = [];
  for (const lender of rates) {
    const r = lender.rates as any;
    let rate: number | null = null;
    if (args.loan_type === 'variable') rate = r?.variable || r?.standard_variable;
    else if (args.loan_type?.startsWith('fixed')) rate = r?.[args.loan_type] || r?.fixed_1yr;
    else rate = r?.variable || r?.comparison || Object.values(r || {})[0] as number;
    if (typeof rate === 'number') ranked.push({ lender: lender.lender_name, rate, monthly_repayment: Math.round((args.loan_amount * (rate / 100 / 12)) / (1 - Math.pow(1 + rate / 100 / 12, -(args.repayment_type === 'io' ? 1 : 360))) * 100) / 100 });
  }
  ranked.sort((a, b) => a.rate - b.rate);
  return { lvr, loan_amount: args.loan_amount, property_value: args.property_value, loan_type: args.loan_type || 'variable', top_rates: ranked.slice(0, 5), total_lenders_checked: rates.length };
}

async function executeGetDashboardSummary(sb: any) {
  const now = new Date().toISOString();
  const [clients, deals, reminders, settlements, activities] = await Promise.all([
    sb.from('clients').select('id, primary_first_name, primary_surname, pipeline_status, total_portfolio_value, net_monthly_cash_flow', { count: 'exact' }),
    sb.from('client_deals').select('id, deal_name, current_stage, risk_status, settlement_date, finance_due_date, deal_amount', { count: 'exact' }),
    sb.from('client_reminders').select('id, title, due_date, priority, status').eq('status', 'pending').order('due_date'),
    sb.from('client_deals').select('id, deal_name, settlement_date, current_stage, deal_amount, clients:client_id(primary_first_name, primary_surname)').gte('settlement_date', now).order('settlement_date').limit(10),
    sb.from('activity_logs').select('id, action_type, entity_type, entity_name, created_at').order('created_at', { ascending: false }).limit(10),
  ]);

  const clientData = clients.data || [];
  const dealData = deals.data || [];
  const reminderData = reminders.data || [];
  const overdueReminders = reminderData.filter((r: any) => r.due_date && new Date(r.due_date) < new Date());
  const urgentReminders = reminderData.filter((r: any) => r.priority === 'high' || r.priority === 'urgent');
  const activeDeals = dealData.filter((d: any) => d.current_stage !== 'settled' && d.current_stage !== 'fallen_through');
  const atRiskDeals = dealData.filter((d: any) => d.risk_status === 'at_risk' || d.risk_status === 'urgent');
  const totalPipelineValue = activeDeals.reduce((s: number, d: any) => s + (Number(d.deal_amount) || 0), 0);
  const totalAUM = clientData.reduce((s: number, c: any) => s + (Number(c.total_portfolio_value) || 0), 0);

  return {
    summary_date: new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    clients: { total: clients.count || clientData.length, by_status: clientData.reduce((acc: any, c: any) => { acc[c.pipeline_status || 'unknown'] = (acc[c.pipeline_status || 'unknown'] || 0) + 1; return acc; }, {}) },
    deals: { total: deals.count || dealData.length, active: activeDeals.length, at_risk: atRiskDeals.length, total_pipeline_value: totalPipelineValue },
    reminders: { pending: reminderData.length, overdue: overdueReminders.length, urgent: urgentReminders.length },
    upcoming_settlements: (settlements.data || []).slice(0, 5).map((s: any) => ({ deal: s.deal_name, date: s.settlement_date, amount: s.deal_amount, client: `${s.clients?.primary_first_name || ''} ${s.clients?.primary_surname || ''}`.trim() })),
    total_aum: totalAUM,
    recent_activity: (activities.data || []).slice(0, 5).map((a: any) => ({ type: a.action_type, entity: a.entity_name, when: a.created_at })),
  };
}

async function executeGetCacheStatistics(sb: any) {
  const [census, rates, health] = await Promise.all([
    sb.from('abs_census_cache').select('id, dataset, postcode, expires_at', { count: 'exact' }),
    sb.from('bank_lending_rates_cache').select('lender_id, lender_name, updated_at', { count: 'exact' }),
    sb.from('api_health_log').select('service_name, status, created_at').order('created_at', { ascending: false }).limit(20),
  ]);
  const now = new Date();
  const expiredCensus = (census.data || []).filter((c: any) => new Date(c.expires_at) < now).length;
  return {
    census_cache: { total_entries: census.count || 0, expired: expiredCensus, active: (census.count || 0) - expiredCensus },
    lending_rates: { total_lenders: rates.count || 0, last_updated: rates.data?.[0]?.updated_at || null },
    api_health_recent: (health.data || []).slice(0, 10),
  };
}

async function executeGetApiHealth(sb: any, args: any) {
  const limit = args?.limit || 20;
  const { data } = await sb.from('api_health_log').select('*').order('created_at', { ascending: false }).limit(limit);
  const entries = data || [];
  const byService: Record<string, any> = {};
  for (const e of entries) {
    if (!byService[e.service_name]) byService[e.service_name] = { total: 0, success: 0, errors: 0, avg_response_ms: 0, times: [] };
    byService[e.service_name].total++;
    if (e.status === 'success') byService[e.service_name].success++;
    else byService[e.service_name].errors++;
    if (e.response_time_ms) byService[e.service_name].times.push(e.response_time_ms);
  }
  for (const svc of Object.keys(byService)) {
    const t = byService[svc].times;
    byService[svc].avg_response_ms = t.length ? Math.round(t.reduce((a: number, b: number) => a + b, 0) / t.length) : 0;
    delete byService[svc].times;
    byService[svc].success_rate = byService[svc].total ? Math.round((byService[svc].success / byService[svc].total) * 100) : 0;
  }
  return { services: byService, total_checked: entries.length };
}

async function executeGetBrandingProfiles(sb: any) {
  const { data } = await sb.from('client_branding_profiles').select('*').order('is_default', { ascending: false }).order('created_at', { ascending: false });
  return { profiles: data || [], total: data?.length || 0 };
}

async function executeGetUserPermissions(sb: any, args: any) {
  const userId = args?.user_id;
  if (!userId) return { error: 'user_id is required' };
  const { data: user } = await sb.from('custom_users').select('id, username, role, is_active').eq('id', userId).maybeSingle();
  if (!user) return { error: 'User not found' };
  return { user_id: user.id, username: user.username, role: user.role, is_active: user.is_active };
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
    // Calculators
    case 'calculate_stamp_duty': return executeCalculateStampDuty(args);
    case 'calculate_lmi': return executeCalculateLMI(args);
    case 'calculate_loan_repayment': return executeCalculateLoanRepayment(args);
    case 'calculate_rental_yield': return executeCalculateRentalYield(args);
    case 'calculate_equity_position': return executeCalculateEquityPosition(args);
    // Client lifecycle
    case 'create_client': return executeCreateClient(sb, args, userId);
    case 'delete_client': return executeDeleteClient(sb, args);
    case 'get_clients_by_pipeline_status': return executeGetClientsByPipelineStatus(sb, args);
    case 'get_clients_needing_follow_up': return executeGetClientsNeedingFollowUp(sb, args);
    // Client notes
    case 'get_client_notes': return executeGetClientNotes(sb, args);
    case 'create_client_note': return executeCreateClientNote(sb, args, userId);
    case 'update_client_note': return executeUpdateClientNote(sb, args);
    case 'delete_client_note': return executeDeleteClientNote(sb, args);
    // Client scores
    case 'get_client_score': return executeGetClientScore(sb, args);
    case 'get_portfolio_review_details': return executeGetPortfolioReviewDetails(sb, args);
    // Deals
    case 'create_deal': return executeCreateDeal(sb, args, userId);
    case 'delete_deal': return executeDeleteDeal(sb, args);
    // Pipeline analytics
    case 'get_conversion_funnel': return executeGetConversionFunnel(sb, args);
    case 'get_pipeline_velocity': return executeGetPipelineVelocity(sb);
    case 'get_commission_actuals': return executeGetCommissionActuals(sb, args);
    // Additional contacts
    case 'add_additional_contact': return executeAddAdditionalContact(sb, args);
    case 'update_additional_contact': return executeUpdateAdditionalContact(sb, args);
    case 'remove_additional_contact': return executeRemoveAdditionalContact(sb, args);
    // Cash flow
    case 'get_cash_flow_analysis': return executeGetCashFlowAnalysis(sb, args);
    // Automation
    case 'get_auto_report_switches': return executeGetAutoReportSwitches(sb);
    case 'toggle_auto_report_switch': return executeToggleAutoReportSwitch(sb, args);
    case 'get_auto_report_log': return executeGetAutoReportLog(sb, args);
    // Checklists ext
    case 'delete_checklist_instance': return executeDeleteChecklistInstance(sb, args);
    // Calendar ext
    case 'get_todays_schedule': return executeGetTodaysSchedule(sb);
    // Files
    case 'delete_client_file': return executeDeleteClientFile(sb, args);
    // Bulk ops (legacy)
    case 'get_bulk_generation_status': return executeGetBulkGenerationStatus(sb, args);
    // Lending
    case 'get_lending_rates': return executeGetLendingRates(sb, args);
    case 'compare_lender_rates': return executeCompareLenderRates(sb, args);
    // Deal stages
    case 'complete_deal_stage': return executeCompleteDealStage(sb, args);
    // Email stats
    case 'get_email_stats': return executeGetEmailStats(sb);
    // Batch 1
    case 'share_conversation': return executeShareConversation(sb, args, userId);
    case 'get_shared_conversations': return executeGetSharedConversations(sb, userId);
    case 'get_conversation_collaborators': return executeGetConversationCollaborators(sb, args);
    case 'revoke_conversation_share': return executeRevokeConversationShare(sb, args, userId);
    case 'get_user_preferences': return executeGetUserPreferences(sb, userId);
    case 'set_user_preference': return executeSetUserPreference(sb, args, userId);
    case 'get_audit_trail': return executeGetAuditTrail(sb, args, userId);
    case 'undo_action': return executeUndoAction(sb, args, userId);
    // Batch 2
    case 'get_proactive_insights': return executeGetProactiveInsights(sb);
    case 'compare_clients': return executeCompareClients(sb, args);
    case 'draft_follow_up': return executeDraftFollowUp(sb, args, userId);
    case 'run_system_health_check': return executeRunSystemHealthCheck(sb);
    // Batch 3
    case 'get_playbooks': return executeGetPlaybooks(sb, userId);
    case 'create_playbook': return executeCreatePlaybook(sb, args, userId);
    case 'run_playbook': return executeRunPlaybook(sb, args, userId);
    case 'delete_playbook': return executeDeletePlaybook(sb, args);
    case 'get_scheduled_tasks': return executeGetScheduledTasks(sb, userId);
    case 'create_scheduled_task': return executeCreateScheduledTask(sb, args, userId);
    case 'toggle_scheduled_task': return executeToggleScheduledTask(sb, args);
    case 'delete_scheduled_task': return executeDeleteScheduledTask(sb, args);
    case 'bulk_update_clients': return executeBulkUpdateClients(sb, args);
    case 'bulk_create_reminders': return executeBulkCreateReminders(sb, args, userId);
    case 'bulk_set_follow_up_dates': return executeBulkSetFollowUpDates(sb, args);
    case 'generate_chart_data': return executeGenerateChartData(sb, args);
    case 'generate_client_summary_report': return executeGenerateClientSummaryReport(sb, args);
    // Batch 4
    case 'get_pipeline_trends': return executeGetPipelineTrends(sb, args);
    case 'get_revenue_forecast': return executeGetRevenueForecast(sb, args);
    case 'get_client_engagement_score': return executeGetClientEngagementScore(sb, args);
    case 'get_top_clients': return executeGetTopClients(sb, args);
    case 'get_deal_timeline': return executeGetDealTimeline(sb, args);
    case 'get_deal_health_score': return executeGetDealHealthScore(sb, args);
    case 'export_pipeline_data': return executeExportPipelineData(sb, args);
    case 'export_client_portfolio': return executeExportClientPortfolio(sb, args);
    case 'get_performance_metrics': return executeGetPerformanceMetrics(sb, args);
    case 'get_weekly_digest': return executeGetWeeklyDigest(sb);
    case 'smart_search': return executeSmartSearch(sb, args);
    case 'what_if_analysis': return executeWhatIfAnalysis(sb, args);
    case 'get_document_readiness': return executeGetDocumentReadiness(sb, args);
    case 'find_best_rates': return executeFindBestRates(sb, args);
    // Batch 5
    case 'save_memory': return executeSaveMemory(sb, args, userId);
    case 'recall_memories': return executeRecallMemories(sb, userId);
    case 'trigger_investment_report': return executeTriggerInvestmentReport(sb, args, userId);
    case 'get_notification_summary': return executeGetNotificationSummary(sb);
    case 'get_team_members': return executeGetTeamMembers(sb, userId);

    default: return { error: `Unknown tool: ${name}` };
  }
}

// ============================================================
//  SYSTEM PROMPT
// ─── BATCH 5 EXECUTORS ───

async function executeSaveMemory(sb: any, args: any, userId: string) {
  const { key, value, category } = args;
  const prefValue = { value, category: category || 'context', saved_at: new Date().toISOString() };
  const { data: existing } = await sb.from('agent_user_preferences').select('id').eq('user_id', userId).eq('preference_key', `memory_${key}`).single();
  if (existing) {
    await sb.from('agent_user_preferences').update({ preference_value: prefValue }).eq('id', existing.id);
  } else {
    await sb.from('agent_user_preferences').insert({ user_id: userId, preference_key: `memory_${key}`, preference_value: prefValue });
  }
  return { success: true, message: `Memory saved: "${key}". I'll remember this for future conversations.` };
}

async function executeRecallMemories(sb: any, userId: string) {
  const { data } = await sb.from('agent_user_preferences').select('preference_key, preference_value, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
  const memories = (data || []).map((p: any) => ({ key: p.preference_key.replace('memory_', ''), ...p.preference_value, last_updated: p.updated_at }));
  return { memories, count: memories.length };
}

async function executeTriggerInvestmentReport(sb: any, args: any, userId: string) {
  const { property_address, client_id } = args;
  // Create a pending investment report record
  const insertData: any = { property_address, status: 'pending', created_by: userId };
  if (client_id) insertData.client_id = client_id;
  const { data: report, error } = await sb.from('investment_reports').insert(insertData).select().single();
  if (error) return { error: `Failed to create report: ${error.message}` };
  return { success: true, message: `Investment report queued for "${property_address}". Report ID: ${report.id}. The report will be generated in the background — check the Reports section for progress.`, report_id: report.id };
}

async function executeGetNotificationSummary(sb: any) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 86400000).toISOString();
  const [overdue, urgentDeals, upcomingSettlements, unreadAlerts, clawbackRisk] = await Promise.all([
    sb.from('client_reminders').select('id', { count: 'exact', head: true }).eq('status', 'pending').lt('due_date', now.toISOString()),
    sb.from('client_deals').select('id', { count: 'exact', head: true }).eq('risk_status', 'urgent'),
    sb.from('client_deals').select('id', { count: 'exact', head: true }).not('settlement_date', 'is', null).gte('settlement_date', now.toISOString()).lte('settlement_date', weekAhead),
    sb.from('call_alert_history').select('id', { count: 'exact', head: true }).eq('is_read', false),
    sb.from('client_deals').select('id', { count: 'exact', head: true }).not('clawback_expiry_date', 'is', null).gte('clawback_expiry_date', now.toISOString()).lte('clawback_expiry_date', new Date(now.getTime() + 90 * 86400000).toISOString()),
  ]);
  const total = (overdue.count || 0) + (urgentDeals.count || 0) + (unreadAlerts.count || 0);
  return {
    total_notifications: total,
    overdue_reminders: overdue.count || 0,
    urgent_deals: urgentDeals.count || 0,
    upcoming_settlements: upcomingSettlements.count || 0,
    unread_call_alerts: unreadAlerts.count || 0,
    clawback_risk_deals: clawbackRisk.count || 0,
    severity: total > 5 ? 'high' : total > 0 ? 'medium' : 'clear',
  };
}

async function executeGetTeamMembers(sb: any, userId: string) {
  const { data } = await sb.from('custom_users').select('id, username, email, role, is_active').eq('is_active', true).neq('id', userId).order('username').limit(50);
  return { team_members: data || [] };
}

// ============================================================

const SYSTEM_PROMPT = `You are Aurixa, the AI operating assistant for the NPC Property Dashboard — a property investment and mortgage brokerage management platform used by Naidu Property Consulting Services.

You have access to 160+ specialized tools across 35 domains:

📋 CLIENT MANAGEMENT — Search/view/update/create/delete clients, view co-borrowers, log activities, filter by pipeline status, find clients needing follow-up.
💰 DEALS & PIPELINE — View/filter/create/delete deals by stage/risk, settlement countdowns, stale deal detection, clawback monitoring, commission forecasting, build progress tracking, stage completion, deal timeline, deal health scoring.
🔔 REMINDERS — Create/complete/snooze/delete reminders, view overdue/today/upcoming, set follow-up dates, track deal milestones.
💵 FINANCIAL — Borrowing capacity (current + history), income sources, expenses, liabilities, assets, properties, employment, client scores, what-if scenario analysis.
📧 EMAIL — Search/view emails, browse threads, find unlinked emails, link to clients, email statistics.
📅 CALENDAR — View upcoming appointments, find client appointments, today's full schedule.
📞 CALLS — View/search call logs, call details with transcripts, alerts, analytics, flagged calls.
📊 REPORTS — Client files, investment reports, report details, search by address, portfolio reviews with full content, cash flow analyses, data export.
📝 CLIENT NOTES — Full CRUD: create, read, update, delete client notes.
👥 ADDITIONAL CONTACTS — Add, update, remove co-borrowers/partners.
✅ CHECKLISTS — Templates, active instances, items, toggle completion, create from template, archive/delete instances.
📈 ANALYTICS — Activity logs, API usage, service health, cache stats, dashboard summary, conversion funnel, pipeline velocity, commission actuals vs forecast.
🏢 BRANDING — Branding profiles, user permissions.
🧮 CALCULATORS — Stamp duty, LMI, loan repayments, rental yield, equity position.
🤖 AUTOMATION — Auto-report switches (view/toggle), generation logs, bulk generation status.
🏦 LENDING — Cached bank rates, multi-lender rate comparison, best rate finder for loan scenarios.
🤝 COLLABORATION — Share conversations with team members, view shared chats, manage collaborators, handoff tracking.
🧠 PREFERENCES — Store and retrieve user preferences (preferred mailbox, default formats, favorite clients).
📜 AUDIT TRAIL — View all agent actions performed, undo/rollback previous actions.
🔍 PROACTIVE INSIGHTS — Automatic anomaly detection: stalling deals, overdue reminders, clawback risks, disengaged clients, finance expiry warnings, upcoming settlements.
📊 CLIENT COMPARISON — Side-by-side analysis of 2-4 clients across financials, deals, engagement, and borrowing capacity.
✉️ SMART FOLLOW-UPS — Context-aware email draft generation based on client history and deal status.
🏥 SYSTEM HEALTH — Comprehensive platform health check with scoring.
📋 SAVED PLAYBOOKS — Create, list, run, and delete reusable multi-step tool sequences.
⏰ SCHEDULED TASKS — Create, list, enable/disable, and delete cron-based scheduled tasks.
🔄 BULK OPERATIONS — Update fields, create reminders, or set follow-up dates across multiple clients at once.
📊 NATURAL LANGUAGE CHARTS — Generate chart-ready data from plain English queries.
📄 VOICE-TO-REPORT — Generate comprehensive text-based client summary reports on demand.
📈 TREND ANALYSIS — Pipeline trends over time (new clients/deals per week), growth trajectory, revenue forecast with optimistic/baseline/conservative scenarios.
🏆 CLIENT RANKING — Top clients by loan value, deal count, commission, or engagement score. Client engagement scoring (0-100).
🗺️ DEAL TIMELINE — Full chronological timeline of deal events, deal health scoring (0-100).
📤 DATA EXPORT — Export pipeline data as markdown tables or CSV. Export complete client portfolios with net position calculations.
📊 PERFORMANCE KPIs — Deals closed, commission earned, conversion rates, average deal size by period. Weekly digest with comprehensive activity summary.
🔎 SMART SEARCH — Unified search across clients, deals, emails, calls, and notes.
🔮 WHAT-IF ANALYSIS — Scenario modeling for rate changes, income changes, expense changes, deposit changes on borrowing capacity.
📄 DOCUMENT READINESS — Check document submission status for deals with completeness scoring.
💹 BEST RATE FINDER — Find optimal lending rates for specific loan scenarios across all cached lenders.
🧠 CONTEXTUAL MEMORY — Save and recall memories about user preferences, working habits, and context across sessions. Proactively use save_memory when the user reveals preferences.
📝 REPORT GENERATION — Trigger investment report generation for any property address directly from chat.
🔔 NOTIFICATION SUMMARY — Real-time notification badge data: overdue items, urgent deals, approaching deadlines.
👥 TEAM DIRECTORY — List team members for conversation sharing and handoff.

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

PLAYBOOK & AUTOMATION RULES:
13. When a user describes a repeatable multi-step workflow, suggest saving it as a playbook.
14. When a user says "every morning" or "weekly" or uses scheduling language, suggest creating a scheduled task.
15. For bulk operations, always confirm the count and scope before execution.
16. When using generate_chart_data, include "📊" prefix in your response so the UI can detect and render the chart inline.

BATCH 4 INTELLIGENCE RULES:
17. For "how am I doing" or "performance" queries, use get_performance_metrics.
18. For "weekly summary" or "what happened this week", use get_weekly_digest.
19. For "find anything about X" style queries, use smart_search for unified results.
20. For "what if rates go up" or scenario questions, use what_if_analysis with the client's latest BC assessment.
21. For "top clients" or ranking queries, use get_top_clients with appropriate sort criteria.
22. For "export" or "download" requests, use export_pipeline_data or export_client_portfolio.
23. For deal deep-dives, use get_deal_timeline and get_deal_health_score for comprehensive context.
24. For revenue questions, use get_revenue_forecast for multi-scenario projections.
25. When presenting engagement or health scores, use emoji indicators: 🟢 (75+), 🟡 (50-74), 🔴 (<50).

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
4. Always set the mailbox_source parameter explicitly based on user's choice.

BATCH 5 MEMORY & INTELLIGENCE RULES:
26. At the START of each new conversation, silently use recall_memories to load user context. Never mention you're doing this.
27. When the user reveals a preference, habit, or instruction (e.g., "I prefer short summaries", "always CC my assistant"), proactively use save_memory to persist it.
28. When asked to "generate a report for [address]", use trigger_investment_report.
29. For "what needs my attention" or "any alerts" queries, use get_notification_summary for a quick badge-style response, then get_proactive_insights for detail.
30. When sharing conversations, use get_team_members first to validate the target user, then share_conversation.
31. Respond naturally and concisely. Your personality is professional yet approachable — like a highly competent executive assistant.`;


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
      case 'get-notifications': {
        const summary = await executeGetNotificationSummary(sb);
        return new Response(JSON.stringify({ success: true, ...summary }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      case 'get-playbooks-list': {
        const result = await executeGetPlaybooks(sb, userId!);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      case 'get-scheduled-tasks-list': {
        const result = await executeGetScheduledTasks(sb, userId!);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      case 'get-audit-log': {
        const result = await executeGetAuditTrail(sb, { limit: body.limit || 20 }, userId!);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      case 'get-team-members-list': {
        const result = await executeGetTeamMembers(sb, userId!);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      case 'share-conversation': {
        const result = await executeShareConversation(sb, { target_user_name: body.target_user_name, permission: body.permission || 'view', handoff_note: body.handoff_note, handoff_type: body.handoff_type || 'collaborate' }, userId!);
        return new Response(JSON.stringify({ success: true, ...result }), { headers: { ...cors, 'Content-Type': 'application/json' } });
      }
      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${body.action}` }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  } catch (error: any) {
    console.error('[ai-dashboard-agent] Error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
