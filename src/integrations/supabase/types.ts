export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      abs_census_cache: {
        Row: {
          created_at: string
          data: Json
          data_quality: string
          dataset: string
          expires_at: string
          fetched_at: string
          id: string
          postcode: string
          state: string
        }
        Insert: {
          created_at?: string
          data: Json
          data_quality?: string
          dataset: string
          expires_at?: string
          fetched_at?: string
          id?: string
          postcode: string
          state: string
        }
        Update: {
          created_at?: string
          data?: Json
          data_quality?: string
          dataset?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          postcode?: string
          state?: string
        }
        Relationships: []
      }
      activity_logs: {
        Row: {
          action_type: Database["public"]["Enums"]["activity_action_type"]
          created_at: string
          entity_id: string | null
          entity_name: string | null
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
          username: string | null
        }
        Insert: {
          action_type: Database["public"]["Enums"]["activity_action_type"]
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Update: {
          action_type?: Database["public"]["Enums"]["activity_action_type"]
          created_at?: string
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: Database["public"]["Enums"]["activity_entity_type"]
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      api_health_log: {
        Row: {
          created_at: string
          data_quality: string | null
          endpoint: string | null
          error_message: string | null
          id: string
          response_time_ms: number | null
          service_name: string
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          data_quality?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_name: string
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          data_quality?: string | null
          endpoint?: string | null
          error_message?: string | null
          id?: string
          response_time_ms?: number | null
          service_name?: string
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      auto_report_generation_log: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          listing_address: string
          listing_id: string
          report_id: string | null
          status: string
          switch_id: string | null
          switch_name: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          listing_address: string
          listing_id: string
          report_id?: string | null
          status?: string
          switch_id?: string | null
          switch_name?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          listing_address?: string
          listing_id?: string
          report_id?: string | null
          status?: string
          switch_id?: string | null
          switch_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_report_generation_log_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_report_generation_log_switch_id_fkey"
            columns: ["switch_id"]
            isOneToOne: false
            referencedRelation: "auto_report_switches"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_report_master_settings: {
        Row: {
          id: string
          is_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          is_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_report_master_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_report_processed_listings: {
        Row: {
          id: string
          listing_address: string | null
          listing_id: string
          processed_at: string
          report_id: string | null
          skip_reason: string | null
          skipped: boolean
          switch_id: string | null
        }
        Insert: {
          id?: string
          listing_address?: string | null
          listing_id: string
          processed_at?: string
          report_id?: string | null
          skip_reason?: string | null
          skipped?: boolean
          switch_id?: string | null
        }
        Update: {
          id?: string
          listing_address?: string | null
          listing_id?: string
          processed_at?: string
          report_id?: string | null
          skip_reason?: string | null
          skipped?: boolean
          switch_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auto_report_processed_listings_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_report_processed_listings_switch_id_fkey"
            columns: ["switch_id"]
            isOneToOne: false
            referencedRelation: "auto_report_switches"
            referencedColumns: ["id"]
          },
        ]
      }
      auto_report_switches: {
        Row: {
          created_at: string
          created_by: string | null
          criteria: Json
          description: string | null
          id: string
          is_enabled: boolean
          name: string
          priority: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          is_enabled?: boolean
          name: string
          priority?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criteria?: Json
          description?: string | null
          id?: string
          is_enabled?: boolean
          name?: string
          priority?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_report_switches_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_lending_rates_cache: {
        Row: {
          created_at: string
          expires_at: string
          fetched_at: string
          lender_id: string
          lender_name: string
          rates: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          fetched_at?: string
          lender_id: string
          lender_name: string
          rates?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          fetched_at?: string
          lender_id?: string
          lender_name?: string
          rates?: Json
          updated_at?: string
        }
        Relationships: []
      }
      borrowing_capacity_assessments: {
        Row: {
          assessment_rate: number | null
          assumptions: Json | null
          borrowing_capacity: number
          buffer_rate: number | null
          calculated_by: string | null
          client_id: string
          created_at: string
          dti_ratio: number | null
          existing_commitments_monthly: number
          expense_breakdown: Json | null
          expense_method: string | null
          gross_annual_income: number
          id: string
          income_breakdown: Json | null
          interest_rate_used: number | null
          liability_breakdown: Json | null
          living_expenses_monthly: number
          loan_term_years: number | null
          monthly_surplus: number
          proposed_loan_amount: number | null
          proposed_lvr: number | null
          recommendations: Json | null
          serviceability_band: string
          shaded_annual_income: number
          stress_tested_capacity: number | null
          updated_at: string
          warnings: string[] | null
        }
        Insert: {
          assessment_rate?: number | null
          assumptions?: Json | null
          borrowing_capacity?: number
          buffer_rate?: number | null
          calculated_by?: string | null
          client_id: string
          created_at?: string
          dti_ratio?: number | null
          existing_commitments_monthly?: number
          expense_breakdown?: Json | null
          expense_method?: string | null
          gross_annual_income?: number
          id?: string
          income_breakdown?: Json | null
          interest_rate_used?: number | null
          liability_breakdown?: Json | null
          living_expenses_monthly?: number
          loan_term_years?: number | null
          monthly_surplus?: number
          proposed_loan_amount?: number | null
          proposed_lvr?: number | null
          recommendations?: Json | null
          serviceability_band?: string
          shaded_annual_income?: number
          stress_tested_capacity?: number | null
          updated_at?: string
          warnings?: string[] | null
        }
        Update: {
          assessment_rate?: number | null
          assumptions?: Json | null
          borrowing_capacity?: number
          buffer_rate?: number | null
          calculated_by?: string | null
          client_id?: string
          created_at?: string
          dti_ratio?: number | null
          existing_commitments_monthly?: number
          expense_breakdown?: Json | null
          expense_method?: string | null
          gross_annual_income?: number
          id?: string
          income_breakdown?: Json | null
          interest_rate_used?: number | null
          liability_breakdown?: Json | null
          living_expenses_monthly?: number
          loan_term_years?: number | null
          monthly_surplus?: number
          proposed_loan_amount?: number | null
          proposed_lvr?: number | null
          recommendations?: Json | null
          serviceability_band?: string
          shaded_annual_income?: number
          stress_tested_capacity?: number | null
          updated_at?: string
          warnings?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "borrowing_capacity_assessments_calculated_by_fkey"
            columns: ["calculated_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "borrowing_capacity_assessments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_generation_items: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          job_id: string
          processing_time_seconds: number | null
          property_address: string
          property_listing_id: string
          report_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id: string
          processing_time_seconds?: number | null
          property_address: string
          property_listing_id: string
          report_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          job_id?: string
          processing_time_seconds?: number | null
          property_address?: string
          property_listing_id?: string
          report_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_generation_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "bulk_generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bulk_generation_items_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_generation_jobs: {
        Row: {
          completed_at: string | null
          completed_reports: number
          created_at: string
          created_by: string
          error_message: string | null
          failed_reports: number
          id: string
          property_addresses: string[]
          property_ids: string[]
          started_at: string | null
          status: string
          total_reports: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_reports?: number
          created_at?: string
          created_by: string
          error_message?: string | null
          failed_reports?: number
          id?: string
          property_addresses: string[]
          property_ids: string[]
          started_at?: string | null
          status?: string
          total_reports: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_reports?: number
          created_at?: string
          created_by?: string
          error_message?: string | null
          failed_reports?: number
          id?: string
          property_addresses?: string[]
          property_ids?: string[]
          started_at?: string | null
          status?: string
          total_reports?: number
          updated_at?: string
        }
        Relationships: []
      }
      call_alert_history: {
        Row: {
          call_id: string | null
          id: string
          is_positive: boolean
          is_read: boolean
          message: string
          rule_id: string | null
          rule_name: string
          triggered_at: string
        }
        Insert: {
          call_id?: string | null
          id?: string
          is_positive?: boolean
          is_read?: boolean
          message: string
          rule_id?: string | null
          rule_name: string
          triggered_at?: string
        }
        Update: {
          call_id?: string | null
          id?: string
          is_positive?: boolean
          is_read?: boolean
          message?: string
          rule_id?: string | null
          rule_name?: string
          triggered_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_alert_history_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "vapi_call_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "call_alert_history_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "call_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      call_alert_rules: {
        Row: {
          condition_operator: string
          condition_type: string
          condition_value: string
          created_at: string
          id: string
          is_enabled: boolean
          is_positive: boolean
          name: string
          notification_type: string
          updated_at: string
        }
        Insert: {
          condition_operator: string
          condition_type: string
          condition_value: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_positive?: boolean
          name: string
          notification_type?: string
          updated_at?: string
        }
        Update: {
          condition_operator?: string
          condition_type?: string
          condition_value?: string
          created_at?: string
          id?: string
          is_enabled?: boolean
          is_positive?: boolean
          name?: string
          notification_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      call_tags: {
        Row: {
          color: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      cash_flow_analyses: {
        Row: {
          analysis_data: Json
          comparison_report_ids: string[]
          created_at: string
          created_by: string | null
          id: string
          investor_profile: string | null
          primary_report_id: string
          updated_at: string
        }
        Insert: {
          analysis_data: Json
          comparison_report_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          investor_profile?: string | null
          primary_report_id: string
          updated_at?: string
        }
        Update: {
          analysis_data?: Json
          comparison_report_ids?: string[]
          created_at?: string
          created_by?: string | null
          id?: string
          investor_profile?: string | null
          primary_report_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_flow_analyses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_flow_analyses_primary_report_id_fkey"
            columns: ["primary_report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_analysis: {
        Row: {
          analysis_text: string
          chart_id: string
          confidence_score: number | null
          created_at: string
          id: string
          model_used: string | null
          updated_at: string
        }
        Insert: {
          analysis_text: string
          chart_id: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          model_used?: string | null
          updated_at?: string
        }
        Update: {
          analysis_text?: string
          chart_id?: string
          confidence_score?: number | null
          created_at?: string
          id?: string
          model_used?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_analysis_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "charts"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_configurations: {
        Row: {
          chart_type: string
          created_at: string
          default_styling: Json | null
          id: string
          quickchart_config: Json
          template_name: string
          updated_at: string
        }
        Insert: {
          chart_type: string
          created_at?: string
          default_styling?: Json | null
          id?: string
          quickchart_config: Json
          template_name: string
          updated_at?: string
        }
        Update: {
          chart_type?: string
          created_at?: string
          default_styling?: Json | null
          id?: string
          quickchart_config?: Json
          template_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      charts: {
        Row: {
          chart_config: Json | null
          chart_type: string
          created_at: string
          id: string
          image_data: string
          report_id: string
          title: string
          updated_at: string
        }
        Insert: {
          chart_config?: Json | null
          chart_type: string
          created_at?: string
          id?: string
          image_data: string
          report_id: string
          title: string
          updated_at?: string
        }
        Update: {
          chart_config?: Json | null
          chart_type?: string
          created_at?: string
          id?: string
          image_data?: string
          report_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charts_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "generated_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      client_activities: {
        Row: {
          activity_type: string
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          activity_type: string
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          activity_type?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_activities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_additional_contacts: {
        Row: {
          client_id: string
          created_at: string
          display_order: number
          dob: string | null
          email: string | null
          first_name: string
          gender: string | null
          id: string
          middle_name: string | null
          mobile: string | null
          notes: string | null
          relationship: string
          surname: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          display_order?: number
          dob?: string | null
          email?: string | null
          first_name: string
          gender?: string | null
          id?: string
          middle_name?: string | null
          mobile?: string | null
          notes?: string | null
          relationship?: string
          surname: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          display_order?: number
          dob?: string | null
          email?: string | null
          first_name?: string
          gender?: string | null
          id?: string
          middle_name?: string | null
          mobile?: string | null
          notes?: string | null
          relationship?: string
          surname?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_additional_contacts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assets: {
        Row: {
          asset_type: string
          client_id: string
          created_at: string
          description: string | null
          id: string
          institution_name: string | null
          make_model: string | null
          updated_at: string
          value: number | null
          vehicle_type: string | null
        }
        Insert: {
          asset_type: string
          client_id: string
          created_at?: string
          description?: string | null
          id?: string
          institution_name?: string | null
          make_model?: string | null
          updated_at?: string
          value?: number | null
          vehicle_type?: string | null
        }
        Update: {
          asset_type?: string
          client_id?: string
          created_at?: string
          description?: string | null
          id?: string
          institution_name?: string | null
          make_model?: string | null
          updated_at?: string
          value?: number | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_assets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_branding_profiles: {
        Row: {
          accent_color: string | null
          client_name: string
          created_at: string | null
          created_by: string | null
          font_family: string | null
          footer_style: Json | null
          header_style: Json | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          logo_path: string | null
          primary_color: string | null
          secondary_color: string | null
          updated_at: string | null
        }
        Insert: {
          accent_color?: string | null
          client_name: string
          created_at?: string | null
          created_by?: string | null
          font_family?: string | null
          footer_style?: Json | null
          header_style?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string | null
        }
        Update: {
          accent_color?: string | null
          client_name?: string
          created_at?: string | null
          created_by?: string | null
          font_family?: string | null
          footer_style?: Json | null
          header_style?: Json | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          logo_path?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_branding_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_employment: {
        Row: {
          client_id: string
          contact_type: string
          created_at: string
          employer_name: string | null
          employment_type: string | null
          id: string
          is_current: boolean | null
          occupation_role: string | null
          start_date: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          contact_type?: string
          created_at?: string
          employer_name?: string | null
          employment_type?: string | null
          id?: string
          is_current?: boolean | null
          occupation_role?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          contact_type?: string
          created_at?: string
          employer_name?: string | null
          employment_type?: string | null
          id?: string
          is_current?: boolean | null
          occupation_role?: string | null
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_employment_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_expenses: {
        Row: {
          client_id: string
          created_at: string
          expense_category: string
          expense_name: string | null
          frequency: string | null
          id: string
          is_essential: boolean | null
          monthly_amount: number
          notes: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          expense_category: string
          expense_name?: string | null
          frequency?: string | null
          id?: string
          is_essential?: boolean | null
          monthly_amount?: number
          notes?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          expense_category?: string
          expense_name?: string | null
          frequency?: string | null
          id?: string
          is_essential?: boolean | null
          monthly_amount?: number
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_expenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_files: {
        Row: {
          category: string
          client_id: string
          description: string | null
          document_type: string | null
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          is_vownet_form: boolean | null
          report_type: string | null
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          client_id: string
          description?: string | null
          document_type?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_vownet_form?: boolean | null
          report_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          client_id?: string
          description?: string | null
          document_type?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_vownet_form?: boolean | null
          report_type?: string | null
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_import_logs: {
        Row: {
          clients_created: number | null
          completed_at: string | null
          created_at: string
          errors: Json | null
          file_name: string
          id: string
          imported_by: string | null
          properties_created: number | null
          status: string
        }
        Insert: {
          clients_created?: number | null
          completed_at?: string | null
          created_at?: string
          errors?: Json | null
          file_name: string
          id?: string
          imported_by?: string | null
          properties_created?: number | null
          status?: string
        }
        Update: {
          clients_created?: number | null
          completed_at?: string | null
          created_at?: string
          errors?: Json | null
          file_name?: string
          id?: string
          imported_by?: string | null
          properties_created?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_import_logs_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_income: {
        Row: {
          allowance: number | null
          bonus: number | null
          client_id: string
          commission: number | null
          contact_type: string
          created_at: string
          gross_salary: number | null
          id: string
          other_taxable_income: number | null
          overtime_essential: number | null
          overtime_non_essential: number | null
          salary_frequency: string | null
          updated_at: string
        }
        Insert: {
          allowance?: number | null
          bonus?: number | null
          client_id: string
          commission?: number | null
          contact_type?: string
          created_at?: string
          gross_salary?: number | null
          id?: string
          other_taxable_income?: number | null
          overtime_essential?: number | null
          overtime_non_essential?: number | null
          salary_frequency?: string | null
          updated_at?: string
        }
        Update: {
          allowance?: number | null
          bonus?: number | null
          client_id?: string
          commission?: number | null
          contact_type?: string
          created_at?: string
          gross_salary?: number | null
          id?: string
          other_taxable_income?: number | null
          overtime_essential?: number | null
          overtime_non_essential?: number | null
          salary_frequency?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_income_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_liabilities: {
        Row: {
          client_id: string
          created_at: string
          credit_limit: number | null
          current_balance: number | null
          id: string
          interest_rate: number | null
          liability_type: string
          monthly_repayment: number | null
          provider_name: string | null
          repayment_type: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          interest_rate?: number | null
          liability_type: string
          monthly_repayment?: number | null
          provider_name?: string | null
          repayment_type?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          credit_limit?: number | null
          current_balance?: number | null
          id?: string
          interest_rate?: number | null
          liability_type?: string
          monthly_repayment?: number | null
          provider_name?: string | null
          repayment_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_liabilities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notes: {
        Row: {
          client_id: string
          content: string
          created_at: string
          created_by: string | null
          ghl_note_id: string | null
          id: string
          note_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          content: string
          created_at?: string
          created_by?: string | null
          ghl_note_id?: string | null
          id?: string
          note_type?: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          ghl_note_id?: string | null
          id?: string
          note_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_properties: {
        Row: {
          address: string
          client_id: string
          created_at: string
          id: string
          interest_rate: number | null
          loan_remaining: number | null
          monthly_body_corporate: number | null
          monthly_building_insurance: number | null
          monthly_council_rates: number | null
          monthly_interest_repayment: number | null
          monthly_landlord_insurance: number | null
          monthly_property_management: number | null
          monthly_rental_income: number | null
          monthly_repairs_maintenance: number | null
          monthly_water_rates: number | null
          net_monthly_cashflow: number | null
          ownership_percentage: number | null
          property_type: string
          smsf_abn: string | null
          smsf_auditor_name: string | null
          smsf_compliance_status: string | null
          smsf_fund_name: string | null
          smsf_trustee_name: string | null
          smsf_trustee_type: string | null
          total_monthly_expenditure: number | null
          updated_at: string
          value: number | null
          weekly_rental_income: number | null
        }
        Insert: {
          address: string
          client_id: string
          created_at?: string
          id?: string
          interest_rate?: number | null
          loan_remaining?: number | null
          monthly_body_corporate?: number | null
          monthly_building_insurance?: number | null
          monthly_council_rates?: number | null
          monthly_interest_repayment?: number | null
          monthly_landlord_insurance?: number | null
          monthly_property_management?: number | null
          monthly_rental_income?: number | null
          monthly_repairs_maintenance?: number | null
          monthly_water_rates?: number | null
          net_monthly_cashflow?: number | null
          ownership_percentage?: number | null
          property_type?: string
          smsf_abn?: string | null
          smsf_auditor_name?: string | null
          smsf_compliance_status?: string | null
          smsf_fund_name?: string | null
          smsf_trustee_name?: string | null
          smsf_trustee_type?: string | null
          total_monthly_expenditure?: number | null
          updated_at?: string
          value?: number | null
          weekly_rental_income?: number | null
        }
        Update: {
          address?: string
          client_id?: string
          created_at?: string
          id?: string
          interest_rate?: number | null
          loan_remaining?: number | null
          monthly_body_corporate?: number | null
          monthly_building_insurance?: number | null
          monthly_council_rates?: number | null
          monthly_interest_repayment?: number | null
          monthly_landlord_insurance?: number | null
          monthly_property_management?: number | null
          monthly_rental_income?: number | null
          monthly_repairs_maintenance?: number | null
          monthly_water_rates?: number | null
          net_monthly_cashflow?: number | null
          ownership_percentage?: number | null
          property_type?: string
          smsf_abn?: string | null
          smsf_auditor_name?: string | null
          smsf_compliance_status?: string | null
          smsf_fund_name?: string | null
          smsf_trustee_name?: string | null
          smsf_trustee_type?: string | null
          total_monthly_expenditure?: number | null
          updated_at?: string
          value?: number | null
          weekly_rental_income?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_properties_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reminders: {
        Row: {
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string
          id: string
          priority: string
          reminder_type: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date: string
          id?: string
          priority?: string
          reminder_type?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string
          id?: string
          priority?: string
          reminder_type?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reminders_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      client_scores: {
        Row: {
          calculation_notes: string | null
          cash_flow_score: number
          client_id: string
          growth_potential: number
          id: string
          last_calculated_at: string
          overall_score: number
          portfolio_health: number
          risk_factors: Json | null
          risk_level: string
        }
        Insert: {
          calculation_notes?: string | null
          cash_flow_score?: number
          client_id: string
          growth_potential?: number
          id?: string
          last_calculated_at?: string
          overall_score?: number
          portfolio_health?: number
          risk_factors?: Json | null
          risk_level?: string
        }
        Update: {
          calculation_notes?: string | null
          cash_flow_score?: number
          client_id?: string
          growth_potential?: number
          id?: string
          last_calculated_at?: string
          overall_score?: number
          portfolio_health?: number
          risk_factors?: Json | null
          risk_level?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_scores_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          client_id: string
          id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          client_id: string
          id?: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          client_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tag_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "client_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tags: {
        Row: {
          color: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          color?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          borrowing_capacity: number | null
          country: string | null
          created_at: string
          created_by: string | null
          current_address: string | null
          current_pipeline_id: string | null
          current_stage_id: string | null
          dependents_count: number | null
          equity_release: number | null
          follow_up_date: string | null
          ghl_contact_id: string | null
          ghl_last_synced_at: string | null
          ghl_opportunity_id: string | null
          ghl_sync_status: string | null
          id: string
          is_active: boolean | null
          is_favorite: boolean
          last_note_at: string | null
          last_review_date: string | null
          living_situation: string | null
          marital_status: string | null
          net_monthly_cash_flow: number | null
          next_review_due: string | null
          notes: string | null
          opportunity_status: string | null
          pipeline_notes: string | null
          pipeline_status: string | null
          pipeline_updated_at: string | null
          primary_dob: string | null
          primary_email: string | null
          primary_first_name: string
          primary_gender: string | null
          primary_middle_name: string | null
          primary_mobile: string | null
          primary_surname: string
          proposed_rental_income: number | null
          residential_status: string | null
          review_frequency: string | null
          secondary_dob: string | null
          secondary_email: string | null
          secondary_first_name: string | null
          secondary_gender: string | null
          secondary_middle_name: string | null
          secondary_mobile: string | null
          secondary_surname: string | null
          total_debt: number | null
          total_monthly_expenditure: number | null
          total_monthly_income: number | null
          total_monthly_rental_income: number | null
          total_portfolio_value: number | null
          updated_at: string
        }
        Insert: {
          borrowing_capacity?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          current_address?: string | null
          current_pipeline_id?: string | null
          current_stage_id?: string | null
          dependents_count?: number | null
          equity_release?: number | null
          follow_up_date?: string | null
          ghl_contact_id?: string | null
          ghl_last_synced_at?: string | null
          ghl_opportunity_id?: string | null
          ghl_sync_status?: string | null
          id?: string
          is_active?: boolean | null
          is_favorite?: boolean
          last_note_at?: string | null
          last_review_date?: string | null
          living_situation?: string | null
          marital_status?: string | null
          net_monthly_cash_flow?: number | null
          next_review_due?: string | null
          notes?: string | null
          opportunity_status?: string | null
          pipeline_notes?: string | null
          pipeline_status?: string | null
          pipeline_updated_at?: string | null
          primary_dob?: string | null
          primary_email?: string | null
          primary_first_name: string
          primary_gender?: string | null
          primary_middle_name?: string | null
          primary_mobile?: string | null
          primary_surname: string
          proposed_rental_income?: number | null
          residential_status?: string | null
          review_frequency?: string | null
          secondary_dob?: string | null
          secondary_email?: string | null
          secondary_first_name?: string | null
          secondary_gender?: string | null
          secondary_middle_name?: string | null
          secondary_mobile?: string | null
          secondary_surname?: string | null
          total_debt?: number | null
          total_monthly_expenditure?: number | null
          total_monthly_income?: number | null
          total_monthly_rental_income?: number | null
          total_portfolio_value?: number | null
          updated_at?: string
        }
        Update: {
          borrowing_capacity?: number | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          current_address?: string | null
          current_pipeline_id?: string | null
          current_stage_id?: string | null
          dependents_count?: number | null
          equity_release?: number | null
          follow_up_date?: string | null
          ghl_contact_id?: string | null
          ghl_last_synced_at?: string | null
          ghl_opportunity_id?: string | null
          ghl_sync_status?: string | null
          id?: string
          is_active?: boolean | null
          is_favorite?: boolean
          last_note_at?: string | null
          last_review_date?: string | null
          living_situation?: string | null
          marital_status?: string | null
          net_monthly_cash_flow?: number | null
          next_review_due?: string | null
          notes?: string | null
          opportunity_status?: string | null
          pipeline_notes?: string | null
          pipeline_status?: string | null
          pipeline_updated_at?: string | null
          primary_dob?: string | null
          primary_email?: string | null
          primary_first_name?: string
          primary_gender?: string | null
          primary_middle_name?: string | null
          primary_mobile?: string | null
          primary_surname?: string
          proposed_rental_income?: number | null
          residential_status?: string | null
          review_frequency?: string | null
          secondary_dob?: string | null
          secondary_email?: string | null
          secondary_first_name?: string | null
          secondary_gender?: string | null
          secondary_middle_name?: string | null
          secondary_mobile?: string | null
          secondary_surname?: string | null
          total_debt?: number | null
          total_monthly_expenditure?: number | null
          total_monthly_income?: number | null
          total_monthly_rental_income?: number | null
          total_portfolio_value?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_current_pipeline_id_fkey"
            columns: ["current_pipeline_id"]
            isOneToOne: false
            referencedRelation: "ghl_pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_current_stage_id_fkey"
            columns: ["current_stage_id"]
            isOneToOne: false
            referencedRelation: "ghl_pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      climate_data_cache: {
        Row: {
          climate_zone: string | null
          created_at: string
          data_quality: string
          expires_at: string
          extreme_weather: Json | null
          fetched_at: string
          humidity_data: Json | null
          id: string
          postcode: string | null
          projections: Json | null
          rainfall_data: Json | null
          state: string
          suburb: string | null
          temperature_data: Json | null
        }
        Insert: {
          climate_zone?: string | null
          created_at?: string
          data_quality?: string
          expires_at?: string
          extreme_weather?: Json | null
          fetched_at?: string
          humidity_data?: Json | null
          id?: string
          postcode?: string | null
          projections?: Json | null
          rainfall_data?: Json | null
          state: string
          suburb?: string | null
          temperature_data?: Json | null
        }
        Update: {
          climate_zone?: string | null
          created_at?: string
          data_quality?: string
          expires_at?: string
          extreme_weather?: Json | null
          fetched_at?: string
          humidity_data?: Json | null
          id?: string
          postcode?: string | null
          projections?: Json | null
          rainfall_data?: Json | null
          state?: string
          suburb?: string | null
          temperature_data?: Json | null
        }
        Relationships: []
      }
      comparison_analysis_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          settings: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "comparison_analysis_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      crime_statistics_cache: {
        Row: {
          created_at: string
          data: Json
          data_quality: string
          expires_at: string
          fetched_at: string
          id: string
          postcode: string
          state: string
          suburb: string
        }
        Insert: {
          created_at?: string
          data: Json
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          postcode: string
          state: string
          suburb: string
        }
        Update: {
          created_at?: string
          data?: Json
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          postcode?: string
          state?: string
          suburb?: string
        }
        Relationships: []
      }
      custom_users: {
        Row: {
          created_at: string
          email: string | null
          email_signature: string | null
          id: string
          is_active: boolean
          password_hash: string
          personal_mailbox: string | null
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          email_signature?: string | null
          id?: string
          is_active?: boolean
          password_hash: string
          personal_mailbox?: string | null
          role?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          email?: string | null
          email_signature?: string | null
          id?: string
          is_active?: boolean
          password_hash?: string
          personal_mailbox?: string | null
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      dashboard_modules: {
        Row: {
          category: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          module_key: string
          module_name: string
          route: string | null
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          module_key: string
          module_name: string
          route?: string | null
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          module_key?: string
          module_name?: string
          route?: string | null
          sort_order?: number
        }
        Relationships: []
      }
      depreciation_comps: {
        Row: {
          build_year: number
          created_at: string
          created_by: string | null
          dv_year1: number
          dv_year10: number
          dv_year2: number
          dv_year3: number
          dv_year4: number
          dv_year5: number
          dv_year6: number
          dv_year7: number
          dv_year8: number
          dv_year9: number
          finish_standard: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished: boolean
          id: string
          nearest_city: Database["public"]["Enums"]["depreciation_nearest_city"]
          notes: string | null
          pc_year1: number
          pc_year10: number
          pc_year2: number
          pc_year3: number
          pc_year4: number
          pc_year5: number
          pc_year6: number
          pc_year7: number
          pc_year8: number
          pc_year9: number
          property_type: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date_category: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price: number
          renovated: boolean
          source_schedule_id: string | null
          updated_at: string
        }
        Insert: {
          build_year: number
          created_at?: string
          created_by?: string | null
          dv_year1?: number
          dv_year10?: number
          dv_year2?: number
          dv_year3?: number
          dv_year4?: number
          dv_year5?: number
          dv_year6?: number
          dv_year7?: number
          dv_year8?: number
          dv_year9?: number
          finish_standard: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished?: boolean
          id?: string
          nearest_city: Database["public"]["Enums"]["depreciation_nearest_city"]
          notes?: string | null
          pc_year1?: number
          pc_year10?: number
          pc_year2?: number
          pc_year3?: number
          pc_year4?: number
          pc_year5?: number
          pc_year6?: number
          pc_year7?: number
          pc_year8?: number
          pc_year9?: number
          property_type: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date_category: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price: number
          renovated?: boolean
          source_schedule_id?: string | null
          updated_at?: string
        }
        Update: {
          build_year?: number
          created_at?: string
          created_by?: string | null
          dv_year1?: number
          dv_year10?: number
          dv_year2?: number
          dv_year3?: number
          dv_year4?: number
          dv_year5?: number
          dv_year6?: number
          dv_year7?: number
          dv_year8?: number
          dv_year9?: number
          finish_standard?: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished?: boolean
          id?: string
          nearest_city?: Database["public"]["Enums"]["depreciation_nearest_city"]
          notes?: string | null
          pc_year1?: number
          pc_year10?: number
          pc_year2?: number
          pc_year3?: number
          pc_year4?: number
          pc_year5?: number
          pc_year6?: number
          pc_year7?: number
          pc_year8?: number
          pc_year9?: number
          property_type?: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date_category?: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price?: number
          renovated?: boolean
          source_schedule_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_comps_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_estimator_runs: {
        Row: {
          build_year: number
          confidence_score: number | null
          created_at: string
          dv_total: number | null
          dv_year1: number | null
          dv_year10: number | null
          dv_year2: number | null
          dv_year3: number | null
          dv_year4: number | null
          dv_year5: number | null
          dv_year6: number | null
          dv_year7: number | null
          dv_year8: number | null
          dv_year9: number | null
          finish_standard: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished: boolean
          id: string
          match_count: number
          nearest_city: Database["public"]["Enums"]["depreciation_nearest_city"]
          pc_total: number | null
          pc_year1: number | null
          pc_year10: number | null
          pc_year2: number | null
          pc_year3: number | null
          pc_year4: number | null
          pc_year5: number | null
          pc_year6: number | null
          pc_year7: number | null
          pc_year8: number | null
          pc_year9: number | null
          property_type: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date: string | null
          purchase_date_category: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price: number
          renovated: boolean
          top_comp_ids: string[] | null
          user_id: string | null
        }
        Insert: {
          build_year: number
          confidence_score?: number | null
          created_at?: string
          dv_total?: number | null
          dv_year1?: number | null
          dv_year10?: number | null
          dv_year2?: number | null
          dv_year3?: number | null
          dv_year4?: number | null
          dv_year5?: number | null
          dv_year6?: number | null
          dv_year7?: number | null
          dv_year8?: number | null
          dv_year9?: number | null
          finish_standard: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished?: boolean
          id?: string
          match_count?: number
          nearest_city: Database["public"]["Enums"]["depreciation_nearest_city"]
          pc_total?: number | null
          pc_year1?: number | null
          pc_year10?: number | null
          pc_year2?: number | null
          pc_year3?: number | null
          pc_year4?: number | null
          pc_year5?: number | null
          pc_year6?: number | null
          pc_year7?: number | null
          pc_year8?: number | null
          pc_year9?: number | null
          property_type: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date?: string | null
          purchase_date_category: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price: number
          renovated?: boolean
          top_comp_ids?: string[] | null
          user_id?: string | null
        }
        Update: {
          build_year?: number
          confidence_score?: number | null
          created_at?: string
          dv_total?: number | null
          dv_year1?: number | null
          dv_year10?: number | null
          dv_year2?: number | null
          dv_year3?: number | null
          dv_year4?: number | null
          dv_year5?: number | null
          dv_year6?: number | null
          dv_year7?: number | null
          dv_year8?: number | null
          dv_year9?: number | null
          finish_standard?: Database["public"]["Enums"]["depreciation_finish_standard"]
          fully_furnished?: boolean
          id?: string
          match_count?: number
          nearest_city?: Database["public"]["Enums"]["depreciation_nearest_city"]
          pc_total?: number | null
          pc_year1?: number | null
          pc_year10?: number | null
          pc_year2?: number | null
          pc_year3?: number | null
          pc_year4?: number | null
          pc_year5?: number | null
          pc_year6?: number | null
          pc_year7?: number | null
          pc_year8?: number | null
          pc_year9?: number | null
          property_type?: Database["public"]["Enums"]["depreciation_property_type"]
          purchase_date?: string | null
          purchase_date_category?: Database["public"]["Enums"]["depreciation_purchase_date_category"]
          purchase_price?: number
          renovated?: boolean
          top_comp_ids?: string[] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "depreciation_estimator_runs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      document_chunks: {
        Row: {
          chunk_index: number
          chunk_text: string
          conversation_id: string | null
          created_at: string
          document_name: string
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          chunk_index: number
          chunk_text: string
          conversation_id?: string | null
          created_at?: string
          document_name: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          chunk_index?: number
          chunk_text?: string
          conversation_id?: string | null
          created_at?: string
          document_name?: string
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "report_qa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      economic_data_cache: {
        Row: {
          created_at: string
          data: Json
          data_type: string
          expires_at: string
          fetched_at: string
          id: string
        }
        Insert: {
          created_at?: string
          data: Json
          data_type: string
          expires_at?: string
          fetched_at?: string
          id?: string
        }
        Update: {
          created_at?: string
          data?: Json
          data_type?: string
          expires_at?: string
          fetched_at?: string
          id?: string
        }
        Relationships: []
      }
      email_copilot_emails: {
        Row: {
          attachments: Json | null
          bcc_recipients: string[] | null
          body: string
          cc_recipients: string[] | null
          client_id: string | null
          created_at: string
          created_by: string | null
          draft_reply: string | null
          folder: string
          id: string
          linked_property_address: string | null
          linked_report_id: string | null
          mailbox_source: string | null
          received_at: string | null
          sender: string
          status: string
          subject: string
          summary: Json | null
          to_recipients: string[] | null
          updated_at: string
          urgency_level: string | null
        }
        Insert: {
          attachments?: Json | null
          bcc_recipients?: string[] | null
          body: string
          cc_recipients?: string[] | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_reply?: string | null
          folder?: string
          id?: string
          linked_property_address?: string | null
          linked_report_id?: string | null
          mailbox_source?: string | null
          received_at?: string | null
          sender: string
          status?: string
          subject: string
          summary?: Json | null
          to_recipients?: string[] | null
          updated_at?: string
          urgency_level?: string | null
        }
        Update: {
          attachments?: Json | null
          bcc_recipients?: string[] | null
          body?: string
          cc_recipients?: string[] | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          draft_reply?: string | null
          folder?: string
          id?: string
          linked_property_address?: string | null
          linked_report_id?: string | null
          mailbox_source?: string | null
          received_at?: string | null
          sender?: string
          status?: string
          subject?: string
          summary?: Json | null
          to_recipients?: string[] | null
          updated_at?: string
          urgency_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_copilot_emails_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_copilot_emails_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_copilot_emails_linked_report_id_fkey"
            columns: ["linked_report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      email_copilot_sent_replies: {
        Row: {
          attachments: Json | null
          bcc_recipients: string[] | null
          body: string
          cc_recipients: string[] | null
          created_by: string | null
          id: string
          mailbox_source: string | null
          original_email_id: string | null
          recipient: string
          sent_at: string
          subject: string
        }
        Insert: {
          attachments?: Json | null
          bcc_recipients?: string[] | null
          body: string
          cc_recipients?: string[] | null
          created_by?: string | null
          id?: string
          mailbox_source?: string | null
          original_email_id?: string | null
          recipient: string
          sent_at?: string
          subject: string
        }
        Update: {
          attachments?: Json | null
          bcc_recipients?: string[] | null
          body?: string
          cc_recipients?: string[] | null
          created_by?: string | null
          id?: string
          mailbox_source?: string | null
          original_email_id?: string | null
          recipient?: string
          sent_at?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_copilot_sent_replies_original_email_id_fkey"
            columns: ["original_email_id"]
            isOneToOne: false
            referencedRelation: "email_copilot_emails"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_agent_contacts: {
        Row: {
          company: string | null
          contact_type: string | null
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          company?: string | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          company?: string | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_agent_contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_reports: {
        Row: {
          analytics: Json
          chart_images: Json | null
          chart_urls: Json
          config: Json
          created_at: string
          description: string | null
          generated_by: string | null
          id: string
          insights: Json
          kpis: Json
          listing_count: number
          title: string
          webhook_sent: boolean | null
          webhook_url: string | null
        }
        Insert: {
          analytics: Json
          chart_images?: Json | null
          chart_urls: Json
          config: Json
          created_at?: string
          description?: string | null
          generated_by?: string | null
          id?: string
          insights: Json
          kpis: Json
          listing_count: number
          title: string
          webhook_sent?: boolean | null
          webhook_url?: string | null
        }
        Update: {
          analytics?: Json
          chart_images?: Json | null
          chart_urls?: Json
          config?: Json
          created_at?: string
          description?: string | null
          generated_by?: string | null
          id?: string
          insights?: Json
          kpis?: Json
          listing_count?: number
          title?: string
          webhook_sent?: boolean | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      ghl_pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          ghl_id: string
          id: string
          name: string
          pipeline_id: string
          position: number | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          ghl_id: string
          id?: string
          name: string
          pipeline_id: string
          position?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          ghl_id?: string
          id?: string
          name?: string
          pipeline_id?: string
          position?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghl_pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "ghl_pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      ghl_pipelines: {
        Row: {
          created_at: string
          ghl_id: string
          id: string
          is_active: boolean | null
          location_id: string | null
          name: string
          position: number | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          ghl_id: string
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name: string
          position?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          ghl_id?: string
          id?: string
          is_active?: boolean | null
          location_id?: string | null
          name?: string
          position?: number | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      global_report_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      integration_configs: {
        Row: {
          created_at: string
          id: string
          integration_id: string
          key_name: string
          key_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          integration_id: string
          key_name: string
          key_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          integration_id?: string
          key_name?: string
          key_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      investment_reports: {
        Row: {
          calculation_version: string | null
          client_property_id: string | null
          created_at: string
          current_version: number | null
          data_sources: Json | null
          demographics_data: Json | null
          economic_data: Json | null
          error_message: string | null
          financial_calculations: Json | null
          generated_by: string | null
          id: string
          investment_score: Json | null
          is_archived: boolean
          is_client_report: boolean | null
          last_completed_section: number | null
          location_intelligence: Json | null
          manual_overrides: Json | null
          parent_report_id: string | null
          pdf_url: string | null
          property_address: string
          property_listing_id: string | null
          property_specs: Json | null
          report_content: string
          report_scope: string | null
          report_tier: string
          sources_content: string | null
          status: string
          updated_at: string
          validation_flags: Json | null
        }
        Insert: {
          calculation_version?: string | null
          client_property_id?: string | null
          created_at?: string
          current_version?: number | null
          data_sources?: Json | null
          demographics_data?: Json | null
          economic_data?: Json | null
          error_message?: string | null
          financial_calculations?: Json | null
          generated_by?: string | null
          id?: string
          investment_score?: Json | null
          is_archived?: boolean
          is_client_report?: boolean | null
          last_completed_section?: number | null
          location_intelligence?: Json | null
          manual_overrides?: Json | null
          parent_report_id?: string | null
          pdf_url?: string | null
          property_address: string
          property_listing_id?: string | null
          property_specs?: Json | null
          report_content: string
          report_scope?: string | null
          report_tier?: string
          sources_content?: string | null
          status?: string
          updated_at?: string
          validation_flags?: Json | null
        }
        Update: {
          calculation_version?: string | null
          client_property_id?: string | null
          created_at?: string
          current_version?: number | null
          data_sources?: Json | null
          demographics_data?: Json | null
          economic_data?: Json | null
          error_message?: string | null
          financial_calculations?: Json | null
          generated_by?: string | null
          id?: string
          investment_score?: Json | null
          is_archived?: boolean
          is_client_report?: boolean | null
          last_completed_section?: number | null
          location_intelligence?: Json | null
          manual_overrides?: Json | null
          parent_report_id?: string | null
          pdf_url?: string | null
          property_address?: string
          property_listing_id?: string | null
          property_specs?: Json | null
          report_content?: string
          report_scope?: string | null
          report_tier?: string
          sources_content?: string | null
          status?: string
          updated_at?: string
          validation_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "investment_reports_client_property_id_fkey"
            columns: ["client_property_id"]
            isOneToOne: false
            referencedRelation: "client_properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investment_reports_parent_report_id_fkey"
            columns: ["parent_report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      land_tax_addons: {
        Row: {
          addon_name: string
          applies_when: string
          created_at: string
          id: string
          notes: string | null
          rate: number
          state: string
          threshold: number
        }
        Insert: {
          addon_name: string
          applies_when: string
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number
          state: string
          threshold?: number
        }
        Update: {
          addon_name?: string
          applies_when?: string
          created_at?: string
          id?: string
          notes?: string | null
          rate?: number
          state?: string
          threshold?: number
        }
        Relationships: []
      }
      land_tax_quarterly_splits: {
        Row: {
          created_at: string
          id: string
          leap_year_pct: number
          non_leap_year_pct: number
          quarter: string
        }
        Insert: {
          created_at?: string
          id?: string
          leap_year_pct: number
          non_leap_year_pct: number
          quarter: string
        }
        Update: {
          created_at?: string
          id?: string
          leap_year_pct?: number
          non_leap_year_pct?: number
          quarter?: string
        }
        Relationships: []
      }
      land_tax_rates: {
        Row: {
          base_tax: number
          created_at: string
          effective_year: number
          fixed_charge: number
          id: string
          lower_bound: number
          marginal_rate: number
          marginal_threshold: number
          notes: string | null
          owner_type: string
          state: string
          updated_at: string
          upper_bound: number
        }
        Insert: {
          base_tax?: number
          created_at?: string
          effective_year?: number
          fixed_charge?: number
          id?: string
          lower_bound?: number
          marginal_rate?: number
          marginal_threshold?: number
          notes?: string | null
          owner_type: string
          state: string
          updated_at?: string
          upper_bound?: number
        }
        Update: {
          base_tax?: number
          created_at?: string
          effective_year?: number
          fixed_charge?: number
          id?: string
          lower_bound?: number
          marginal_rate?: number
          marginal_threshold?: number
          notes?: string | null
          owner_type?: string
          state?: string
          updated_at?: string
          upper_bound?: number
        }
        Relationships: []
      }
      median_rent_cache: {
        Row: {
          bedrooms: number
          created_at: string
          data_quality: string
          expires_at: string
          fetched_at: string
          id: string
          median_weekly_rent: number | null
          postcode: string
          property_type: string
          source_url: string | null
          state: string
          stock_on_market: number | null
          suburb: string
          updated_at: string
          vacancy_rate: number | null
        }
        Insert: {
          bedrooms: number
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          median_weekly_rent?: number | null
          postcode: string
          property_type: string
          source_url?: string | null
          state: string
          stock_on_market?: number | null
          suburb: string
          updated_at?: string
          vacancy_rate?: number | null
        }
        Update: {
          bedrooms?: number
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          median_weekly_rent?: number | null
          postcode?: string
          property_type?: string
          source_url?: string | null
          state?: string
          stock_on_market?: number | null
          suburb?: string
          updated_at?: string
          vacancy_rate?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string | null
          id: string
          message: string
          read: boolean
          report_id: string | null
          timestamp: string
          title: string
          type: string
        }
        Insert: {
          created_at?: string
          entity_id?: string | null
          id?: string
          message: string
          read?: boolean
          report_id?: string | null
          timestamp?: string
          title: string
          type: string
        }
        Update: {
          created_at?: string
          entity_id?: string | null
          id?: string
          message?: string
          read?: boolean
          report_id?: string | null
          timestamp?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "password_reset_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_invite_tokens: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_type: string
          invited_by: string
          permissions: Json
          temporary_password: string | null
          token: string
          used_at: string | null
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invite_type?: string
          invited_by: string
          permissions?: Json
          temporary_password?: string | null
          token: string
          used_at?: string | null
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_type?: string
          invited_by?: string
          permissions?: Json
          temporary_password?: string | null
          token?: string
          used_at?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_invite_tokens_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_analysis_reports: {
        Row: {
          average_lvr: number | null
          average_yield: number | null
          client_id: string
          client_name: string
          created_at: string
          generated_by: string | null
          health_score: number | null
          id: string
          net_monthly_cashflow: number | null
          overall_health: string | null
          pdf_file_path: string | null
          portfolio_value: number | null
          report_data: Json
          status: string
          total_equity: number | null
          total_properties: number | null
          updated_at: string
        }
        Insert: {
          average_lvr?: number | null
          average_yield?: number | null
          client_id: string
          client_name: string
          created_at?: string
          generated_by?: string | null
          health_score?: number | null
          id?: string
          net_monthly_cashflow?: number | null
          overall_health?: string | null
          pdf_file_path?: string | null
          portfolio_value?: number | null
          report_data: Json
          status?: string
          total_equity?: number | null
          total_properties?: number | null
          updated_at?: string
        }
        Update: {
          average_lvr?: number | null
          average_yield?: number | null
          client_id?: string
          client_name?: string
          created_at?: string
          generated_by?: string | null
          health_score?: number | null
          id?: string
          net_monthly_cashflow?: number | null
          overall_health?: string | null
          pdf_file_path?: string | null
          portfolio_value?: number | null
          report_data?: Json
          status?: string
          total_equity?: number | null
          total_properties?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_analysis_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_analysis_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_analysis_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_analysis_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_reviews: {
        Row: {
          action_items: Json | null
          cash_flow_score: number | null
          client_id: string
          created_at: string
          data_completeness_score: number | null
          data_issues: Json | null
          executive_summary: string | null
          growth_potential: number | null
          id: string
          include_owner_occupied: boolean
          key_findings: Json | null
          next_review_due: string | null
          notes: string | null
          overall_score: number | null
          portfolio_health: number | null
          property_scores: Json | null
          recommendations: Json | null
          review_date: string
          review_frequency: string
          reviewer_id: string | null
          risk_level: string | null
          scenarios: Json | null
          status: string
          updated_at: string
          validation_flags: Json | null
        }
        Insert: {
          action_items?: Json | null
          cash_flow_score?: number | null
          client_id: string
          created_at?: string
          data_completeness_score?: number | null
          data_issues?: Json | null
          executive_summary?: string | null
          growth_potential?: number | null
          id?: string
          include_owner_occupied?: boolean
          key_findings?: Json | null
          next_review_due?: string | null
          notes?: string | null
          overall_score?: number | null
          portfolio_health?: number | null
          property_scores?: Json | null
          recommendations?: Json | null
          review_date?: string
          review_frequency: string
          reviewer_id?: string | null
          risk_level?: string | null
          scenarios?: Json | null
          status?: string
          updated_at?: string
          validation_flags?: Json | null
        }
        Update: {
          action_items?: Json | null
          cash_flow_score?: number | null
          client_id?: string
          created_at?: string
          data_completeness_score?: number | null
          data_issues?: Json | null
          executive_summary?: string | null
          growth_potential?: number | null
          id?: string
          include_owner_occupied?: boolean
          key_findings?: Json | null
          next_review_due?: string | null
          notes?: string | null
          overall_score?: number | null
          portfolio_health?: number | null
          property_scores?: Json | null
          recommendations?: Json | null
          review_date?: string
          review_frequency?: string
          reviewer_id?: string | null
          risk_level?: string | null
          scenarios?: Json | null
          status?: string
          updated_at?: string
          validation_flags?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_reviews_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      property_comparisons: {
        Row: {
          analysis_depth: string | null
          analysis_summary: string | null
          created_at: string
          created_by: string | null
          executive_summary: string | null
          financial_comparison: Json | null
          id: string
          investor_matches: Json | null
          investor_profile: string | null
          location_comparison: Json | null
          model_used: string | null
          processing_time_ms: number | null
          property_addresses: string[] | null
          property_count: number
          property_states: string[] | null
          rankings: Json | null
          recommendations: Json | null
          red_flags: Json | null
          report_ids: string[]
          report_title: string | null
          risk_comparison: Json | null
          structure_version: number | null
          updated_at: string
        }
        Insert: {
          analysis_depth?: string | null
          analysis_summary?: string | null
          created_at?: string
          created_by?: string | null
          executive_summary?: string | null
          financial_comparison?: Json | null
          id?: string
          investor_matches?: Json | null
          investor_profile?: string | null
          location_comparison?: Json | null
          model_used?: string | null
          processing_time_ms?: number | null
          property_addresses?: string[] | null
          property_count: number
          property_states?: string[] | null
          rankings?: Json | null
          recommendations?: Json | null
          red_flags?: Json | null
          report_ids: string[]
          report_title?: string | null
          risk_comparison?: Json | null
          structure_version?: number | null
          updated_at?: string
        }
        Update: {
          analysis_depth?: string | null
          analysis_summary?: string | null
          created_at?: string
          created_by?: string | null
          executive_summary?: string | null
          financial_comparison?: Json | null
          id?: string
          investor_matches?: Json | null
          investor_profile?: string | null
          location_comparison?: Json | null
          model_used?: string | null
          processing_time_ms?: number | null
          property_addresses?: string[] | null
          property_count?: number
          property_states?: string[] | null
          rankings?: Json | null
          recommendations?: Json | null
          red_flags?: Json | null
          report_ids?: string[]
          report_title?: string | null
          risk_comparison?: Json | null
          structure_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "property_comparisons_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_qa_conversations: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          report_contents: string[]
          report_names: string[]
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_contents?: string[]
          report_names?: string[]
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          report_contents?: string[]
          report_names?: string[]
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_qa_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_qa_messages: {
        Row: {
          attachments: Json | null
          content: string
          conversation_id: string
          created_at: string
          id: string
          model_provider: string | null
          role: string
        }
        Insert: {
          attachments?: Json | null
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          model_provider?: string | null
          role: string
        }
        Update: {
          attachments?: Json | null
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          model_provider?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_qa_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "report_qa_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_structure_templates: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          mime_type: string | null
          name: string
          parsed_content: string | null
          priority: number | null
          report_category:
            | Database["public"]["Enums"]["report_category_enum"]
            | null
          report_tier: Database["public"]["Enums"]["report_tier_enum"] | null
          template_type: Database["public"]["Enums"]["template_type"]
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          name: string
          parsed_content?: string | null
          priority?: number | null
          report_category?:
            | Database["public"]["Enums"]["report_category_enum"]
            | null
          report_tier?: Database["public"]["Enums"]["report_tier_enum"] | null
          template_type: Database["public"]["Enums"]["template_type"]
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          mime_type?: string | null
          name?: string
          parsed_content?: string | null
          priority?: number | null
          report_category?:
            | Database["public"]["Enums"]["report_category_enum"]
            | null
          report_tier?: Database["public"]["Enums"]["report_tier_enum"] | null
          template_type?: Database["public"]["Enums"]["template_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_structure_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          config: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      report_versions: {
        Row: {
          calculation_version: string | null
          changelog: string | null
          created_at: string | null
          created_by: string | null
          data_sources: Json | null
          demographics_data: Json | null
          economic_data: Json | null
          financial_calculations: Json | null
          id: string
          investment_score: Json | null
          location_intelligence: Json | null
          property_specs: Json | null
          quality_score: number | null
          report_content: string
          report_id: string
          sources_content: string | null
          validation_flags: Json | null
          version_number: number
        }
        Insert: {
          calculation_version?: string | null
          changelog?: string | null
          created_at?: string | null
          created_by?: string | null
          data_sources?: Json | null
          demographics_data?: Json | null
          economic_data?: Json | null
          financial_calculations?: Json | null
          id?: string
          investment_score?: Json | null
          location_intelligence?: Json | null
          property_specs?: Json | null
          quality_score?: number | null
          report_content: string
          report_id: string
          sources_content?: string | null
          validation_flags?: Json | null
          version_number: number
        }
        Update: {
          calculation_version?: string | null
          changelog?: string | null
          created_at?: string | null
          created_by?: string | null
          data_sources?: Json | null
          demographics_data?: Json | null
          economic_data?: Json | null
          financial_calculations?: Json | null
          id?: string
          investment_score?: Json | null
          location_intelligence?: Json | null
          property_specs?: Json | null
          quality_score?: number | null
          report_content?: string
          report_id?: string
          sources_content?: string | null
          validation_flags?: Json | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "investment_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_assessment_cache: {
        Row: {
          bushfire_risk: Json | null
          created_at: string
          data_quality: string
          expires_at: string
          fetched_at: string
          flood_risk: Json | null
          id: string
          latitude: number | null
          longitude: number | null
          postcode: string
          state: string
          suburb: string
        }
        Insert: {
          bushfire_risk?: Json | null
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          flood_risk?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          postcode: string
          state: string
          suburb: string
        }
        Update: {
          bushfire_risk?: Json | null
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          flood_risk?: Json | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          postcode?: string
          state?: string
          suburb?: string
        }
        Relationships: []
      }
      schools_directory: {
        Row: {
          address: string | null
          created_at: string
          icsea_score: number | null
          id: string
          last_updated: string | null
          latitude: number | null
          longitude: number | null
          name: string
          naplan_data: Json | null
          postcode: string
          school_level: string | null
          school_type: string | null
          state: string
          student_count: number | null
          suburb: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          icsea_score?: number | null
          id?: string
          last_updated?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
          naplan_data?: Json | null
          postcode: string
          school_level?: string | null
          school_type?: string | null
          state: string
          student_count?: number | null
          suburb: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          icsea_score?: number | null
          id?: string
          last_updated?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
          naplan_data?: Json | null
          postcode?: string
          school_level?: string | null
          school_type?: string | null
          state?: string
          student_count?: number | null
          suburb?: string
          website_url?: string | null
        }
        Relationships: []
      }
      stamp_duty_rates_cache: {
        Row: {
          brackets: Json
          created_at: string
          data_quality: string
          expires_at: string
          fetched_at: string
          id: string
          source_url: string | null
          state: string
          updated_at: string
        }
        Insert: {
          brackets: Json
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          source_url?: string | null
          state: string
          updated_at?: string
        }
        Update: {
          brackets?: Json
          created_at?: string
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          source_url?: string | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      suburb_directory: {
        Row: {
          created_at: string
          id: string
          postcode: string
          state: string
          suburb: string
        }
        Insert: {
          created_at?: string
          id?: string
          postcode: string
          state: string
          suburb: string
        }
        Update: {
          created_at?: string
          id?: string
          postcode?: string
          state?: string
          suburb?: string
        }
        Relationships: []
      }
      transport_data_cache: {
        Row: {
          created_at: string
          data: Json
          data_quality: string
          expires_at: string
          fetched_at: string
          id: string
          latitude: number
          longitude: number
          state: string
          suburb: string | null
        }
        Insert: {
          created_at?: string
          data: Json
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude: number
          longitude: number
          state: string
          suburb?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          data_quality?: string
          expires_at?: string
          fetched_at?: string
          id?: string
          latitude?: number
          longitude?: number
          state?: string
          suburb?: string | null
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          granted_by: string | null
          id: string
          module_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          module_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          granted_by?: string | null
          id?: string
          module_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "dashboard_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          author_name: string | null
          brand_colors: Json | null
          chart_preferences: Json | null
          company_name: string | null
          created_at: string
          default_template_id: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          author_name?: string | null
          brand_colors?: Json | null
          chart_preferences?: Json | null
          company_name?: string | null
          created_at?: string
          default_template_id?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          author_name?: string | null
          brand_colors?: Json | null
          chart_preferences?: Json | null
          company_name?: string | null
          created_at?: string
          default_template_id?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_default_template_id_fkey"
            columns: ["default_template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          session_token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      vapi_call_logs: {
        Row: {
          action_items: string[] | null
          agent_id: string | null
          agent_name: string | null
          ai_recommendations: string[] | null
          assistants_involved: Json | null
          call_direction: string | null
          call_intent: string | null
          call_outcome: string | null
          call_status: string | null
          cost: number | null
          created_at: string
          customer_name: string | null
          duration_seconds: number | null
          ended_at: string | null
          escalation_severity: number | null
          ghl_contact_id: string | null
          handoff_sequence: Json | null
          id: string
          is_squad_call: boolean | null
          key_topics: string[] | null
          metadata: Json | null
          negative_sentiment_moment: Json | null
          phone_number: string | null
          recording_url: string | null
          recovery_priority: number | null
          resolution_notes: string | null
          resolution_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          root_cause_category: string | null
          sentiment: string | null
          squad_id: string | null
          squad_name: string | null
          started_at: string | null
          structured_data_multi: Json | null
          summary: string | null
          tags: string[] | null
          transcript: string | null
          updated_at: string
          vapi_call_id: string
        }
        Insert: {
          action_items?: string[] | null
          agent_id?: string | null
          agent_name?: string | null
          ai_recommendations?: string[] | null
          assistants_involved?: Json | null
          call_direction?: string | null
          call_intent?: string | null
          call_outcome?: string | null
          call_status?: string | null
          cost?: number | null
          created_at?: string
          customer_name?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          escalation_severity?: number | null
          ghl_contact_id?: string | null
          handoff_sequence?: Json | null
          id?: string
          is_squad_call?: boolean | null
          key_topics?: string[] | null
          metadata?: Json | null
          negative_sentiment_moment?: Json | null
          phone_number?: string | null
          recording_url?: string | null
          recovery_priority?: number | null
          resolution_notes?: string | null
          resolution_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_cause_category?: string | null
          sentiment?: string | null
          squad_id?: string | null
          squad_name?: string | null
          started_at?: string | null
          structured_data_multi?: Json | null
          summary?: string | null
          tags?: string[] | null
          transcript?: string | null
          updated_at?: string
          vapi_call_id: string
        }
        Update: {
          action_items?: string[] | null
          agent_id?: string | null
          agent_name?: string | null
          ai_recommendations?: string[] | null
          assistants_involved?: Json | null
          call_direction?: string | null
          call_intent?: string | null
          call_outcome?: string | null
          call_status?: string | null
          cost?: number | null
          created_at?: string
          customer_name?: string | null
          duration_seconds?: number | null
          ended_at?: string | null
          escalation_severity?: number | null
          ghl_contact_id?: string | null
          handoff_sequence?: Json | null
          id?: string
          is_squad_call?: boolean | null
          key_topics?: string[] | null
          metadata?: Json | null
          negative_sentiment_moment?: Json | null
          phone_number?: string | null
          recording_url?: string | null
          recovery_priority?: number | null
          resolution_notes?: string | null
          resolution_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          root_cause_category?: string | null
          sentiment?: string | null
          squad_id?: string | null
          squad_name?: string | null
          started_at?: string | null
          structured_data_multi?: Json | null
          summary?: string | null
          tags?: string[] | null
          transcript?: string | null
          updated_at?: string
          vapi_call_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vapi_call_logs_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
      whitelabel_settings: {
        Row: {
          accent_color: string | null
          auth_logo: string | null
          company_name: string
          created_at: string
          dark_mode_default: string
          email_signature_address: string | null
          email_signature_banner: string | null
          email_signature_disclaimer: string | null
          email_signature_email: string | null
          email_signature_name: string | null
          email_signature_phone: string | null
          email_signature_title: string | null
          email_signature_website: string | null
          favicon: string | null
          id: string
          primary_color: string | null
          sidebar_icon: string | null
          sidebar_logo: string | null
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          auth_logo?: string | null
          company_name?: string
          created_at?: string
          dark_mode_default?: string
          email_signature_address?: string | null
          email_signature_banner?: string | null
          email_signature_disclaimer?: string | null
          email_signature_email?: string | null
          email_signature_name?: string | null
          email_signature_phone?: string | null
          email_signature_title?: string | null
          email_signature_website?: string | null
          favicon?: string | null
          id?: string
          primary_color?: string | null
          sidebar_icon?: string | null
          sidebar_logo?: string | null
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          auth_logo?: string | null
          company_name?: string
          created_at?: string
          dark_mode_default?: string
          email_signature_address?: string | null
          email_signature_banner?: string | null
          email_signature_disclaimer?: string | null
          email_signature_email?: string | null
          email_signature_name?: string | null
          email_signature_phone?: string | null
          email_signature_title?: string | null
          email_signature_website?: string | null
          favicon?: string | null
          id?: string
          primary_color?: string | null
          sidebar_icon?: string | null
          sidebar_logo?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      activity_logs_with_user: {
        Row: {
          action_type:
            | Database["public"]["Enums"]["activity_action_type"]
            | null
          created_at: string | null
          display_username: string | null
          entity_id: string | null
          entity_name: string | null
          entity_type:
            | Database["public"]["Enums"]["activity_entity_type"]
            | null
          id: string | null
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_email: string | null
          user_id: string | null
          user_role: string | null
          username: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "custom_users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      calculate_data_quality_score: {
        Args: { report_id: string }
        Returns: number
      }
      cleanup_expired_census_cache: { Args: never; Returns: undefined }
      cleanup_expired_climate_cache: { Args: never; Returns: undefined }
      cleanup_expired_crime_cache: { Args: never; Returns: undefined }
      cleanup_expired_economic_cache: { Args: never; Returns: undefined }
      cleanup_expired_rent_cache: { Args: never; Returns: undefined }
      cleanup_expired_risk_cache: { Args: never; Returns: undefined }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_expired_stamp_duty_cache: { Args: never; Returns: undefined }
      cleanup_expired_transport_cache: { Args: never; Returns: undefined }
      cleanup_old_health_logs: { Args: never; Returns: undefined }
      get_all_cache_stats: {
        Args: never
        Returns: {
          avg_age_days: number
          cache_hit_potential: number
          cache_type: string
          estimated_data: number
          expired_entries: number
          live_data: number
          retention_days: number
          total_entries: number
        }[]
      }
      get_api_health_stats: {
        Args: { days_back?: number }
        Returns: {
          avg_response_time: number
          data_quality_score: number
          error_calls: number
          estimated_data_count: number
          live_data_count: number
          service_name: string
          success_calls: number
          success_rate: number
          total_calls: number
        }[]
      }
      get_cache_statistics: {
        Args: never
        Returns: {
          cache_hit_potential: number
          cache_type: string
          estimated_data: number
          expired_entries: number
          live_data: number
          total_entries: number
        }[]
      }
      get_recent_activities: {
        Args: {
          p_entity_type?: Database["public"]["Enums"]["activity_entity_type"]
          p_limit?: number
          p_user_id?: string
        }
        Returns: {
          action_type: Database["public"]["Enums"]["activity_action_type"]
          created_at: string
          entity_id: string
          entity_name: string
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          id: string
          metadata: Json
          user_id: string
          username: string
        }[]
      }
      get_report_changelog: {
        Args: {
          p_report_id: string
          p_version_from?: number
          p_version_to?: number
        }
        Returns: {
          changelog: string
          changes_summary: Json
          created_at: string
          quality_score: number
          validation_count: number
          version_number: number
        }[]
      }
      get_schools_statistics: {
        Args: never
        Returns: {
          avg_icsea: number
          by_level: Json
          by_state: Json
          by_type: Json
          total_schools: number
          total_students: number
        }[]
      }
      get_user_activity_summary: {
        Args: { p_days_back?: number; p_user_id: string }
        Returns: {
          action_type: Database["public"]["Enums"]["activity_action_type"]
          count: number
          entity_type: Database["public"]["Enums"]["activity_entity_type"]
          last_occurrence: string
        }[]
      }
      has_module_access: {
        Args: { _module_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_activity: {
        Args: {
          p_action_type: Database["public"]["Enums"]["activity_action_type"]
          p_entity_id?: string
          p_entity_name?: string
          p_entity_type: Database["public"]["Enums"]["activity_entity_type"]
          p_ip_address?: string
          p_metadata?: Json
          p_user_agent?: string
          p_user_id: string
          p_username: string
        }
        Returns: string
      }
      match_document_chunks: {
        Args: {
          match_conversation_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          chunk_index: number
          chunk_text: string
          conversation_id: string
          document_name: string
          id: string
          similarity: number
        }[]
      }
      seed_sample_schools: { Args: never; Returns: undefined }
      validate_property_specs: {
        Args: { specs: Json }
        Returns: {
          is_valid: boolean
          missing_fields: string[]
        }[]
      }
    }
    Enums: {
      activity_action_type:
        | "report_generated"
        | "report_regenerated"
        | "report_viewed"
        | "report_edited"
        | "report_archived"
        | "report_deleted"
        | "report_pdf_downloaded"
        | "report_shared"
        | "manual_override_applied"
        | "comparison_created"
        | "comparison_viewed"
        | "comparison_deleted"
        | "cash_flow_created"
        | "cash_flow_updated"
        | "cash_flow_deleted"
        | "email_read"
        | "email_reply_generated"
        | "email_reply_sent"
        | "email_linked_to_report"
        | "call_tagged"
        | "alert_rule_created"
        | "alert_rule_updated"
        | "alert_rule_deleted"
        | "weekly_report_config_changed"
        | "qa_conversation_created"
        | "qa_question_asked"
        | "qa_conversation_deleted"
        | "automation_switch_created"
        | "automation_switch_enabled"
        | "automation_switch_disabled"
        | "automation_switch_deleted"
        | "automation_master_toggle_changed"
        | "template_uploaded"
        | "template_activated"
        | "template_deactivated"
        | "template_deleted"
        | "branding_profile_created"
        | "branding_profile_updated"
        | "branding_profile_deleted"
        | "user_invited"
        | "user_permissions_changed"
        | "user_deactivated"
        | "user_activated"
        | "password_reset_initiated"
        | "whitelabel_settings_updated"
        | "whitelabel_logo_changed"
        | "user_login"
        | "user_logout"
        | "bulk_generation_started"
        | "bulk_generation_completed"
        | "settings_updated"
        | "data_exported"
        | "login"
        | "logout"
        | "branding_created"
        | "branding_updated"
        | "branding_deleted"
        | "user_created"
        | "user_deleted"
        | "user_promoted"
        | "user_demoted"
        | "permissions_updated"
      activity_entity_type:
        | "investment_report"
        | "property_comparison"
        | "cash_flow_analysis"
        | "email"
        | "call_log"
        | "call_alert_rule"
        | "qa_conversation"
        | "automation_switch"
        | "template"
        | "branding_profile"
        | "user"
        | "whitelabel_settings"
        | "bulk_generation_job"
        | "system"
        | "session"
        | "branding"
      app_role: "superadmin" | "admin" | "user"
      depreciation_finish_standard: "low" | "medium" | "high"
      depreciation_nearest_city:
        | "sydney_nsw"
        | "melbourne_vic"
        | "perth_wa"
        | "brisbane_qld"
        | "adelaide_sa"
        | "cairns_qld"
        | "canberra_act"
        | "darwin_nt"
        | "hobart_tas"
      depreciation_property_type:
        | "house"
        | "townhouse"
        | "unit"
        | "highrise"
        | "commercial"
        | "industrial"
      depreciation_purchase_date_category:
        | "pre_budget"
        | "post_budget_second_hand"
        | "post_budget_brand_new"
      report_category_enum:
        | "investment"
        | "comparison"
        | "suburb_snapshot"
        | "cash_flow"
      report_tier_enum: "compass" | "executive" | "snapshot"
      template_type:
        | "ai_structure"
        | "pdf_layout"
        | "client_branding"
        | "qa_export"
        | "cashflow_export"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      activity_action_type: [
        "report_generated",
        "report_regenerated",
        "report_viewed",
        "report_edited",
        "report_archived",
        "report_deleted",
        "report_pdf_downloaded",
        "report_shared",
        "manual_override_applied",
        "comparison_created",
        "comparison_viewed",
        "comparison_deleted",
        "cash_flow_created",
        "cash_flow_updated",
        "cash_flow_deleted",
        "email_read",
        "email_reply_generated",
        "email_reply_sent",
        "email_linked_to_report",
        "call_tagged",
        "alert_rule_created",
        "alert_rule_updated",
        "alert_rule_deleted",
        "weekly_report_config_changed",
        "qa_conversation_created",
        "qa_question_asked",
        "qa_conversation_deleted",
        "automation_switch_created",
        "automation_switch_enabled",
        "automation_switch_disabled",
        "automation_switch_deleted",
        "automation_master_toggle_changed",
        "template_uploaded",
        "template_activated",
        "template_deactivated",
        "template_deleted",
        "branding_profile_created",
        "branding_profile_updated",
        "branding_profile_deleted",
        "user_invited",
        "user_permissions_changed",
        "user_deactivated",
        "user_activated",
        "password_reset_initiated",
        "whitelabel_settings_updated",
        "whitelabel_logo_changed",
        "user_login",
        "user_logout",
        "bulk_generation_started",
        "bulk_generation_completed",
        "settings_updated",
        "data_exported",
        "login",
        "logout",
        "branding_created",
        "branding_updated",
        "branding_deleted",
        "user_created",
        "user_deleted",
        "user_promoted",
        "user_demoted",
        "permissions_updated",
      ],
      activity_entity_type: [
        "investment_report",
        "property_comparison",
        "cash_flow_analysis",
        "email",
        "call_log",
        "call_alert_rule",
        "qa_conversation",
        "automation_switch",
        "template",
        "branding_profile",
        "user",
        "whitelabel_settings",
        "bulk_generation_job",
        "system",
        "session",
        "branding",
      ],
      app_role: ["superadmin", "admin", "user"],
      depreciation_finish_standard: ["low", "medium", "high"],
      depreciation_nearest_city: [
        "sydney_nsw",
        "melbourne_vic",
        "perth_wa",
        "brisbane_qld",
        "adelaide_sa",
        "cairns_qld",
        "canberra_act",
        "darwin_nt",
        "hobart_tas",
      ],
      depreciation_property_type: [
        "house",
        "townhouse",
        "unit",
        "highrise",
        "commercial",
        "industrial",
      ],
      depreciation_purchase_date_category: [
        "pre_budget",
        "post_budget_second_hand",
        "post_budget_brand_new",
      ],
      report_category_enum: [
        "investment",
        "comparison",
        "suburb_snapshot",
        "cash_flow",
      ],
      report_tier_enum: ["compass", "executive", "snapshot"],
      template_type: [
        "ai_structure",
        "pdf_layout",
        "client_branding",
        "qa_export",
        "cashflow_export",
      ],
    },
  },
} as const
