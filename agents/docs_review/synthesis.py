"""
Synthesis Agent - Documentation quality report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 4 docs review agents: Accuracy, Readability, Examples, Maintenance.
Produce a documentation quality report as JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "docs_score": <int 0-100>,
  "publish_ready": <true|false>,
  "summary": "<2-3 sentences>",
  "findings": [
    {
      "agent": "<accuracy|readability|examples|maintenance>",
      "title": "<title>",
      "severity": "<CRITICAL|HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<what to fix>"
    }
  ],
  "blocking_issues": ["<issue 1>"],
  "top_improvements": ["<improvement 1>", "<improvement 2>", "<improvement 3>"]
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
