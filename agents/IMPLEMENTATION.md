# Adding New Agent Packs

Guide for 007 and contributors. Adding a pack = 4 files + 1 registry entry.

## Structure

Each pack lives in `agents/<packname>/`:

```
agents/
  mypack/
    __init__.py        required
    agent_a.py         one file per agent role
    agent_b.py
    synthesis.py       aggregates all agent outputs
    orchestrator.py    entry point — async run_mypack(document) → dict
```

## Step 1: Create agent files

Each agent = one `BaseAgent` with an adversarial or specialist system prompt.

```python
# agents/mypack/analyst.py
from ..base import BaseAgent

analyst_agent = BaseAgent(
    name="analyst",
    system_prompt="""You are a [ROLE] analyst reviewing a document.

Your job: [SPECIFIC ADVERSARIAL OR EXPERT ANGLE].

Find [WHAT TO FIND]. Be specific. Use evidence from the document.
Never make up facts not present in the text.

Return ONLY this JSON:
{
  "findings": ["specific finding 1", "specific finding 2"],
  "risk_level": "LOW|MEDIUM|HIGH|CRITICAL",
  "key_question": "the single most important question this raises"
}""",
    max_tokens=2000
)
```

## Step 2: Create synthesis.py

Aggregates all agent outputs into a final structured result.

```python
# agents/mypack/synthesis.py
from ..base import BaseAgent

synthesis_agent = BaseAgent(
    name="synthesis",
    system_prompt="""You receive reports from multiple specialist agents.
Synthesize into a final verdict.

Return ONLY this JSON:
{
  "score": 0-100,
  "verdict": "PROCEED|PROCEED_WITH_CAUTION|DO_NOT_PROCEED",
  "summary": "2-3 sentence executive summary",
  "top_findings": ["finding 1", "finding 2", "finding 3"],
  "top_questions": ["question 1", "question 2", "question 3"]
}""",
    max_tokens=3000
)
```

## Step 3: Create orchestrator.py

Runs agents in parallel, feeds results to synthesis, returns dict.

```python
# agents/mypack/orchestrator.py
import asyncio
import json
from .analyst import analyst_agent
from .risk import risk_agent
from .synthesis import synthesis_agent

async def run_mypack(document: str) -> dict:
    # Run all agents in parallel
    results = await asyncio.gather(
        analyst_agent.run(document),
        risk_agent.run(document),
        return_exceptions=True
    )

    # Filter errors
    agent_outputs = []
    for r in results:
        if isinstance(r, Exception):
            continue
        agent_outputs.append(r)

    # Synthesize
    combined = "\n\n---\n\n".join(agent_outputs)
    raw = await synthesis_agent.run(combined)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw, "error": "synthesis parse failed"}
```

## Step 4: Create __init__.py

```python
# agents/mypack/__init__.py
from .orchestrator import run_mypack

__all__ = ["run_mypack"]
```

## Step 5: Register in registry.py

Add ONE entry to `AGENT_PACKS` in `agents/registry.py`:

```python
from .mypack.orchestrator import run_mypack

AGENT_PACKS["mypack"] = {
    "name": "My Pack Name",
    "description": "One line — what it does and from whose perspective",
    "run": run_mypack,
    "input": "What kind of document to pass in",
    "output": "What the output dict contains",
}
```

**That's it.** The Telegram bot (`bots/agent-bot/`) automatically lists and runs it.

## Pack Ideas for 007

| Pack ID | Agents | Input | Use case |
|---------|--------|-------|----------|
| `due_diligence` | financial, reputation, legal, market, people | Company profile | Validate partner/client |
| `saas_health` | metrics, churn, pricing, growth, burn | SaaS metrics doc | Analyze SaaS business |
| `pitch_coach` | clarity, market_fit, numbers, story, competition | Pitch deck text | Improve investor pitch |
| `contract_review` | risk, obligations, ip, exit, dispute | Contract text | Flag red flags |
| `market_entry` | tam, competitors, channels, timing, moat | Market description | Should we enter? |
| `hiring` | skills, culture, red_flags, trajectory, fit | CV/resume | Evaluate candidate |

## Tips

- **Adversarial > Balanced** — packs work best when each agent has ONE strong angle, not trying to be fair
- **JSON output always** — synthesis must return parseable JSON so the bot can format it
- **Parallel by default** — `asyncio.gather()` in orchestrator runs agents simultaneously (~10s not ~50s)
- **Model choice** — use `claude-sonnet-4-6` (default) for analysis, `claude-haiku-4-5` for cheap/fast agents
- **Prompt caching** — for large system prompts, add `cache_control` (see Anthropic docs)
