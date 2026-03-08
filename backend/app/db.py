"""Supabase client for Stallion."""
import os
from supabase import create_client, Client

# Get from environment
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

# Create client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

def get_client_by_api_key(api_key: str) -> dict | None:
    """Get client by API key."""
    response = supabase.table("clients").select("*").eq("api_key", api_key).execute()
    return response.data[0] if response.data else None

def create_client_record(name: str, email: str, api_key: str, tier: str = "starter") -> dict:
    """Create a new client."""
    data = {
        "name": name,
        "email": email,
        "api_key": api_key,
        "subscription_tier": tier,
        "subscription_status": "active"
    }
    response = supabase.table("clients").insert(data).execute()
    return response.data[0]

def save_declaration(client_id: str, xml_data: dict, declaration_ref: str, status: str = "draft") -> dict:
    """Save a declaration."""
    data = {
        "client_id": client_id,
        "xml_data": xml_data,
        "declaration_ref": declaration_ref,
        "status": status
    }
    response = supabase.table("declarations").insert(data).execute()
    return response.data[0]

def get_declarations(client_id: str) -> list:
    """Get all declarations for a client."""
    response = supabase.table("declarations").select("*").eq("client_id", client_id).order("created_at", desc=True).execute()
    return response.data

def get_declaration(declaration_id: str, client_id: str) -> dict | None:
    """Get a specific declaration."""
    response = supabase.table("declarations").select("*").eq("id", declaration_id).eq("client_id", client_id).execute()
    return response.data[0] if response.data else None