---
name: webbs
description: Use when building or redesigning any frontend UI — landing pages, components, dashboards, auction interfaces, forms, web apps. Trigger on "make it look good", "build a page", "redesign this", "frontend", "UI", "component", "website". webbs 🕸️ spins production-ready HTML/CSS/JS or React with modern aesthetics, animations, mobile-first.
---

# webbs 🕸️

> *Every pixel is a thread. Make the web beautiful.*

Frontend specialist that spins complete, deployable web interfaces. Not mockups — real, running code.

## Distinct from other design skills
- `frontend-design`: broad creative direction, explorative
- `interface-design`: dashboards and admin panels
- **webbs**: delivery-focused, production-ready output, strong opinions, fast execution

## Process (always follow this order)

1. **Context** — what is this for? who uses it? what's the brand?
2. **Direction** — commit to ONE aesthetic: dark+glass, brutalist, editorial, minimal, bold gradient
3. **Build** — complete runnable code, zero placeholders
4. **Polish** — hover states, transitions, mobile breakpoints, accessibility

## Stack (opinionated)

**Preferred:**
- Tailwind CSS (via CDN or config)
- CSS custom properties for theming
- CSS Grid + Flexbox
- Vanilla JS or React (when asked)

**Never:**
- Bootstrap
- jQuery (unless legacy required)
- Placeholder colors (`#ccc`, `gray`)
- `Lorem ipsum` text
- Inline styles (except dynamic JS animations)

## WhatsAuction Brand

When building for WhatsAuction:
- Primary: `#FF6B35` (orange)
- Dark bg: `#0F0F0F` or `#111827`
- Surface: `#1A1A2E` or `#1F2937`
- Text: `#F9FAFB`
- Accent glow: `rgba(255,107,53,0.3)`
- Font: Inter or Sora

Auction lot card pattern:
```html
<div class="lot-card">
  <div class="lot-image">…</div>
  <div class="lot-body">
    <span class="lot-number">Lot 001</span>
    <h3 class="lot-title">…</h3>
    <div class="bid-row">
      <span class="current-bid">R 1,200</span>
      <button class="bid-btn">Bid Now</button>
    </div>
  </div>
</div>
```

## Design Tokens (default dark theme)

```css
:root {
  --bg-primary: #0F0F0F;
  --bg-surface: #1A1A2E;
  --bg-elevated: #16213E;
  --accent: #FF6B35;
  --accent-glow: rgba(255,107,53,0.3);
  --text-primary: #F9FAFB;
  --text-muted: #9CA3AF;
  --border: rgba(255,255,255,0.08);
  --radius: 12px;
  --shadow: 0 4px 24px rgba(0,0,0,0.4);
  --transition: 200ms cubic-bezier(0.4, 0, 0.2, 1);
}
```

## Component Patterns

### Button
```css
.btn-primary {
  background: var(--accent);
  color: white;
  padding: 0.625rem 1.5rem;
  border-radius: 8px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: var(--transition);
  box-shadow: 0 0 0 0 var(--accent-glow);
}
.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px var(--accent-glow);
}
.btn-primary:active { transform: translateY(0); }
```

### Glass Card
```css
.glass-card {
  background: rgba(255,255,255,0.04);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
}
```

### Micro-animation (number count-up, pulse badge)
```js
// Count-up animation
const countUp = (el, target, duration=1500) => {
  const start = performance.now();
  const update = (now) => {
    const progress = Math.min((now-start)/duration, 1);
    el.textContent = Math.floor(progress * target).toLocaleString();
    if (progress < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
};
```

## Output Rules

- Always complete, runnable HTML file OR complete React component
- Always include `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Always mobile-first media queries (`min-width`, not `max-width`)
- Always at least one hover/focus state per interactive element
- Never TODO comments in output
- Never `[placeholder]` text
- Always semantic HTML (`<nav>`, `<main>`, `<section>`, `<article>`)
- Always ARIA labels on interactive elements without visible text

## Anti-patterns

| Bad | Good |
|-----|------|
| `color: gray` | `color: var(--text-muted)` |
| `<div class="button">` | `<button type="button">` |
| `font-family: Arial` | `font-family: 'Inter', sans-serif` |
| `background: #ccc` | `background: var(--bg-surface)` |
| Pixel-fixed heights | `min-height` + padding |
| `!important` everywhere | Proper specificity |

## Quick Checklist Before Shipping

- [ ] Runs without errors in browser
- [ ] Looks good on 375px (iPhone SE)
- [ ] Looks good on 1440px (desktop)
- [ ] Interactive elements have hover/focus states
- [ ] No placeholder content
- [ ] Semantic HTML used
