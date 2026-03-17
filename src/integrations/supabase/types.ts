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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          approved: boolean
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved?: boolean
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_cards: {
        Row: {
          assignee_id: string | null
          assignee_label: string | null
          card_node_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          labels: Json | null
          lane_stage_key: string | null
          priority: string | null
          sort_order: number | null
          status: string
          title: string
          updated_at: string | null
          worksheet_id: string
        }
        Insert: {
          assignee_id?: string | null
          assignee_label?: string | null
          card_node_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: Json | null
          lane_stage_key?: string | null
          priority?: string | null
          sort_order?: number | null
          status?: string
          title?: string
          updated_at?: string | null
          worksheet_id: string
        }
        Update: {
          assignee_id?: string | null
          assignee_label?: string | null
          card_node_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          labels?: Json | null
          lane_stage_key?: string | null
          priority?: string | null
          sort_order?: number | null
          status?: string
          title?: string
          updated_at?: string | null
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_cards_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_lanes: {
        Row: {
          created_at: string | null
          id: string
          lane_node_id: string
          sort_order: number | null
          stage_key: string
          title: string
          wip_limit: number | null
          worksheet_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lane_node_id: string
          sort_order?: number | null
          stage_key: string
          title?: string
          wip_limit?: number | null
          worksheet_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lane_node_id?: string
          sort_order?: number | null
          stage_key?: string
          title?: string
          wip_limit?: number | null
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_lanes_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_access_grants: {
        Row: {
          created_at: string
          granted_to_user_id: string
          id: string
          permission: Database["public"]["Enums"]["worksheet_permission"]
          worksheet_id: string
        }
        Insert: {
          created_at?: string
          granted_to_user_id: string
          id?: string
          permission?: Database["public"]["Enums"]["worksheet_permission"]
          worksheet_id: string
        }
        Update: {
          created_at?: string
          granted_to_user_id?: string
          id?: string
          permission?: Database["public"]["Enums"]["worksheet_permission"]
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_access_grants_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_embeddings: {
        Row: {
          content_hash: string
          created_at: string
          embedding: string
          id: string
          worksheet_id: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          embedding: string
          id?: string
          worksheet_id: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          embedding?: string
          id?: string
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_embeddings_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: true
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_entities: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          label: string
          worksheet_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          label?: string
          worksheet_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          label?: string
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_entities_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheet_versions: {
        Row: {
          content_html: string | null
          content_json: Json | null
          content_md: string | null
          created_at: string
          id: string
          worksheet_id: string
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          content_md?: string | null
          created_at?: string
          id?: string
          worksheet_id: string
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          content_md?: string | null
          created_at?: string
          id?: string
          worksheet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worksheet_versions_worksheet_id_fkey"
            columns: ["worksheet_id"]
            isOneToOne: false
            referencedRelation: "worksheets"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheets: {
        Row: {
          content_html: string | null
          content_json: Json | null
          content_md: string | null
          created_at: string
          document_type: Database["public"]["Enums"]["document_type"]
          id: string
          meta: Json | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_html?: string | null
          content_json?: Json | null
          content_md?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          meta?: Json | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_html?: string | null
          content_json?: Json | null
          content_md?: string | null
          created_at?: string
          document_type?: Database["public"]["Enums"]["document_type"]
          id?: string
          meta?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_worksheet_access: {
        Args: {
          _required_permission?: Database["public"]["Enums"]["worksheet_permission"]
          _user_id: string
          _worksheet_id: string
        }
        Returns: boolean
      }
      is_worksheet_owner: {
        Args: { _user_id: string; _worksheet_id: string }
        Returns: boolean
      }
      upsert_worksheet_embedding: {
        Args: {
          _content_hash: string
          _embedding: string
          _worksheet_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      document_type: "note" | "skill" | "prompt" | "template"
      worksheet_permission: "read" | "write"
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
      document_type: ["note", "skill", "prompt", "template"],
      worksheet_permission: ["read", "write"],
    },
  },
} as const
