"""Decision analyzer for extracting insights from decision logs.

This module analyzes JSONL decision log files to identify patterns,
categorize decisions, and calculate escalation metrics.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..models import DecisionRecord

logger = logging.getLogger(__name__)


# Valid decision types for normalization
VALID_DECISION_TYPES = frozenset({"one_way_door", "two_way_door", "reversible", "unknown"})

# Sentinel value for malformed records
_MALFORMED_RECORD = DecisionRecord(ts="")


@dataclass
class DataQuality:
    """Data quality metrics for decision records."""

    total_records: int
    valid_records: int
    malformed_records: int
    missing_fields: dict[str, int] = field(default_factory=dict)


@dataclass
class EscalationStats:
    """Statistics about decision escalations."""

    total: int
    escalated: int
    rate: float


@dataclass
class DecisionAnalysisResult:
    """Result of analyzing decision logs.

    Contains categorized decisions, escalation statistics,
    and data quality metrics.
    """

    records: list[DecisionRecord]
    by_category: dict[str, list[DecisionRecord]]
    by_actor: dict[str, list[DecisionRecord]]
    by_type: dict[str, list[DecisionRecord]]
    one_way_doors: list[DecisionRecord]
    two_way_doors: list[DecisionRecord]
    escalation_stats: EscalationStats
    data_quality: DataQuality


class DecisionAnalyzer:
    """Analyzer for decision log files.

    Loads and analyzes JSONL decision records to extract patterns,
    categorize decisions, and calculate metrics.

    Args:
        decisions_path: Path to the directory containing decision log files.
    """

    def __init__(self, decisions_path: str | Path) -> None:
        """Initialize the analyzer with the path to decision logs.

        Args:
            decisions_path: Path to the directory containing .jsonl decision files.
        """
        self.path = Path(decisions_path)
        # Track malformed records by identity for validation
        self._malformed_records: set[int] = set()

    def analyze(self) -> DecisionAnalysisResult:
        """Analyze all decision records and return aggregated results.

        Returns:
            DecisionAnalysisResult containing categorized decisions,
            escalation statistics, and data quality metrics.
        """
        records = self._load_records()
        valid_records = [r for r in records if self._is_valid_record(r)]

        # Group by category
        by_category: dict[str, list[DecisionRecord]] = {}
        for record in valid_records:
            category = record.category or "other"
            if category not in by_category:
                by_category[category] = []
            by_category[category].append(record)

        # Group by actor
        by_actor: dict[str, list[DecisionRecord]] = {}
        for record in valid_records:
            actor = record.actor or "unknown"
            if actor not in by_actor:
                by_actor[actor] = []
            by_actor[actor].append(record)

        # Group by decision type
        by_type: dict[str, list[DecisionRecord]] = {}
        for record in valid_records:
            decision_type = record.decision_type or "unknown"
            if decision_type not in by_type:
                by_type[decision_type] = []
            by_type[decision_type].append(record)

        # Separate one-way and two-way doors
        one_way_doors = [r for r in valid_records if r.decision_type == "one_way_door"]
        two_way_doors = [r for r in valid_records if r.decision_type == "two_way_door"]

        # Calculate escalation stats (one-way doors escalated to humans)
        escalated_one_way_doors = [r for r in one_way_doors if r.actor == "human"]
        escalation_stats = EscalationStats(
            total=len(one_way_doors),
            escalated=len(escalated_one_way_doors),
            rate=(
                (len(escalated_one_way_doors) / len(one_way_doors)) * 100
                if one_way_doors
                else 100.0
            ),
        )

        # Analyze data quality
        data_quality = self._analyze_data_quality(records, valid_records)

        return DecisionAnalysisResult(
            records=valid_records,
            by_category=by_category,
            by_actor=by_actor,
            by_type=by_type,
            one_way_doors=one_way_doors,
            two_way_doors=two_way_doors,
            escalation_stats=escalation_stats,
            data_quality=data_quality,
        )

    def _load_records(self) -> list[DecisionRecord]:
        """Load all decision records from JSONL files.

        Returns:
            List of DecisionRecord objects (including malformed placeholders).
        """
        records: list[DecisionRecord] = []
        self._malformed_records.clear()

        if not self.path.exists():
            return records

        try:
            files = list(self.path.iterdir())
            for file_path in files:
                if not file_path.suffix == ".jsonl":
                    continue

                try:
                    content = file_path.read_text(encoding="utf-8")
                    for line in content.split("\n"):
                        if not line.strip():
                            continue
                        try:
                            raw_record = json.loads(line)
                            normalized = self._normalize_record(raw_record)
                            records.append(normalized)
                        except json.JSONDecodeError:
                            # Create a placeholder for malformed records
                            malformed = DecisionRecord(ts="")
                            self._malformed_records.add(id(malformed))
                            records.append(malformed)
                except OSError as e:
                    logger.error("Error reading file %s: %s", file_path, e)

        except OSError as e:
            logger.error("Error loading decision records: %s", e)

        return records

    def _normalize_record(self, raw: dict[str, Any]) -> DecisionRecord:
        """Normalize a raw record dictionary to a DecisionRecord.

        Handles field aliases and type validation.

        Args:
            raw: Raw dictionary parsed from JSON.

        Returns:
            Normalized DecisionRecord.
        """
        # Handle decision_type normalization
        raw_type = raw.get("decision_type") or raw.get("type") or ""
        decision_type = str(raw_type) if raw_type else ""

        # Normalize hyphens to underscores
        if decision_type:
            decision_type = decision_type.replace("-", "_")

        # Validate decision type
        validated_type = decision_type if decision_type in VALID_DECISION_TYPES else "unknown"

        # Build normalized record with field aliases
        return DecisionRecord(
            id=raw.get("id"),
            ts=raw.get("ts") or raw.get("timestamp") or "",
            timestamp=raw.get("timestamp"),
            sprint_id=raw.get("sprint_id"),
            actor=raw.get("actor"),
            category=raw.get("category"),
            decision_type=validated_type,  # type: ignore[arg-type]
            decision=raw.get("decision") or raw.get("summary") or raw.get("title") or "",
            summary=raw.get("summary"),
            title=raw.get("title"),
            context=raw.get("context"),
            options_considered=raw.get("options_considered"),
            chosen_option=raw.get("chosen_option") or raw.get("chosen") or "",
            chosen=raw.get("chosen"),
            rationale=raw.get("rationale") or raw.get("reasoning") or "",
            reasoning=raw.get("reasoning"),
            risk_level=raw.get("risk_level"),
            risk_notes=raw.get("risk_notes"),
            reversibility_plan=raw.get("reversibility_plan"),
            owner=raw.get("owner"),
            followups=raw.get("followups"),
            evidence_refs=raw.get("evidence_refs"),
        )

    def _is_valid_record(self, record: DecisionRecord) -> bool:
        """Check if a record is valid for analysis.

        Args:
            record: The decision record to validate.

        Returns:
            True if the record is valid, False otherwise.
        """
        # Must have a timestamp
        if not record.ts and not record.timestamp:
            return False

        # Check if this record was marked as malformed during loading
        if id(record) in self._malformed_records:
            return False

        return True

    def _analyze_data_quality(
        self,
        all_records: list[DecisionRecord],
        valid_records: list[DecisionRecord],
    ) -> DataQuality:
        """Analyze the quality of decision record data.

        Args:
            all_records: All loaded records including malformed ones.
            valid_records: Only the valid records.

        Returns:
            DataQuality metrics.
        """
        missing_fields: dict[str, int] = {}
        fields_to_check = ["category", "decision_type", "actor", "rationale", "evidence_refs"]

        for record in valid_records:
            for field_name in fields_to_check:
                value = getattr(record, field_name, None)
                if not value:
                    missing_fields[field_name] = missing_fields.get(field_name, 0) + 1

        return DataQuality(
            total_records=len(all_records),
            valid_records=len(valid_records),
            malformed_records=len(all_records) - len(valid_records),
            missing_fields=missing_fields,
        )

    def get_missed_escalations(self) -> list[DecisionRecord]:
        """Get one-way door decisions that were not escalated to humans.

        These represent potentially risky decisions made autonomously
        by agents that should have been reviewed by humans.

        Returns:
            List of one-way door decisions made by agents.
        """
        result = self.analyze()
        return [r for r in result.one_way_doors if r.actor == "agent"]

    def get_trivial_escalations(self) -> list[DecisionRecord]:
        """Get two-way door decisions that were unnecessarily escalated.

        These represent low-risk, reversible decisions that were
        escalated to humans when agents could have handled them.

        Returns:
            List of two-way door decisions made by humans.
        """
        result = self.analyze()
        return [r for r in result.two_way_doors if r.actor == "human"]


__all__ = [
    "DataQuality",
    "DecisionAnalysisResult",
    "DecisionAnalyzer",
    "EscalationStats",
]
