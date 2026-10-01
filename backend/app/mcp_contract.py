"""Aeolia MCP tool contract.

This is intentionally transport-agnostic domain logic for the future authenticated
MCP server. It documents the minimum scopes ChatGPT should receive. The MCP
transport/OAuth layer should call these functions only after validating the member.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class ToolContract:
    name: str
    scope: str
    read_only: bool
    description: str


TOOLS = [
    ToolContract("get_my_discovery_policy", "discovery:read", True,
                 "Read the member's own private discovery rules and Elf budget."),
    ToolContract("get_daily_people", "discoveries:read", True,
                 "Read only people Aeolia already found eligible and worth review."),
    ToolContract("get_elf_conversation", "elf:read", True,
                 "Read an inspectable Elf-to-Elf transcript for the authenticated member."),
    ToolContract("request_elf_exploration", "elf:write", False,
                 "Ask Aeolia to explore eligible people within the member's configured budget."),
    ToolContract("update_my_discovery_policy", "discovery:write", False,
                 "Update only the authenticated member's private discovery policy."),
]

# Deliberately absent:
# - get_profile_photos: personal AI must not receive real profile media.
# - connect_person: Connect is a human-only action in the Aeolia client.
# - reveal_rejection_reason: private rules and passes are never disclosed.
