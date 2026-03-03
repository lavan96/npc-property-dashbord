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
          advance_deal: { type: "boolean", description: "Also advance the deal's current_stage to the next one (default true)" },
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
  'link_email_to_client',
  'toggle_checklist_item', 'create_checklist_instance',
  // New write tools
  'create_client', 'delete_client',
  'create_client_note', 'update_client_note', 'delete_client_note',
  'create_deal', 'delete_deal',
  'add_additional_contact', 'update_additional_contact', 'remove_additional_contact',
  'toggle_auto_report_switch',
  'delete_checklist_instance',
  'delete_client_file',
  'complete_deal_stage',
];

// ============================================================
//  TOOL EXECUTORS
// ============================================================

// ─── CLIENT MANAGEMENT ───

async function executeSearchClients(sb: any, args: any) {
  const q = `%${args.query}%`;
  const { data, error } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, created_at')
    .or(`primary_first_name.ilike.${q},primary_surname.ilike.${q},primary_email.ilike.${q},primary_mobile.ilike.${q}`)
    .limit(10);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No clients found matching the query." };
  return data.map((c: any) => ({
    id: c.id, name: `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim(),
    email: c.primary_email, mobile: c.primary_mobile, pipeline_status: c.pipeline_status, follow_up_date: c.follow_up_date,
  }));
}

async function executeGetClientDetails(sb: any, args: any) {
  const { data, error } = await sb.from('clients')
    .select('*')
    .eq('id', args.client_id)
    .single();
  if (error) return { error: error.message };
  if (!data) return { message: "Client not found." };
  return {
    id: data.id,
    name: `${data.primary_first_name || ''} ${data.primary_surname || ''}`.trim(),
    email: data.primary_email, secondary_email: data.secondary_email,
    mobile: data.primary_mobile, dob: data.primary_dob,
    address: data.current_address, residential_status: data.residential_status,
    living_situation: data.living_situation, dependants: data.number_of_dependants,
    pipeline_status: data.pipeline_status, pipeline_notes: data.pipeline_notes,
    referral_source: data.referral_source, follow_up_date: data.follow_up_date,
    borrowing_capacity: data.borrowing_capacity,
    created_at: data.created_at,
  };
}

async function executeGetClientAdditionalContacts(sb: any, args: any) {
  const { data, error } = await sb.from('client_additional_contacts')
    .select('*').eq('client_id', args.client_id).order('display_order', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No additional contacts found." };
  return data.map((c: any) => ({
    id: c.id, name: `${c.first_name} ${c.surname}`, relationship: c.relationship,
    email: c.email, mobile: c.mobile, dob: c.dob,
    current_address: c.current_address, same_address: c.same_address_as_primary,
  }));
}

async function executeUpdateClientField(sb: any, args: any) {
  const allowed = ['primary_email', 'secondary_email', 'primary_mobile', 'current_address', 'pipeline_status', 'pipeline_notes', 'residential_status', 'living_situation', 'number_of_dependants', 'referral_source'];
  if (!allowed.includes(args.field)) return { error: `Field '${args.field}' is not allowed for update.` };
  const { error } = await sb.from('clients').update({ [args.field]: args.value }).eq('id', args.client_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Client ${args.field} updated to "${args.value}".` };
}

async function executeGetClientActivities(sb: any, args: any) {
  const { data, error } = await sb.from('client_activities')
    .select('id, title, description, activity_type, created_at, created_by')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No activities found." };
  return data;
}

async function executeLogClientActivity(sb: any, args: any, userId: string) {
  // Look up custom_users id to satisfy FK constraint
  let createdBy: string | null = null;
  if (userId && userId !== 'service_role') {
    const { data: cu } = await sb.from('custom_users').select('id').eq('id', userId).maybeSingle();
    if (cu) createdBy = cu.id;
  }
  const { error } = await sb.from('client_activities').insert({
    client_id: args.client_id, title: args.title,
    description: args.description || null, activity_type: args.activity_type,
    created_by: createdBy,
  });
  if (error) return { error: error.message };
  return { success: true, message: `✅ Activity "${args.title}" logged.` };
}

// ─── DEALS & PIPELINE ───

async function executeGetClientDeals(sb: any, args: any) {
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, current_stage, current_stage_number, risk_status, property_address, loan_amount, settlement_date, lodgement_date, conditional_approval_date, formal_approval_date, finance_clause_expiry, commission_estimate, responsible_person, notes, created_at, updated_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No deals found for this client." };
  return data;
}

async function executeGetPipelineOverview(sb: any) {
  const { data: deals, error } = await sb.from('client_deals')
    .select('id, deal_type, current_stage, risk_status, settlement_date, loan_amount, commission_estimate, client_id, clients:client_id(primary_first_name, primary_surname)')
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
  if (!deals?.length) return { message: "No deals in the pipeline." };

  const stageGroups: Record<string, any> = {};
  let atRisk = 0; const upcoming: any[] = [];
  const now = new Date(); const thirtyD = new Date(now.getTime() + 30*86400000);

  for (const d of deals) {
    const s = d.current_stage || 'Unknown';
    if (!stageGroups[s]) stageGroups[s] = { count: 0, value: 0 };
    stageGroups[s].count++; stageGroups[s].value += d.loan_amount || 0;
    if (['needs_follow_up','urgent'].includes(d.risk_status)) atRisk++;
    if (d.settlement_date) {
      const sd = new Date(d.settlement_date);
      if (sd >= now && sd <= thirtyD) upcoming.push({
        deal_id: d.id, client: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown',
        settlement_date: d.settlement_date, loan_amount: d.loan_amount,
      });
    }
  }
  return {
    total_deals: deals.length, by_stage: stageGroups, at_risk_count: atRisk,
    upcoming_settlements_30d: upcoming.sort((a:any,b:any)=>new Date(a.settlement_date).getTime()-new Date(b.settlement_date).getTime()),
    total_pipeline_value: deals.reduce((s:number,d:any)=>s+(d.loan_amount||0),0),
    total_commission: deals.reduce((s:number,d:any)=>s+(d.commission_estimate||0),0),
  };
}

async function executeGetDealsByStage(sb: any, args: any) {
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, current_stage, risk_status, property_address, loan_amount, settlement_date, client_id, clients:client_id(primary_first_name, primary_surname)')
    .ilike('current_stage', `%${args.stage}%`);
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No deals found at stage "${args.stage}".` };
  return data.map((d:any)=>({ ...d, client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined }));
}

async function executeGetDealsByRisk(sb: any, args: any) {
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, current_stage, risk_status, property_address, loan_amount, settlement_date, client_id, clients:client_id(primary_first_name, primary_surname)')
    .eq('risk_status', args.risk_status);
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No deals with risk status "${args.risk_status}".` };
  return data.map((d:any)=>({ ...d, client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined }));
}

async function executeGetSettlementCountdown(sb: any, args: any) {
  const days = args.days || 30;
  const now = new Date(); const future = new Date(now.getTime() + days*86400000);
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, property_address, loan_amount, settlement_date, client_id, clients:client_id(primary_first_name, primary_surname)')
    .gte('settlement_date', now.toISOString()).lte('settlement_date', future.toISOString())
    .order('settlement_date', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No settlements in the next ${days} days.` };
  return data.map((d:any)=>{
    const daysLeft = Math.ceil((new Date(d.settlement_date).getTime()-now.getTime())/86400000);
    return { ...d, days_until_settlement: daysLeft, client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined };
  });
}

async function executeGetStaleDeals(sb: any, args: any) {
  const threshold = args.days_threshold || 14;
  const cutoff = new Date(Date.now() - threshold*86400000).toISOString();
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, current_stage, property_address, loan_amount, updated_at, client_id, clients:client_id(primary_first_name, primary_surname)')
    .lt('updated_at', cutoff)
    .order('updated_at', { ascending: true }).limit(20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No stale deals found (threshold: ${threshold} days).` };
  return data.map((d:any)=>{
    const daysSince = Math.floor((Date.now()-new Date(d.updated_at).getTime())/86400000);
    return { ...d, days_since_update: daysSince, client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined };
  });
}

async function executeUpdateDealStage(sb: any, args: any) {
  const updates: any = {};
  if (args.new_stage) updates.current_stage = args.new_stage;
  if (args.new_stage_number) updates.current_stage_number = args.new_stage_number;
  const { error } = await sb.from('client_deals').update(updates).eq('id', args.deal_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Deal stage updated${args.new_stage ? ` to "${args.new_stage}"` : ''}.` };
}

async function executeUpdateDealRiskStatus(sb: any, args: any) {
  const { error } = await sb.from('client_deals').update({ risk_status: args.risk_status }).eq('id', args.deal_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Deal risk status changed to "${args.risk_status}".` };
}

async function executeUpdateDealField(sb: any, args: any) {
  const allowed = ['responsible_person', 'notes', 'settlement_date', 'finance_clause_expiry', 'property_address', 'loan_amount', 'commission_estimate', 'valuation_completed', 'land_settlement_date', 'expected_build_start', 'estimated_completion'];
  if (!allowed.includes(args.field)) return { error: `Field '${args.field}' not allowed.` };
  let val: any = args.value;
  if (['loan_amount','commission_estimate'].includes(args.field)) val = parseFloat(val);
  if (args.field === 'valuation_completed') val = val === 'true';
  const { error } = await sb.from('client_deals').update({ [args.field]: val }).eq('id', args.deal_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Deal ${args.field} updated.` };
}

async function executeGetClawbackMonitor(sb: any) {
  const now = new Date().toISOString();
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, property_address, clawback_expiry_date, clawback_period_months, commission_estimate, settlement_date, client_id, clients:client_id(primary_first_name, primary_surname)')
    .not('clawback_expiry_date', 'is', null).gte('clawback_expiry_date', now)
    .order('clawback_expiry_date', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No active clawback risks found." };
  return data.map((d:any)=>{
    const daysLeft = Math.ceil((new Date(d.clawback_expiry_date).getTime()-Date.now())/86400000);
    return { ...d, days_until_expiry: daysLeft, client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined };
  });
}

async function executeGetCommissionForecast(sb: any, args: any) {
  const months = args.months_ahead || 6;
  const now = new Date(); const future = new Date(now.getTime() + months*30*86400000);
  const { data, error } = await sb.from('client_deals')
    .select('id, settlement_date, commission_estimate, deal_type, property_address, clients:client_id(primary_first_name, primary_surname)')
    .not('commission_estimate', 'is', null).gte('settlement_date', now.toISOString()).lte('settlement_date', future.toISOString())
    .order('settlement_date', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No commission expected in the forecast period." };

  const byMonth: Record<string,{total:number,deals:number}> = {};
  for (const d of data) {
    const m = d.settlement_date.substring(0,7);
    if (!byMonth[m]) byMonth[m] = {total:0,deals:0};
    byMonth[m].total += d.commission_estimate || 0;
    byMonth[m].deals++;
  }
  return { forecast_by_month: byMonth, total_forecast: data.reduce((s:number,d:any)=>s+(d.commission_estimate||0),0), deal_count: data.length };
}

async function executeGetBuildProgress(sb: any, args: any) {
  const { data, error } = await sb.from('build_progress_payments')
    .select('*').eq('deal_id', args.deal_id).order('display_order', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No build progress payments found for this deal." };
  return data;
}

async function executeUpdateBuildPayment(sb: any, args: any) {
  const updates: any = { [args.field]: args.value };
  // Map boolean fields to their corresponding date columns
  const dateFieldMap: Record<string, string> = {
    builder_invoice_received: 'builder_invoice_date',
    submitted_to_lender: 'submitted_to_lender_date',
    funds_released: 'funds_released_date',
    paid_to_builder: 'paid_to_builder_date',
  };
  if (args.value && dateFieldMap[args.field]) {
    updates[dateFieldMap[args.field]] = new Date().toISOString();
  } else if (!args.value && dateFieldMap[args.field]) {
    updates[dateFieldMap[args.field]] = null;
  }
  const { error } = await sb.from('build_progress_payments').update(updates).eq('id', args.payment_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Build payment ${args.field} updated to ${args.value}.` };
}

async function executeGetBuilderInvoices(sb: any, args: any) {
  let query = sb.from('builder_invoices').select('*').order('created_at', { ascending: false }).limit(30);
  if (args.deal_id) query = query.eq('deal_id', args.deal_id);
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No builder invoices found." };
  return data;
}

// ─── REMINDERS & FOLLOW-UPS ───

async function executeGetClientReminders(sb: any, args: any) {
  let query = sb.from('client_reminders')
    .select('id, title, description, due_date, priority, status, client_id, reminder_type, created_at, clients:client_id(primary_first_name, primary_surname)')
    .neq('status', 'completed').order('due_date', { ascending: true }).limit(20);
  if (args.client_id) query = query.eq('client_id', args.client_id);
  else query = query.lt('due_date', new Date().toISOString());
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: args.client_id ? "No active reminders for this client." : "No overdue reminders." };
  return data.map((r:any)=>({ id: r.id, title: r.title, description: r.description, due_date: r.due_date, priority: r.priority, type: r.reminder_type, client: r.clients ? `${r.clients.primary_first_name||''} ${r.clients.primary_surname||''}`.trim() : null }));
}

