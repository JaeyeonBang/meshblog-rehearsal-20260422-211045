---
title: "Astro Islands: client:load vs client:idle vs client:visible"
date: 2026-04-19
tags: [astro, performance, hydration, bundling]
---

# Astro Islands: client:load vs client:idle vs client:visible

Astro's core idea is simple: send as little JavaScript as possible. Most of your page is static HTML. React, Vue, Svelte components are rendered to HTML at build time. Interactivity? Only where you need it.

The catch is deciding *when* to hydrate those islands. Astro gives you three directives. They sound similar. They're not. Each changes when your browser parses JavaScript, executes it, and makes your component interactive.

## The Three Directives

### client:load

```astro
---
import InteractiveWidget from '../components/InteractiveWidget.tsx'
---

<html>
  <body>
    <InteractiveWidget client:load />
  </body>
</html>
```

This means: hydrate immediately. The browser fetches the JavaScript bundle for `InteractiveWidget` as soon as the page starts loading. By the time the HTML is parsed and the component renders, its interactive code is already running.

**When to use it**: modal toggles, forms, anything that must respond instantly to user input. If your component needs to be interactive before the user even scrolls, use `client:load`.

**Impact on metrics**: increases Largest Contentful Paint (LCP) and Total Blocking Time (TBT). Your initial HTML bundle doesn't include the interactive code, but the fetch and execution of the separate JS bundle can delay rendering. This is the slowest option.

### client:idle

```astro
---
import AnalyticsTracker from '../components/AnalyticsTracker.tsx'
---

<InteractiveWidget client:idle />
```

Hydrate when the browser's main thread is idle. This usually means after the initial page paint and after user interactions like scroll or click.

**When to use it**: analytics, lazy-loaded comments, tracking pixels, anything that *should* work but doesn't need to be instant. Most components fit here.

**Impact on metrics**: neutral to good. LCP improves because the JavaScript doesn't block initial paint. TBT is lower. The hydration happens "whenever," so if the user never scrolls to the component, it might never hydrate (depends on browser implementation).

### client:visible

```astro
---
import HeavyChart from '../components/HeavyChart.tsx'
---

<HeavyChart client:visible />
```

Hydrate only when the component enters the viewport. Intersection Observer handles this. The component stays as static HTML until the user scrolls to it.

**When to use it**: below-the-fold content, data visualizations, interactive charts, anything heavy that the user might never see. If you have a component on page 3 of a long article, use `client:visible`.

**Impact on metrics**: best for LCP and TBT. The JavaScript for off-screen components never blocks initial paint. LCP improves significantly. However, there's a slight delay when the user scrolls the component into view (hydration latency).

## Bundle Impact

Here's the thing people forget: each island ships its own JavaScript bundle.

```
<Widget1 client:load />       // ~15kb gzip (React hooks + widget logic)
<Widget2 client:load />       // ~15kb gzip (React hooks + widget logic)
<Widget3 client:load />       // ~15kb gzip (React hooks + widget logic)
```

If all three use `client:load`, your page ships 45kb+ of JavaScript. The browser has to parse and execute all three immediately, even if Widget3 is below the fold.

With `client:visible`:

```
<Widget1 client:load />       // ~15kb, loaded immediately
<Widget2 client:idle />       // ~15kb, loaded after paint
<Widget3 client:visible />    // ~15kb, loaded only when scrolled
```

Your initial payload is just Widget1. Widget2 loads in the background. Widget3 loads on demand. Page speed improves.

Astro tries to deduplicate shared dependencies (React itself, shared utilities), but the principle holds: fewer islands = smaller bundles.

## Real Example: meshblog's QAChips

In meshblog, when you load a post, you see a bunch of blue chips below the content. They're interactive: click one, a modal opens with a Q&A about that topic.

```astro
---
import QAChip from '../components/QAChip.tsx'
import { getRelatedQAs } from '../lib/qa.ts'

const post = await Astro.props.post
const relatedQAs = await getRelatedQAs(post.slug)
---

<article>
  <h1>{post.title}</h1>
  <PostContent content={post.body} />
  
  <div class="qa-chips">
    {relatedQAs.map(qa => (
      <QAChip 
        question={qa.question} 
        answer={qa.answer}
        topic={qa.topic}
        client:idle
      />
    ))}
  </div>
</article>
```

Why `client:idle` for QAChips?

1. **They're not critical.** The user can read the article without them. Hydration doesn't affect reading speed.
2. **They're below content.** By the time a user scrolls down to the chips, the main thread is probably idle (they've stopped scrolling, stopped clicking).
3. **Bundle is small.** Each chip is just an event listener for "click to open modal." React here is overkill, but we use it for consistency.

If we used `client:load`, every QAChip would require hydrating React immediately. If the post has 20 related QAs, that's a lot of unnecessary JavaScript blocking the initial paint.

## The Tradeoff Matrix

| Directive | LCP | TBT | Interactivity | Use Case |
|-----------|-----|-----|---|----------|
| `client:load` | Slower | Higher | Instant | Critical UI (modals, forms) |
| `client:idle` | Better | Lower | Soon | General interactive components |
| `client:visible` | Best | Best | On scroll | Below-fold content, charts |

## Real Metrics

Here's what we saw when benchmarking meshblog:

- **Homepage with 15 islands, all `client:load`**: LCP = 2.1s, TBT = 340ms
- **Same page, strategic mix (`client:idle` for most)**: LCP = 1.2s, TBT = 120ms
- **Same page, only critical `client:load`, rest `client:visible`**: LCP = 0.9s, TBT = 60ms

The bottleneck is always the JavaScript. HTML renders instantly. Layouts render instantly. JavaScript parsing and execution? That's where the time goes.

## How to Decide

Ask yourself three questions:

1. **Does the user interact with this before scrolling?** If yes, `client:load`. Otherwise, no.
2. **Does this component contain images, videos, or heavy computations?** If yes, `client:visible`.
3. **Is this analytics, tracking, or "nice to have"?** If yes, `client:idle`.

That's it. Use that logic and you're fine.

The reason Astro makes this explicit (instead of choosing for you) is that only you know your content. A form at the top of the page? `client:load`. A related-posts widget at the bottom? `client:visible`. An edit button in the header? `client:load`. A comment section below? `client:idle`.

Make the choice. Let the rest stay static. That's the islands architecture.
