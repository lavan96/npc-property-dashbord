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
          id: string
          is_active: boolean
          password_hash: string
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          password_hash: string
          role?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          password_hash?: string
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
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
      investment_reports: {
        Row: {
          created_at: string
          demographics_data: Json | null
          economic_data: Json | null
          error_message: string | null
          financial_calculations: Json | null
          generated_by: string | null
          id: string
          investment_score: Json | null
          location_intelligence: Json | null
          pdf_url: string | null
          property_address: string
          property_listing_id: string | null
          report_content: string
          sources_content: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demographics_data?: Json | null
          economic_data?: Json | null
          error_message?: string | null
          financial_calculations?: Json | null
          generated_by?: string | null
          id?: string
          investment_score?: Json | null
          location_intelligence?: Json | null
          pdf_url?: string | null
          property_address: string
          property_listing_id?: string | null
          report_content: string
          sources_content?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demographics_data?: Json | null
          economic_data?: Json | null
          error_message?: string | null
          financial_calculations?: Json | null
          generated_by?: string | null
          id?: string
          investment_score?: Json | null
          location_intelligence?: Json | null
          pdf_url?: string | null
          property_address?: string
          property_listing_id?: string | null
          report_content?: string
          sources_content?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
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
          property_count: number
          rankings: Json | null
          recommendations: Json | null
          red_flags: Json | null
          report_ids: string[]
          risk_comparison: Json | null
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
          property_count: number
          rankings?: Json | null
          recommendations?: Json | null
          red_flags?: Json | null
          report_ids: string[]
          risk_comparison?: Json | null
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
          property_count?: number
          rankings?: Json | null
          recommendations?: Json | null
          red_flags?: Json | null
          report_ids?: string[]
          risk_comparison?: Json | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_expired_census_cache: { Args: never; Returns: undefined }
      cleanup_expired_climate_cache: { Args: never; Returns: undefined }
      cleanup_expired_crime_cache: { Args: never; Returns: undefined }
      cleanup_expired_economic_cache: { Args: never; Returns: undefined }
      cleanup_expired_risk_cache: { Args: never; Returns: undefined }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
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
      seed_sample_schools: { Args: never; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
