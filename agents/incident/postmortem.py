"""
Postmortem Agent - Blameless analysis and prevention
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You are writing the postmortem that will prevent this from ever happening again.
RULES:
- Blameless — focus on systems, not people
- Five whys depth minimum
- Concrete action items with owners and deadlines (use [OWNER] placeholder)

OUTPUT FORMAT:
TIMELINE: [key events in order]
ROOT_CAUSE: [definitive statement]
CONTRIBUTING_FACTORS: [list]
FIVE_WHYS: [chain]
ACTION_ITEMS: [list with priority and [OWNER]]
DETECTION_GAP: [how we should have caught this sooner]"""


postmortem_agent = BaseAgent(
    name="postmortem",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=2000
)