async function executeGetAllReminders(sb: any, args: any) {
  const { data, error } = await sb.from('client_reminders')
    .select('id, title, description, due_date, priority, status, client_id, reminder_type, clients:client_id(primary_first_name, primary_surname)')
    .neq('status', 'completed').order('due_date', { ascending: true }).limit(50);
  if (error) return { error: error.message };

  const now = new Date(); const today = now.toISOString().substring(0,10);
  const overdue: any[] = []; const todayItems: any[] = []; const upcoming: any[] = [];
  for (const r of (data || [])) {
    const rDate = r.due_date?.substring(0,10);
    const item = { ...r, client_name: r.clients ? `${r.clients.primary_first_name||''} ${r.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined };
    if (rDate < today) overdue.push(item);
    else if (rDate === today) todayItems.push(item);
    else upcoming.push(item);
  }
  return { overdue: overdue.length, today: todayItems.length, upcoming: upcoming.length, items: { overdue, today: todayItems, upcoming } };
}

async function executeGetOverdueReminders(sb: any) {
  const { data, error } = await sb.from('client_reminders')
    .select('id, title, description, due_date, priority, client_id, reminder_type, clients:client_id(primary_first_name, primary_surname)')
    .eq('status', 'pending').lt('due_date', new Date().toISOString())
    .order('due_date', { ascending: true }).limit(30);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No overdue reminders! 🎉" };
  return data.map((r:any)=>({
    ...r, days_overdue: Math.floor((Date.now()-new Date(r.due_date).getTime())/86400000),
    client_name: r.clients ? `${r.clients.primary_first_name||''} ${r.clients.primary_surname||''}`.trim() : 'Unknown', clients: undefined,
  }));
}

async function executeCreateReminder(sb: any, args: any, userId: string) {
  // Look up custom_users id to satisfy FK constraint on created_by
  let createdBy: string | null = null;
  if (userId && userId !== 'service_role') {
    const { data: cu } = await sb.from('custom_users').select('id').eq('id', userId).maybeSingle();
    if (cu) createdBy = cu.id;
  }
  const { error } = await sb.from('client_reminders').insert({
    client_id: args.client_id, title: args.title, description: args.description || null,
    due_date: args.due_date, priority: args.priority || 'medium', status: 'pending',
    reminder_type: args.reminder_type || 'task', created_by: createdBy,
  });
  if (error) return { error: error.message };
  return { success: true, message: `✅ Reminder "${args.title}" created.` };
}

async function executeUpdateReminder(sb: any, args: any) {
  if (args.action === 'complete') {
    const { error } = await sb.from('client_reminders').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', args.reminder_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Reminder completed.` };
  } else if (args.action === 'snooze') {
    const d = new Date(); d.setDate(d.getDate() + (args.snooze_days || 1));
    const { error } = await sb.from('client_reminders').update({ due_date: d.toISOString() }).eq('id', args.reminder_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Reminder snoozed by ${args.snooze_days || 1} day(s).` };
  } else if (args.action === 'dismiss') {
    const { error } = await sb.from('client_reminders').update({ status: 'dismissed' }).eq('id', args.reminder_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Reminder dismissed.` };
  }
  return { error: "Unknown action" };
}

