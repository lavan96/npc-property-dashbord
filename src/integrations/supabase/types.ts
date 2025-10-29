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
          updated_at: string
        }
        Insert: {
          created_at?: string
          demographics_data?: Json | null
          economic_data?: Json | null
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
          updated_at?: string
        }
        Update: {
          created_at?: string
          demographics_data?: Json | null
          economic_data?: Json | null
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
          updated_at?: string
        }
        Relationships: []
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
      cleanup_expired_sessions: { Args: never; Returns: undefined }
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
