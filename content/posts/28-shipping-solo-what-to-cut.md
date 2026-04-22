---
title: "Shipping Solo: What to Cut"
date: 2026-04-19
tags: [shipping, scope, product, process]
---

# Shipping Solo: What to Cut

One person, infinite ideas, fixed time. The constraint that kills solo projects isn't code speed. It's scope creep. I cut a lot while building meshblog. Here's the rubric I used, and what I cut, and why it mattered.

## The Core Question

"Will this change whether someone shares the link in the next week?"

If yes: ship it. If no: defer.

That's it. No fancy prioritization matrix. No "nice to have" list that you trick yourself into shipping anyway. Just the threshold question.

## What I Cut (And When)

### Dark Mode Toggle

First draft had a manual dark/light mode switch in the header. Looked polished. Took 2 hours to implement properly (system preference detection, localStorage persistence, Tailwind config, SSR hydration match).

Question: does a dark mode toggle change whether someone shares meshblog? Probably not. They share because the content is interesting, not because they can toggle the theme.

Deferred. Shipped without it. Later, I added system theme detection (respects user's OS preference) with no toggle. 30 minutes, no UI clutter.

Verdict: the right thing cut at the right time. If I'd shipped the toggle, I'd have context-switched twice (once to build it, once to remove it), wasting 4 hours total.

### Graph Aesthetic Pass

The knowledge graph (force-directed visualization) started rough. Node size was uniform, colors were dull, links were gray, hover states were missing.

I wanted to spend a week polishing: gradient fills, pulsing animation on selected nodes, link thickness tied to relationship strength, transition effects. It would look great.

Question: does the graph animation pass change whether someone shares? No. The graph is cool because it shows you related posts, not because the nodes glow.

Deferred. Shipped with minimal styling: basic circles, neutral colors, simple hover. Took 1 hour instead of 40.

Current state: still deferred. The graph works and looks decent. If I had cycles after shipping, I'd refine it. But "decent" is enough now.

### Live Content Dry-Run System

I built a local test mode that simulates the LLM Q&A without making API calls (for cost, latency, iteration). Took 6 hours to set up realistically (mock responses, fake embeddings, simulated latency).

Useful for development. But is it blocking ship? No. The real Q&A works. I can pay $5 for API calls while testing.

Deferred. Shipped with a config flag: if you set `DEV_MODE=true`, the Q&A endpoint logs requests instead of calling the API. Took 30 minutes, unblocks development, stays deferred.

Later, if the API cost becomes an issue, I'll build the full dry-run. Not now.

### Custom Theme Colors

"What if users could customize the blog's color scheme?" Configurable primary color, accent color, spacing scale.

10 hours to build a UI for it, another 5 to sync to localStorage, 3 more for the Tailwind config variables. 18 hours.

Question: does customization change whether someone shares? For most users, no. They care about content. For one user (me), maybe, someday.

Deferred hard. Shipped with fixed, pleasant colors. One person can change the CSS if they want their own fork.

Verdict: I'm glad I cut this. It's a feature that would have felt incomplete for months (only colors are custom, not fonts? not spacing?). Better to ship a cohesive design and let it be.

### Markdown Syntax Extensions

"What if I support footnotes, callout boxes, and table of contents like Obsidian?"

Each one is a parser plugin, ~2 hours each. 6 hours total.

Question: does it change whether someone shares? The average reader doesn't care. They read the text and bounce. Advanced readers might find footnotes useful, but... how often?

Deferred. Shipped with vanilla markdown + custom styling for blockquotes and code. If I write a post that demands footnotes, I'll add them then. Not before.

## The Pattern

Every deferred feature had the same shape:
1. It was polish, not core
2. It would add 5-20 hours
3. The MVP worked without it
4. No user asked for it (because there were no users yet)

The mistake: building for a hypothetical user who cares about dark mode, custom colors, and smooth animations. The real user reads, finds value, shares. They don't care if the toggle is missing.

## What I Kept

The inverse: what stayed because it passes the test?

**Post search:** Yes. Readers come for posts. If search doesn't work, they leave. Ship it.

**Knowledge graph:** Debatable. But it's the concept of meshblog. If the graph didn't exist, it's a different product. Ship it.

**LLM Q&A:** Yes. It's the differentiator. It's why you share. Ship it.

**Code syntax highlighting:** Yes. Readers are developers. They need to read code. Ship it.

**RSS feed:** Maybe. For a personal blog, 20% of readers might use RSS. But it's 30 minutes to add. Ship it.

**Responsive design:** Yes. Mobile users exist. Ship it.

**Dark mode toggle:** No. Deferred.

**Theme customization:** No. Deferred.

**Animations/transitions:** No. Nice to have, deferred.

## The Time Cost

If I'd shipped everything I thought of:
- 200+ hours of work
- 3-6 months of solo development
- Ship date: January 2027

Instead:
- 80 hours
- 6 weeks
- Ship date: April 2026

What I lost: polish. What I gained: a live blog and user feedback. The feedback is more valuable than the polish. Feedback tells me what to build next. Shipping sooner compounds that advantage.

## Current Decision

Now that meshblog is live, I'll add features based on what readers actually care about. Comments? Reactions? Custom themes? They'll tell me. Until then, I stick to the rule: does it change whether someone shares? If not, it waits.

That's how solo projects ship.