async function executeDeleteReminder(sb: any, args: any) {
  const { error } = await sb.from('client_reminders').delete().eq('id', args.reminder_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Reminder deleted.` };
}

async function executeSetFollowUpDate(sb: any, args: any) {
  const { error } = await sb.from('clients').update({ follow_up_date: args.follow_up_date }).eq('id', args.client_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Follow-up date set to ${args.follow_up_date}.` };
}

async function executeGetUpcomingMilestones(sb: any, args: any) {
  const days = args.days_ahead || 30;
  const now = new Date(); const future = new Date(now.getTime() + days*86400000);
  const { data, error } = await sb.from('client_deals')
    .select('id, deal_type, property_address, settlement_date, finance_clause_expiry, land_settlement_date, expected_build_start, estimated_completion, clawback_expiry_date, client_id, clients:client_id(primary_first_name, primary_surname)');
  if (error) return { error: error.message };

  const milestones: any[] = [];
  const fields = [
    { key: 'settlement_date', label: 'Settlement', priority: 'high' },
    { key: 'finance_clause_expiry', label: 'Finance Clause Expiry', priority: 'high' },
    { key: 'land_settlement_date', label: 'Land Settlement', priority: 'high' },
    { key: 'expected_build_start', label: 'Build Start', priority: 'medium' },
    { key: 'estimated_completion', label: 'Completion', priority: 'medium' },
    { key: 'clawback_expiry_date', label: 'Clawback Expiry', priority: 'high' },
  ];

  for (const d of (data||[])) {
    for (const f of fields) {
      const val = d[f.key];
      if (!val) continue;
      const dt = new Date(val);
      if (dt >= now && dt <= future) {
        milestones.push({
          deal_id: d.id, type: f.label, date: val, priority: f.priority,
          days_away: Math.ceil((dt.getTime()-now.getTime())/86400000),
          property: d.property_address, deal_type: d.deal_type,
          client_name: d.clients ? `${d.clients.primary_first_name||''} ${d.clients.primary_surname||''}`.trim() : 'Unknown',
        });
      }
    }
  }
  milestones.sort((a,b) => a.days_away - b.days_away);
  if (!milestones.length) return { message: `No milestones in the next ${days} days.` };
  return milestones;
}

// ─── FINANCIAL DATA ───

