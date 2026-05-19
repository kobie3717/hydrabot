"""
Synthesis Agent - Content strategy report
"""

from ..base import BaseAgent


SYSTEM_PROMPT = """You receive outputs from 4 content agents: Researcher, SEO, Tone, Distribution.
Produce a content strategy report as JSON.

OUTPUT — respond ONLY with valid JSON:
{
  "content_score": <int 0-100>,
  "publish_ready": <true|false>,
  "summary": "<2-3 sentences>",
  "findings": [
    {
      "agent": "<researcher|seo|tone|distribution>",
      "title": "<title>",
      "priority": "<HIGH|MEDIUM|LOW>",
      "detail": "<finding>",
      "action": "<what to do>"
    }
  ],
  "top_channels": ["<channel 1>", "<channel 2>", "<channel 3>"],
  "required_changes_before_publish": ["<change 1>", "<change 2>"]
}"""


synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt=SYSTEM_PROMPT,
    model="claude-sonnet-4-6",
    max_tokens=4000
)
