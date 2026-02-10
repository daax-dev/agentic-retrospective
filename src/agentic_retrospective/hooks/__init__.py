"""Hook handlers for Claude Code telemetry capture."""

__all__ = ["log_prompt", "log_tool"]


def log_prompt() -> None:
    """Log user prompt - import lazily to avoid circular imports."""
    from .log_prompt import log_prompt as _log_prompt

    _log_prompt()


def log_tool() -> None:
    """Log tool call - import lazily to avoid circular imports."""
    from .log_tool import log_tool as _log_tool

    _log_tool()