async function executeGetBorrowingCapacity(sb: any, args: any) {
  const { data, error } = await sb.from('borrowing_capacity_assessments')
    .select('id, borrowing_capacity, gross_annual_income, shaded_annual_income, living_expenses_monthly, existing_commitments_monthly, monthly_surplus, serviceability_band, interest_rate_used, buffer_rate, loan_term_years, stress_tested_capacity, dti_ratio, net_purchase_capacity, lmi_amount, lmi_mode, proposed_loan_amount, proposed_lvr, warnings, recommendations, created_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { message: "No borrowing capacity assessment found." };
  return { ...data, borrowing_capacity_formatted: `$${(data.borrowing_capacity||0).toLocaleString()}` };
}

async function executeGetBCHistory(sb: any, args: any) {
  const { data, error } = await sb.from('borrowing_capacity_assessments')
    .select('id, borrowing_capacity, serviceability_band, gross_annual_income, monthly_surplus, dti_ratio, created_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(10);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No BC history found." };
  return data;
}

async function executeGetIncomeSources(sb: any, args: any) {
  const { data, error } = await sb.from('client_income_sources')
    .select('*').eq('client_id', args.client_id).order('created_at', { ascending: false });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No income sources recorded." };
  return data;
}

async function executeGetClientExpenses(sb: any, args: any) {
  const { data, error } = await sb.from('client_expenses')
    .select('*').eq('client_id', args.client_id).order('expense_category', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No expenses recorded." };
  const total = data.reduce((s:number,e:any) => s + (e.monthly_amount || 0), 0);
  return { expenses: data, total_monthly: total };
}

async function executeGetClientLiabilities(sb: any, args: any) {
  const { data, error } = await sb.from('client_liabilities')
    .select('*').eq('client_id', args.client_id);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No liabilities recorded." };
  return data;
}

async function executeGetClientAssets(sb: any, args: any) {
  const { data, error } = await sb.from('client_assets')
    .select('*').eq('client_id', args.client_id);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No assets recorded." };
  return data;
}

async function executeGetClientProperties(sb: any, args: any) {
  const { data, error } = await sb.from('client_properties')
    .select('*').eq('client_id', args.client_id);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No properties recorded." };
  return data;
}

async function executeGetEmploymentDetails(sb: any, args: any) {
  const { data, error } = await sb.from('client_employment')
    .select('*').eq('client_id', args.client_id).order('is_current', { ascending: false });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No employment records." };
  return data;
}

// ─── EMAIL & COMMUNICATIONS ───

async function executeGetClientEmails(sb: any, args: any) {
  const { data, error } = await sb.from('email_copilot_emails')
    .select('id, subject, sender, received_at, body, status, mailbox_source')
    .eq('client_id', args.client_id).order('received_at', { ascending: false }).limit(args.limit || 15);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No emails found." };
  return data.map((e:any)=>({ id: e.id, subject: e.subject, from: e.sender, date: e.received_at, preview: e.body?.substring(0,150), status: e.status }));
}

async function executeSearchEmails(sb: any, args: any) {
  const q = `%${args.query}%`;
  const { data, error } = await sb.from('email_copilot_emails')
    .select('id, subject, sender, received_at, body, client_id')
    .or(`subject.ilike.${q},sender.ilike.${q},body.ilike.${q}`)
    .order('received_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No emails matching the search." };
  return data.map((e:any)=>({ id: e.id, subject: e.subject, from: e.sender, date: e.received_at, preview: e.body?.substring(0,150), client_id: e.client_id }));
}

async function executeGetEmailThread(sb: any, args: any) {
  const { data, error } = await sb.from('email_copilot_emails')
    .select('id, subject, sender, to_recipients, received_at, body, status')
    .eq('conversation_id', args.conversation_id).order('received_at', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No emails in this thread." };
  return data.map((e:any)=>({ id: e.id, subject: e.subject, from: e.sender, to: e.to_recipients, date: e.received_at, preview: e.body?.substring(0,200), status: e.status }));
}

async function executeGetUnlinkedEmails(sb: any, args: any) {
  const { data, error } = await sb.from('email_copilot_emails')
    .select('id, subject, sender, received_at, body')
    .is('client_id', null).order('received_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No unlinked emails." };
  return data.map((e:any)=>({ id: e.id, subject: e.subject, from: e.sender, date: e.received_at, preview: e.body?.substring(0,150) }));
}

async function executeLinkEmailToClient(sb: any, args: any) {
  const { error } = await sb.from('email_copilot_emails').update({ client_id: args.client_id }).eq('id', args.email_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Email linked to client.` };
}

// ─── CALENDAR & APPOINTMENTS ───

async function executeGetUpcomingCalendar(sb: any, args: any) {
  const days = Math.min(args.days_ahead || 7, 30);
  const now = new Date(); const future = new Date(now.getTime() + days*86400000);
  const { data, error } = await sb.from('appointment_secondary_recipients')
    .select('id, appointment_title, appointment_start, appointment_end, appointment_type, contact_name, contact_email, calendar_name, appointment_notes')
    .gte('appointment_start', now.toISOString()).lte('appointment_start', future.toISOString())
    .order('appointment_start', { ascending: true }).limit(20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No appointments in the next ${days} days.` };
  return data.map((a:any)=>({ id: a.id, title: a.appointment_title, start: a.appointment_start, end: a.appointment_end, type: a.appointment_type, contact: a.contact_name, email: a.contact_email, calendar: a.calendar_name, notes: a.appointment_notes?.substring(0,200) }));
}

async function executeGetAppointmentsForClient(sb: any, args: any) {
  // Get client email first
  const { data: client } = await sb.from('clients').select('primary_email').eq('id', args.client_id).single();
  if (!client?.primary_email) return { message: "Client has no email — cannot match appointments." };
  const { data, error } = await sb.from('appointment_secondary_recipients')
    .select('id, appointment_title, appointment_start, appointment_end, appointment_type, contact_name, calendar_name')
    .eq('contact_email', client.primary_email).order('appointment_start', { ascending: false }).limit(20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No appointments found for this client." };
  return data;
}

// ─── CALL LOGS & VOICE AI ───

async function executeGetRecentCalls(sb: any, args: any) {
  let query = sb.from('vapi_call_logs')
    .select('id, call_id, agent_name, customer_phone, call_duration_seconds, ended_reason, sentiment, sentiment_score, created_at')
    .order('created_at', { ascending: false }).limit(args.limit || 20);
  if (args.agent_name) query = query.ilike('agent_name', `%${args.agent_name}%`);
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No call logs found." };
  return data;
}

async function executeGetCallDetails(sb: any, args: any) {
  const { data, error } = await sb.from('vapi_call_logs')
    .select('*').eq('id', args.call_id).single();
  if (error) return { error: error.message };
  if (!data) return { message: "Call not found." };
  return {
    id: data.id, agent: data.agent_name, phone: data.customer_phone,
    duration: data.call_duration_seconds, outcome: data.ended_reason,
    sentiment: data.sentiment, severity: data.severity_score,
    summary: data.call_summary, transcript: data.transcript?.substring(0, 3000),
    root_cause: data.root_cause_category, created_at: data.created_at,
  };
}

async function executeSearchCalls(sb: any, args: any) {
  const q = `%${args.query}%`;
  const { data, error } = await sb.from('vapi_call_logs')
    .select('id, agent_name, customer_phone, call_duration_seconds, ended_reason, sentiment, call_summary, created_at')
    .or(`transcript.ilike.${q},agent_name.ilike.${q},customer_phone.ilike.${q},call_summary.ilike.${q}`)
    .order('created_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No calls matching the search." };
  return data;
}

async function executeGetCallAlerts(sb: any, args: any) {
  let query = sb.from('call_alert_history')
    .select('id, rule_name, message, is_positive, is_read, triggered_at, call_id')
    .order('triggered_at', { ascending: false }).limit(args.limit || 20);
  if (args.unread_only) query = query.eq('is_read', false);
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No call alerts found." };
  return data;
}

async function executeGetCallAnalytics(sb: any, args: any) {
  const days = args.days_back || 30;
  const since = new Date(Date.now() - days*86400000).toISOString();
  const { data, error } = await sb.from('vapi_call_logs')
    .select('id, agent_name, call_duration_seconds, ended_reason, sentiment, sentiment_score, created_at')
    .gte('created_at', since);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No calls in this period." };

  const total = data.length;
  const avgDuration = Math.round(data.reduce((s:number,c:any)=>s+(c.call_duration_seconds||0),0)/total);
  const sentiments: Record<string,number> = {};
  const agents: Record<string,number> = {};
  for (const c of data) {
    sentiments[c.sentiment||'unknown'] = (sentiments[c.sentiment||'unknown']||0)+1;
    agents[c.agent_name||'unknown'] = (agents[c.agent_name||'unknown']||0)+1;
  }
  return { total_calls: total, avg_duration_seconds: avgDuration, sentiment_breakdown: sentiments, by_agent: agents, period_days: days };
}

async function executeGetFlaggedCalls(sb: any, args: any) {
  const { data, error } = await sb.from('vapi_call_logs')
    .select('id, agent_name, customer_phone, call_duration_seconds, ended_reason, sentiment, severity_score, call_summary, created_at')
    .or('severity_score.gte.4,sentiment.eq.negative')
    .order('severity_score', { ascending: false }).limit(args.limit || 10);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No flagged calls found. 🎉" };
  return data;
}

// ─── REPORTS & DOCUMENTS ───

async function executeGetClientFiles(sb: any, args: any) {
  const { data, error } = await sb.from('client_files')
    .select('id, file_name, file_type, report_type, is_vownet_form, created_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(30);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No files found." };
  return data;
}

async function executeGetInvestmentReports(sb: any, args: any) {
  let query = sb.from('investment_reports')
    .select('id, property_address, status, quality_score, created_at, suburb, state, property_specs')
    .order('created_at', { ascending: false }).limit(args.limit || 10);
  if (args.client_id) {
    // Filter by client_id via client_files junction
    const { data: files } = await sb.from('client_files').select('metadata').eq('client_id', args.client_id).eq('report_type', 'investment');
    // fallback: just return recent reports
  }
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No investment reports found." };
  return data.map((r:any)=>({ id: r.id, address: r.property_address, suburb: r.suburb, state: r.state, status: r.status, quality: r.quality_score, created: r.created_at }));
}

async function executeGetReportDetails(sb: any, args: any) {
  const { data, error } = await sb.from('investment_reports')
    .select('id, property_address, suburb, state, status, quality_score, property_specs, financial_calculations, demographics_data, created_at')
    .eq('id', args.report_id).single();
  if (error) return { error: error.message };
  if (!data) return { message: "Report not found." };
  return data;
}

async function executeSearchReportsByAddress(sb: any, args: any) {
  const { data, error } = await sb.from('investment_reports')
    .select('id, property_address, suburb, state, status, quality_score, created_at')
    .ilike('property_address', `%${args.address}%`).limit(10);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No reports matching that address." };
  return data;
}

async function executeGetPortfolioReviews(sb: any, args: any) {
  const { data, error } = await sb.from('portfolio_analysis_reports')
    .select('id, report_title, created_at, updated_at')
    .eq('client_id', args.client_id).order('created_at', { ascending: false });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No portfolio reviews found." };
  return data;
}

// ─── CHECKLISTS & OPERATIONS ───

async function executeGetChecklistTemplates(sb: any) {
  const { data, error } = await sb.from('checklist_templates')
    .select('id, name, description, icon, is_active, cron_enabled, cron_description, created_at')
    .order('name', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No checklist templates found." };
  return data;
}

async function executeGetActiveChecklists(sb: any, args: any) {
  let query = sb.from('checklist_instances')
    .select('id, name, description, status, progress_percent, icon, created_at, completed_at')
    .order('created_at', { ascending: false }).limit(20);
  if (args.status) query = query.eq('status', args.status);
  else query = query.eq('status', 'active');
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No active checklists." };
  return data;
}

async function executeGetChecklistItems(sb: any, args: any) {
  const { data, error } = await sb.from('checklist_instance_items')
    .select('id, label, is_checked, section_title, section_order, display_order, checked_at, checked_by')
    .eq('instance_id', args.instance_id).order('section_order', { ascending: true }).order('display_order', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No items in this checklist." };
  const total = data.length; const checked = data.filter((i:any)=>i.is_checked).length;
  return { items: data, total, checked, progress: Math.round((checked/total)*100) };
}

async function executeToggleChecklistItem(sb: any, args: any, userId: string) {
  const { error } = await sb.from('checklist_instance_items').update({
    is_checked: args.is_checked,
    checked_at: args.is_checked ? new Date().toISOString() : null,
    checked_by: args.is_checked ? userId : null,
  }).eq('id', args.item_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Checklist item ${args.is_checked ? 'checked' : 'unchecked'}.` };
}

async function executeCreateChecklistInstance(sb: any, args: any, userId: string) {
  // Get template
  const { data: template } = await sb.from('checklist_templates').select('id, name, description, icon').eq('id', args.template_id).single();
  if (!template) return { error: "Template not found." };
  // Create instance
  // generated_by is a text field (no FK), safe to store userId directly
  const { data: instance, error: insError } = await sb.from('checklist_instances').insert({
    template_id: template.id, name: template.name, description: template.description,
    icon: template.icon, status: 'active', progress_percent: 0, generated_by: userId !== 'service_role' ? userId : null,
  }).select().single();
  if (insError) return { error: insError.message };
  // Copy items from template sections
  const { data: sections } = await sb.from('checklist_template_sections').select('id, title, icon, display_order').eq('template_id', template.id).order('display_order');
  for (const sec of (sections||[])) {
    const { data: items } = await sb.from('checklist_template_items').select('label, display_order, is_pre_checked').eq('section_id', sec.id).order('display_order');
    const inserts = (items||[]).map((item:any)=>({
      instance_id: instance.id, label: item.label, section_title: sec.title,
      section_icon: sec.icon, section_order: sec.display_order, display_order: item.display_order,
      is_checked: item.is_pre_checked || false,
    }));
    if (inserts.length) await sb.from('checklist_instance_items').insert(inserts);
  }
  return { success: true, message: `✅ Checklist "${template.name}" created with ${(sections||[]).length} sections.` };
}

// ─── ANALYTICS & SYSTEM ───

async function executeGetRecentActivity(sb: any, args: any) {
  const limit = Math.min(args.limit || 20, 50);
  let query = sb.from('activity_logs')
    .select('id, action_type, entity_type, entity_name, username, created_at, metadata')
    .order('created_at', { ascending: false }).limit(limit);
  if (args.entity_type) query = query.eq('entity_type', args.entity_type);
  const { data, error } = await query;
  if (error) return { error: error.message };
  return data || [];
}

async function executeGetApiUsageStats(sb: any, args: any) {
  const days = args.days_back || 7;
  const since = new Date(Date.now() - days*86400000).toISOString();
  const { data, error } = await sb.from('api_usage_log')
    .select('service_name, model_used, tokens_used, prompt_tokens, completion_tokens, cost_estimate_usd, response_time_ms, created_at')
    .gte('created_at', since);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No API usage in this period." };

  const byService: Record<string,{calls:number,tokens:number,cost:number}> = {};
  for (const r of data) {
    const svc = r.service_name || 'unknown';
    if (!byService[svc]) byService[svc] = {calls:0,tokens:0,cost:0};
    byService[svc].calls++; byService[svc].tokens += r.tokens_used||0; byService[svc].cost += r.cost_estimate_usd||0;
  }
  return { period_days: days, total_requests: data.length, by_service: byService };
}

async function executeGetApiHealth(sb: any, args: any) {
  const days = args.days_back || 7;
  const since = new Date(Date.now() - days*86400000).toISOString();
  const { data, error } = await sb.from('api_health_log')
    .select('service_name, status, response_time_ms, data_quality, error_message, created_at')
    .gte('created_at', since).order('created_at', { ascending: false }).limit(200);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No health data available." };

  const byService: Record<string,{total:number,success:number,errors:number,avg_ms:number}> = {};
  for (const r of data) {
    const svc = r.service_name;
    if (!byService[svc]) byService[svc] = {total:0,success:0,errors:0,avg_ms:0};
    byService[svc].total++;
    if (r.status === 'success') byService[svc].success++; else byService[svc].errors++;
    byService[svc].avg_ms += r.response_time_ms||0;
  }
  for (const svc of Object.keys(byService)) byService[svc].avg_ms = Math.round(byService[svc].avg_ms / byService[svc].total);
  return { period_days: days, services: byService };
}

async function executeGetCacheStatistics(sb: any) {
  try {
    const { data, error } = await sb.rpc('get_all_cache_stats');
    if (error) return { error: error.message };
    return data || [];
  } catch { return { message: "Cache statistics function not available." }; }
}

async function executeGetDashboardSummary(sb: any) {
  const [clientsRes, dealsRes, remindersRes, settlementsRes] = await Promise.all([
    sb.from('clients').select('id', { count: 'exact', head: true }),
    sb.from('client_deals').select('id, risk_status, current_stage', { count: 'exact' }),
    sb.from('client_reminders').select('id, due_date', { count: 'exact' }).eq('status', 'pending'),
    sb.from('client_deals').select('id, settlement_date').not('settlement_date', 'is', null)
      .gte('settlement_date', new Date().toISOString())
      .lte('settlement_date', new Date(Date.now()+7*86400000).toISOString()),
  ]);

  const now = new Date().toISOString().substring(0,10);
  const overdueReminders = (remindersRes.data||[]).filter((r:any) => r.due_date?.substring(0,10) < now).length;
  const todayReminders = (remindersRes.data||[]).filter((r:any) => r.due_date?.substring(0,10) === now).length;
  const atRiskDeals = (dealsRes.data||[]).filter((d:any) => ['needs_follow_up','urgent'].includes(d.risk_status)).length;

  return {
    total_clients: clientsRes.count || 0,
    total_deals: dealsRes.count || 0,
    at_risk_deals: atRiskDeals,
    overdue_reminders: overdueReminders,
    today_reminders: todayReminders,
    settlements_this_week: settlementsRes.data?.length || 0,
    date: now,
  };
}

// ─── BRANDING & SETTINGS ───

async function executeGetBrandingProfiles(sb: any) {
  const { data, error } = await sb.from('client_branding_profiles')
    .select('id, client_name, primary_color, secondary_color, accent_color, font_family, is_default, is_active, created_at')
    .order('client_name');
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No branding profiles configured." };
  return data;
}

async function executeGetUserPermissions(sb: any, args: any) {
  const userId = args.user_id;
  const { data: user } = await sb.from('custom_users').select('id, username, role').eq('id', userId).single();
  if (!user) return { message: "User not found." };
  if (user.role === 'superadmin') return { user: user.username, role: 'superadmin', access: 'full' };
  const { data: perms } = await sb.from('user_permissions').select('module_key, can_view, can_edit, can_delete').eq('user_id', userId);
  return { user: user.username, role: user.role, permissions: perms || [] };
}

// ═══════════════════════════════════════════════════════════
//  NEW TOOL EXECUTORS — Batch expansion (34 tools)
// ═══════════════════════════════════════════════════════════

// ─── CLIENT CREATION & LIFECYCLE ───

async function executeCreateClient(sb: any, args: any, userId: string) {
  let createdBy: string | null = null;
  if (userId && userId !== 'service_role') {
    const { data: cu } = await sb.from('custom_users').select('id').eq('id', userId).maybeSingle();
    if (cu) createdBy = cu.id;
  }
  const { data, error } = await sb.from('clients').insert({
    primary_first_name: args.first_name,
    primary_surname: args.surname,
    primary_email: args.email || null,
    primary_mobile: args.mobile || null,
    pipeline_status: args.pipeline_status || 'lead',
    created_by: createdBy,
  }).select('id, primary_first_name, primary_surname').single();
  if (error) return { error: error.message };
  return { success: true, message: `✅ Client "${args.first_name} ${args.surname}" created.`, client_id: data.id };
}

async function executeDeleteClient(sb: any, args: any) {
  const { error } = await sb.from('clients').delete().eq('id', args.client_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Client and all associated records deleted.` };
}

async function executeGetClientsByPipelineStatus(sb: any, args: any) {
  const { data, error } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, primary_email, primary_mobile, pipeline_status, follow_up_date, created_at')
    .eq('pipeline_status', args.status)
    .order('created_at', { ascending: false }).limit(args.limit || 30);
  if (error) return { error: error.message };
  if (!data?.length) return { message: `No clients with pipeline status "${args.status}".` };
  return data.map((c: any) => ({
    id: c.id, name: `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim(),
    email: c.primary_email, mobile: c.primary_mobile, pipeline_status: c.pipeline_status,
    follow_up_date: c.follow_up_date, created_at: c.created_at,
  }));
}

async function executeGetClientsNeedingFollowUp(sb: any, args: any) {
  const daysInactive = args.days_inactive || 14;
  const cutoff = new Date(Date.now() - daysInactive * 86400000).toISOString();
  const now = new Date().toISOString();
  
  // Get clients with overdue follow-up dates
  const { data: overdue } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, pipeline_status, follow_up_date')
    .not('follow_up_date', 'is', null).lt('follow_up_date', now)
    .order('follow_up_date', { ascending: true }).limit(20);
  
  // Get clients with no recent activity
  const { data: inactive } = await sb.from('clients')
    .select('id, primary_first_name, primary_surname, pipeline_status, pipeline_updated_at')
    .lt('pipeline_updated_at', cutoff)
    .not('pipeline_status', 'in', '(settled,lost,archived)')
    .order('pipeline_updated_at', { ascending: true }).limit(20);
  
  const formatClients = (list: any[]) => (list || []).map((c: any) => ({
    id: c.id, name: `${c.primary_first_name || ''} ${c.primary_surname || ''}`.trim(),
    pipeline_status: c.pipeline_status, follow_up_date: c.follow_up_date || null,
    last_update: c.pipeline_updated_at || null,
  }));
  
  return {
    overdue_follow_ups: formatClients(overdue || []),
    inactive_clients: formatClients(inactive || []),
    total: (overdue?.length || 0) + (inactive?.length || 0),
  };
}

// ─── CLIENT NOTES CRUD ───

async function executeGetClientNotes(sb: any, args: any) {
  const { data, error } = await sb.from('client_notes')
    .select('id, content, note_type, created_at, updated_at, created_by')
    .eq('client_id', args.client_id).order('created_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No notes found for this client." };
  return data;
}

async function executeCreateClientNote(sb: any, args: any, userId: string) {
  let createdBy: string | null = null;
  if (userId && userId !== 'service_role') {
    const { data: cu } = await sb.from('custom_users').select('id').eq('id', userId).maybeSingle();
    if (cu) createdBy = cu.id;
  }
  const { error } = await sb.from('client_notes').insert({
    client_id: args.client_id, content: args.content,
    note_type: args.note_type || 'general', created_by: createdBy,
  });
  if (error) return { error: error.message };
  return { success: true, message: `✅ Note added to client.` };
}

async function executeUpdateClientNote(sb: any, args: any) {
  const { error } = await sb.from('client_notes').update({ content: args.content }).eq('id', args.note_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Note updated.` };
}

async function executeDeleteClientNote(sb: any, args: any) {
  const { error } = await sb.from('client_notes').delete().eq('id', args.note_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Note deleted.` };
}

// ─── CLIENT SCORES & REVIEWS ───

async function executeGetClientScore(sb: any, args: any) {
  const { data, error } = await sb.from('client_scores')
    .select('*').eq('client_id', args.client_id).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { message: "No score data found for this client." };
  return {
    overall_score: data.overall_score, risk_level: data.risk_level,
    cash_flow_score: data.cash_flow_score, growth_potential: data.growth_potential,
    portfolio_health: data.portfolio_health, risk_factors: data.risk_factors,
    calculation_notes: data.calculation_notes, last_calculated: data.last_calculated_at,
  };
}

async function executeGetPortfolioReviewDetails(sb: any, args: any) {
  const { data, error } = await sb.from('portfolio_analysis_reports')
    .select('*').eq('id', args.review_id).single();
  if (error) return { error: error.message };
  if (!data) return { message: "Portfolio review not found." };
  return data;
}

// ─── DEAL CREATION & DELETION ───

async function executeCreateDeal(sb: any, args: any, userId: string) {
  let createdBy: string | null = null;
  if (userId && userId !== 'service_role') {
    const { data: cu } = await sb.from('custom_users').select('id').eq('id', userId).maybeSingle();
    if (cu) createdBy = cu.id;
  }
  const initialStage = args.deal_type === 'existing_property'
    ? 'Initial Holding Deposit (0.25%)'
    : args.deal_type === 'house_and_land'
    ? 'Lot Secured'
    : 'Client Engaged (Exclusive)';

  const { data, error } = await sb.from('client_deals').insert({
    client_id: args.client_id,
    deal_type: args.deal_type,
    current_stage: initialStage,
    current_stage_number: 1,
    property_address: args.property_address || null,
    loan_amount: args.loan_amount || null,
    created_by: createdBy,
  }).select('id').single();
  if (error) return { error: error.message };
  return { success: true, message: `✅ ${args.deal_type.replace(/_/g,' ')} deal created.`, deal_id: data.id };
}

async function executeDeleteDeal(sb: any, args: any) {
  // Delete child records first (stages, build payments)
  await sb.from('deal_stages').delete().eq('deal_id', args.deal_id);
  await sb.from('build_progress_payments').delete().eq('deal_id', args.deal_id);
  await sb.from('builder_invoices').delete().eq('deal_id', args.deal_id);
  const { error } = await sb.from('client_deals').delete().eq('id', args.deal_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Deal and all associated stages/payments deleted.` };
}

// ─── PIPELINE ANALYTICS ───

async function executeGetConversionFunnel(sb: any, args: any) {
  let query = sb.from('deal_stages')
    .select('stage_name, stage_number, status, deal_id, client_deals!inner(deal_type)')
    .order('stage_number', { ascending: true });
  
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No deal stage data available." };
  
  const stageStats: Record<string, { total: number; completed: number }> = {};
  for (const s of data) {
    if (args.deal_type && s.client_deals?.deal_type !== args.deal_type) continue;
    const name = s.stage_name;
    if (!stageStats[name]) stageStats[name] = { total: 0, completed: 0 };
    stageStats[name].total++;
    if (s.status === 'complete') stageStats[name].completed++;
  }
  
  const funnel = Object.entries(stageStats).map(([name, stats]) => ({
    stage: name, total: stats.total, completed: stats.completed,
    conversion_rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) + '%' : '0%',
  }));
  return { funnel, deal_type_filter: args.deal_type || 'all' };
}

async function executeGetPipelineVelocity(sb: any) {
  const { data, error } = await sb.from('deal_stages')
    .select('stage_name, stage_number, status, created_at, completed_at:checked_at')
    .eq('status', 'complete');
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No completed stages to analyze." };
  
  const stageAvg: Record<string, { totalDays: number; count: number }> = {};
  for (const s of data) {
    if (!s.completed_at || !s.created_at) continue;
    const days = Math.max(0, Math.floor((new Date(s.completed_at).getTime() - new Date(s.created_at).getTime()) / 86400000));
    if (!stageAvg[s.stage_name]) stageAvg[s.stage_name] = { totalDays: 0, count: 0 };
    stageAvg[s.stage_name].totalDays += days;
    stageAvg[s.stage_name].count++;
  }
  
  const velocity = Object.entries(stageAvg)
    .map(([name, stats]) => ({ stage: name, avg_days: Math.round(stats.totalDays / stats.count), sample_size: stats.count }))
    .sort((a, b) => b.avg_days - a.avg_days);
  
  const bottleneck = velocity.length > 0 ? velocity[0] : null;
  return { velocity, bottleneck: bottleneck ? `"${bottleneck.stage}" averages ${bottleneck.avg_days} days` : 'No data', total_stages_analyzed: data.length };
}

async function executeGetCommissionActuals(sb: any, args: any) {
  const months = args.months_back || 6;
  const since = new Date(Date.now() - months * 30 * 86400000).toISOString();
  const { data, error } = await sb.from('build_progress_payments')
    .select('commission_amount, commission_received, commission_received_date, stage_name, deal_id')
    .eq('commission_received', true).gte('commission_received_date', since);
  if (error) return { error: error.message };
  
  const received = (data || []).reduce((s: number, p: any) => s + (p.commission_amount || 0), 0);
  
  const { data: forecast } = await sb.from('client_deals')
    .select('commission_estimate, settlement_date')
    .gte('settlement_date', since).not('commission_estimate', 'is', null);
  const forecasted = (forecast || []).reduce((s: number, d: any) => s + (d.commission_estimate || 0), 0);
  
  return {
    actual_received: received, forecasted: forecasted,
    variance: received - forecasted,
    variance_pct: forecasted > 0 ? Math.round((received / forecasted) * 100) + '%' : 'N/A',
    period_months: months, payments_count: data?.length || 0,
  };
}

// ─── ADDITIONAL CONTACTS ───

async function executeAddAdditionalContact(sb: any, args: any) {
  const { data: maxOrder } = await sb.from('client_additional_contacts')
    .select('display_order').eq('client_id', args.client_id)
    .order('display_order', { ascending: false }).limit(1).maybeSingle();
  const nextOrder = (maxOrder?.display_order || 0) + 1;
  
  const { error } = await sb.from('client_additional_contacts').insert({
    client_id: args.client_id, first_name: args.first_name, surname: args.surname,
    relationship: args.relationship || 'co_borrower',
    email: args.email || null, mobile: args.mobile || null, dob: args.dob || null,
    display_order: nextOrder,
  });
  if (error) return { error: error.message };
  return { success: true, message: `✅ ${args.first_name} ${args.surname} added as ${args.relationship || 'co-borrower'}.` };
}

async function executeUpdateAdditionalContact(sb: any, args: any) {
  const allowed = ['first_name', 'surname', 'email', 'mobile', 'dob', 'relationship', 'current_address', 'gender', 'notes'];
  if (!allowed.includes(args.field)) return { error: `Field '${args.field}' not allowed for update.` };
  const { error } = await sb.from('client_additional_contacts').update({ [args.field]: args.value }).eq('id', args.contact_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Contact ${args.field} updated.` };
}

async function executeRemoveAdditionalContact(sb: any, args: any) {
  const { error } = await sb.from('client_additional_contacts').delete().eq('id', args.contact_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Additional contact removed.` };
}

// ─── CASH FLOW ANALYSIS ───

async function executeGetCashFlowAnalysis(sb: any, args: any) {
  let query = sb.from('cash_flow_analyses')
    .select('id, primary_report_id, comparison_report_ids, investor_profile, created_at, updated_at')
    .order('created_at', { ascending: false }).limit(args.limit || 5);
  if (args.report_id) query = query.eq('primary_report_id', args.report_id);
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No cash flow analyses found." };
  return data;
}

// ─── AUTOMATION & AUTO-REPORTS ───

async function executeGetAutoReportSwitches(sb: any) {
  const { data, error } = await sb.from('auto_report_switches')
    .select('id, name, description, is_enabled, criteria, priority, created_at, updated_at')
    .order('priority', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No automation switches configured." };
  return data;
}

async function executeToggleAutoReportSwitch(sb: any, args: any) {
  const { error } = await sb.from('auto_report_switches')
    .update({ is_enabled: args.is_enabled }).eq('id', args.switch_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ Switch ${args.is_enabled ? 'enabled' : 'disabled'}.` };
}

async function executeGetAutoReportLog(sb: any, args: any) {
  const { data, error } = await sb.from('auto_report_generation_log')
    .select('id, listing_address, listing_id, status, error_message, switch_name, created_at, completed_at')
    .order('created_at', { ascending: false }).limit(args.limit || 20);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No auto-report generation logs found." };
  return data;
}

// ─── CHECKLIST MANAGEMENT ───

async function executeDeleteChecklistInstance(sb: any, args: any) {
  const action = args.action || 'archive';
  if (action === 'archive') {
    const { error } = await sb.from('checklist_instances').update({ status: 'archived' }).eq('id', args.instance_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Checklist archived.` };
  } else {
    await sb.from('checklist_instance_items').delete().eq('instance_id', args.instance_id);
    const { error } = await sb.from('checklist_instances').delete().eq('id', args.instance_id);
    if (error) return { error: error.message };
    return { success: true, message: `✅ Checklist permanently deleted.` };
  }
}

// ─── CALENDAR ENHANCEMENTS ───

async function executeGetTodaysSchedule(sb: any) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
  
  // Appointments
  const { data: appts } = await sb.from('appointment_secondary_recipients')
    .select('appointment_title, appointment_start, appointment_end, contact_name, appointment_type')
    .gte('appointment_start', todayStart).lt('appointment_start', todayEnd)
    .order('appointment_start', { ascending: true });
  
  // Reminders due today
  const { data: reminders } = await sb.from('client_reminders')
    .select('title, priority, client_id, clients:client_id(primary_first_name, primary_surname)')
    .gte('due_date', todayStart).lt('due_date', todayEnd).eq('status', 'pending');
  
  // Settlements today
  const { data: settlements } = await sb.from('client_deals')
    .select('property_address, loan_amount, client_id, clients:client_id(primary_first_name, primary_surname)')
    .gte('settlement_date', todayStart).lt('settlement_date', todayEnd);
  
  return {
    appointments: (appts || []).map((a: any) => ({ title: a.appointment_title, start: a.appointment_start, end: a.appointment_end, contact: a.contact_name, type: a.appointment_type })),
    reminders: (reminders || []).map((r: any) => ({ title: r.title, priority: r.priority, client: r.clients ? `${r.clients.primary_first_name||''} ${r.clients.primary_surname||''}`.trim() : null })),
    settlements: (settlements || []).map((s: any) => ({ address: s.property_address, amount: s.loan_amount, client: s.clients ? `${s.clients.primary_first_name||''} ${s.clients.primary_surname||''}`.trim() : null })),
    total_items: (appts?.length || 0) + (reminders?.length || 0) + (settlements?.length || 0),
  };
}

// ─── CLIENT FILE MANAGEMENT ───

async function executeDeleteClientFile(sb: any, args: any) {
  const { error } = await sb.from('client_files').delete().eq('id', args.file_id);
  if (error) return { error: error.message };
  return { success: true, message: `✅ File record removed.` };
}

// ─── BULK OPERATIONS ───

async function executeGetBulkGenerationStatus(sb: any, args: any) {
  const { data, error } = await sb.from('bulk_generation_jobs')
    .select('id, status, total_reports, completed_reports, failed_reports, created_at, completed_at, error_message')
    .order('created_at', { ascending: false }).limit(args.limit || 5);
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No bulk generation jobs found." };
  return data;
}

// ─── LENDING RATES ───

async function executeGetLendingRates(sb: any, args: any) {
  let query = sb.from('bank_lending_rates_cache')
    .select('lender_id, lender_name, rates, fetched_at, expires_at')
    .order('lender_name', { ascending: true });
  if (args.lender_name) query = query.ilike('lender_name', `%${args.lender_name}%`);
  const { data, error } = await query;
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No lending rates cached." };
  return data;
}

async function executeCompareLenderRates(sb: any, args: any) {
  const { data, error } = await sb.from('bank_lending_rates_cache')
    .select('lender_name, rates, fetched_at')
    .order('lender_name', { ascending: true });
  if (error) return { error: error.message };
  if (!data?.length) return { message: "No lending rates available for comparison." };
  
  const comparison = data.map((l: any) => {
    const rates = l.rates || {};
    return {
      lender: l.lender_name,
      rates_summary: typeof rates === 'object' ? rates : {},
      fetched: l.fetched_at,
    };
  });
  return { lenders: comparison, loan_amount: args.loan_amount || null, count: data.length };
}

// ─── DEAL STAGE COMPLETION ───

async function executeCompleteDealStage(sb: any, args: any) {
  // Get the stage details
  const { data: stage, error: stageErr } = await sb.from('deal_stages')
    .select('id, deal_id, stage_name, stage_number, status')
    .eq('id', args.stage_id).single();
  if (stageErr || !stage) return { error: stageErr?.message || 'Stage not found.' };
  
  // Mark complete
  const { error: upErr } = await sb.from('deal_stages').update({
    status: 'complete',
  }).eq('id', args.stage_id);
  if (upErr) return { error: upErr.message };
  
  const advance = args.advance_deal !== false;
  if (advance) {
    // Find the next stage
    const { data: nextStage } = await sb.from('deal_stages')
      .select('stage_name, stage_number')
      .eq('deal_id', stage.deal_id)
      .gt('stage_number', stage.stage_number)
      .order('stage_number', { ascending: true }).limit(1).maybeSingle();
    
    if (nextStage) {
      await sb.from('client_deals').update({
        current_stage: nextStage.stage_name,
        current_stage_number: nextStage.stage_number,
      }).eq('id', stage.deal_id);
      return { success: true, message: `✅ Stage "${stage.stage_name}" completed. Deal advanced to "${nextStage.stage_name}".` };
    }
  }
  return { success: true, message: `✅ Stage "${stage.stage_name}" marked complete.` };
}

// ─── EMAIL STATS ───

async function executeGetEmailStats(sb: any) {
  const { count: total } = await sb.from('email_copilot_emails').select('id', { count: 'exact', head: true });
  const { count: unread } = await sb.from('email_copilot_emails').select('id', { count: 'exact', head: true }).eq('is_read', false);
  const { count: unlinked } = await sb.from('email_copilot_emails').select('id', { count: 'exact', head: true }).is('client_id', null);
  
  const { data: sources } = await sb.from('email_copilot_emails')
    .select('mailbox_source');
  const bySource: Record<string, number> = {};
  for (const e of (sources || [])) {
    const src = e.mailbox_source || 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;
  }
  
  return { total: total || 0, unread: unread || 0, unlinked: unlinked || 0, by_mailbox: bySource };
}

// ─── CALCULATORS (pure compute, no DB) ───

function executeCalculateStampDuty(args: any) {
  const v = args.property_value;
  const state = args.state;
  // Simplified Australian stamp duty brackets (approximate)
  let duty = 0;
  switch (state) {
    case 'NSW':
      if (v <= 16000) duty = v * 0.0125;
      else if (v <= 35000) duty = 200 + (v-16000)*0.015;
      else if (v <= 93000) duty = 485 + (v-35000)*0.0175;
      else if (v <= 351000) duty = 1500 + (v-93000)*0.035;
      else if (v <= 1168000) duty = 10530 + (v-351000)*0.045;
      else duty = 10530 + (v-351000)*0.055;
      if (args.is_investment) duty *= 1.08; // surcharge approx
      if (args.is_first_home_buyer && v <= 800000) duty = Math.max(0, duty - duty * Math.min(1, (800000-v)/100000));
      break;
    case 'VIC':
      if (v <= 25000) duty = v * 0.014;
      else if (v <= 130000) duty = 350 + (v-25000)*0.024;
      else if (v <= 960000) duty = 2870 + (v-130000)*0.06;
      else duty = 2870 + (v-130000)*0.055;
      break;
    case 'QLD':
      if (v <= 5000) duty = 0;
      else if (v <= 75000) duty = (v-5000)*0.015;
      else if (v <= 540000) duty = 1050 + (v-75000)*0.035;
      else if (v <= 1000000) duty = 17325 + (v-540000)*0.045;
      else duty = 17325 + (v-540000)*0.0575;
      if (args.is_first_home_buyer && v <= 550000) duty = 0;
      break;
    default:
      // Generic fallback
      duty = v * 0.04;
  }
  return { state, property_value: v, stamp_duty: Math.round(duty), is_first_home_buyer: !!args.is_first_home_buyer, is_investment: !!args.is_investment, note: "Approximate calculation. Consult state revenue office for exact amounts." };
}

function executeCalculateLMI(args: any) {
  const lvr = (args.loan_amount / args.property_value) * 100;
  if (lvr <= 80) return { lvr: lvr.toFixed(1), lmi_required: false, lmi_estimate: 0, message: "LVR is 80% or below — no LMI required." };
  // Approximate LMI rates
  let rate = 0;
  if (lvr <= 85) rate = 0.007;
  else if (lvr <= 90) rate = 0.015;
  else if (lvr <= 95) rate = 0.035;
  else rate = 0.05;
  if (args.is_first_home_buyer) rate *= 0.85; // FHB discount
  const lmi = Math.round(args.loan_amount * rate);
  return { lvr: lvr.toFixed(1), lmi_required: true, lmi_estimate: lmi, property_value: args.property_value, loan_amount: args.loan_amount, note: "Approximate LMI. Actual premium varies by insurer." };
}

function executeCalculateLoanRepayment(args: any) {
  const P = args.loan_amount;
  const r = args.interest_rate / 100 / 12;
  const n = args.loan_term_years * 12;
  const type = args.repayment_type || 'pi';

  let monthly = 0;
  if (type === 'io') {
    monthly = P * r;
  } else {
    monthly = P * (r * Math.pow(1+r, n)) / (Math.pow(1+r, n) - 1);
  }
  const totalPayment = monthly * n;
  const totalInterest = totalPayment - (type === 'pi' ? P : 0);

  return {
    loan_amount: P, interest_rate: args.interest_rate, term_years: args.loan_term_years, type,
    monthly_repayment: Math.round(monthly), fortnightly: Math.round(monthly * 12 / 26), weekly: Math.round(monthly * 12 / 52),
    total_repayment: Math.round(totalPayment), total_interest: Math.round(totalInterest),
  };
}

function executeCalculateRentalYield(args: any) {
  const annualRent = args.weekly_rent * 52;
  const gross = (annualRent / args.property_value) * 100;
  const netRent = annualRent - (args.annual_expenses || 0);
  const net = (netRent / args.property_value) * 100;
  return {
    property_value: args.property_value, weekly_rent: args.weekly_rent,
    annual_rent: annualRent, gross_yield: gross.toFixed(2) + '%',
    net_yield: net.toFixed(2) + '%', annual_expenses: args.annual_expenses || 0,
  };
}

function executeCalculateEquityPosition(args: any) {
  const targetLvr = (args.target_lvr || 80) / 100;
  const maxBorrow = args.property_value * targetLvr;
  const availableEquity = maxBorrow - args.current_loan_balance;
  const currentLvr = (args.current_loan_balance / args.property_value) * 100;
  return {
    property_value: args.property_value, current_loan: args.current_loan_balance,
    current_lvr: currentLvr.toFixed(1) + '%', target_lvr: (targetLvr*100) + '%',
    max_borrowable: Math.round(maxBorrow),
    available_equity: Math.max(0, Math.round(availableEquity)),
    equity_available: availableEquity > 0,
  };
}

// ============================================================
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

    default: return { error: `Unknown tool: ${name}` };
  }
}

// ============================================================
//  SYSTEM PROMPT
// ============================================================

const SYSTEM_PROMPT = `You are Aurixa, the AI operating assistant for the NPC Property Dashboard — a property investment and mortgage brokerage management platform used by Naidu Property Consulting Services.

You have access to 105 specialized tools across 16 domains:

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
12. For financial overviews, combine borrowing capacity + income + expenses + liabilities for a complete picture.`;

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
  const { data, error } = await sb.from('agent_conversations').select('id, title, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false }).limit(50);
  if (error) throw error;
  return new Response(JSON.stringify({ success: true, conversations: data || [] }), { headers: { ...cors, 'Content-Type': 'application/json' } });
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

  await sb.from('agent_messages').insert({ conversation_id, role: 'user', content: message });

  const { data: history } = await sb.from('agent_messages')
    .select('role, content, tool_calls, tool_results')
    .eq('conversation_id', conversation_id).order('created_at', { ascending: true }).limit(30);

  const messages: any[] = [
    { role: 'system', content: SYSTEM_PROMPT + `\n\nCurrent user: ${username} (ID: ${userId})\nCurrent time: ${new Date().toISOString()}` },
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

  // Auto-title
  const { data: msgCount } = await sb.from('agent_messages').select('id', { count: 'exact', head: true }).eq('conversation_id', conversation_id);
  if (msgCount !== null && (msgCount as any)?.length <= 2) {
    const title = message.length > 60 ? message.substring(0, 57) + '...' : message;
    await sb.from('agent_conversations').update({ title }).eq('id', conversation_id);
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
