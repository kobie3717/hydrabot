"""
Synthesis Agent - Unified incident report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 5 incident response agents: LogAnalyzer, RootCause, Mitigation, Comms, Postmortem.
Produce a unified incident report as JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "severity": "<SEV1|SEV2|SEV3>",
  "status": "<ONGOING|RESOLVED|MONITORING>",
  "summary": "<2-3 sentences>",
  "root_cause": "<one sentence>",
  "immediate_actions": ["<action 1>", "<action 2>"],
  "permanent_fixes": ["<fix 1>", "<fix 2>"],
  "customer_update": "<text>",
  "postmortem_highlights": {
    "timeline": "<summary>",
    "five_whys": "<chain>",
    "top_action_items": ["<item 1>", "<item 2>", "<item 3>"]
  }
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
