---
title: "The Case for Static Sites in 2026"
date: 2026-04-19
tags: [astro, ssg, performance, architecture, ssr]
---

# The Case for Static Sites in 2026

Everyone assumes SSR is faster. "Dynamic content at request time." Sounds better than "pre-generated HTML." But for a personal blog, even one with LLM-powered Q&A, static generation wins. Here's why.

## The Conventional Wisdom

SSR (Server-Side Rendering):
- "Fresh content every request"
- "Dynamic personalization"
- "Real-time updates"

It sounds modern. Vercel's marketing leans on it. Next.js is the default.

The trade-off? You need a server. Always on. Processing every request. This costs money at scale.

For a blog? You pay for a capability you don't use. The content is static. The user experience is "read post, maybe ask a follow-up question." That's it.

## Static Site Generation (SSG) in 2026

The meshblog stack: Astro + React islands.

**Build time:** 12 seconds.
**Output:** 47 .html files + 3 .js bundles.
**Deployment:** S3 + CloudFront.
**Cost:** $1/month, mostly S3 storage.
**CDN latency:** 20ms (global, 200+ edge locations).

You generate HTML once. Push it to a CDN. Requests hit the edge, not a server. Latency is geography, not computation.

SSR comparison (Vercel):
**Build + deploy:** 2 minutes.
**Runtime:** Node.js + inference calls.
**Cost:** $20-80/month at low traffic (compute, edge functions, data transfer).
**Latency:** 50-200ms (edge function cold start, API calls).

For the same content.

## Why SSR Feels Faster

**ISR (Incremental Static Regeneration):** Vercel's feature where you revalidate on demand. It's smart marketing because it sounds like "the best of both worlds." In practice, it's a config nightmare. How often do you revalidate? Every 60 seconds? Every request? You end up guessing.

Astro's approach: regenerate when you push new content. Simple.

## The LLM Q&A Exception

meshblog generates Q&A at build time. So doesn't it lose the "dynamic" advantage?

Not really. Here's the flow:

1. **During build:** chunk the post content, extract entities, generate embeddings, and pre-compute Q&A pairs with an LLM. Store everything as static JSON alongside the post.
2. **On request:** CloudFront serves the HTML + the pre-computed Q&A cards already baked in
3. **In the browser:** readers see the Q&A immediately — no API call, no wait, no spinner
4. **Search across Q&A:** Fuse.js runs client-side over the pre-built index

No server. No runtime LLM calls. The expensive work happens once at build time, and every reader pays $0 to get the answer.

You get a richer Q&A experience than SSR (no latency), with zero runtime compute cost.

## Real Numbers from meshblog

### Build

```
Building with Astro...
✓ Completed in 12.3 seconds
Generating embeddings...
47 pages, 8 chunks per page
Storing 376 embeddings (1.2MB JSON)
Total output: 3.2MB
```

### Serving

**Edge latency (CloudFront):**
- DC, US East: 20ms
- London: 45ms
- Tokyo: 80ms
- Average: 50ms global

**Page weight:**
- HTML: 15KB (gzip)
- JS: 32KB (Astro framework + React island)
- CSS: 8KB (gzip)
- Total: 55KB

**Largest Contentful Paint (LCP):** 0.8 seconds (Tokyo, slow 4G)

For SSR:
- HTML generation: 40ms
- JS download: 60KB
- Hydration: 300ms
- LCP: 1.2 seconds

Static wins on LCP, ties on total weight (edge compute adds JS over-the-wire).

### Cost Breakdown

**meshblog (static):**
- S3 storage: $0.10/month (3.2MB)
- CloudFront: $0.85/month (10GB/month traffic estimate, 100 readers)
- LLM API at build time: $0.25-$0.50 per full rebuild (entity extraction + Q&A generation)
- Total: ~$2/month

**Next.js SSR (rough Vercel estimate):**
- Serverless functions: $20/month (100 requests/day, cold starts)
- ISR regeneration: $5/month
- Edge middleware: $5/month
- Data transfer: $10/month
- Total: ~$40/month

For the same reader experience.

## When to Use SSG vs SSR

**Use SSG if:**
- Content is mostly static (blog, docs, marketing site)
- You're willing to rebuild on content changes (minutes, not seconds)
- The reader base is global (CDN edge latency >> backend latency)
- You want low operational cost
- You don't need real-time personalization

**Use SSR if:**
- Content changes mid-request (stock prices, live dashboards)
- You need real-time personalization (user-specific feeds)
- The build process is expensive (thousands of pages, hours to generate)
- You have dynamic ads or A/B testing

A blog? SSG. A news feed? SSR. A personal knowledge base like meshblog? SSG.

## The Hybrid Approach

Astro shines here. You get:
- Static generation (default)
- Server-side rendering for specific routes (`export const prerender = false`)
- React islands for interactivity (hydration on demand)

meshblog uses two of these:
1. **Static posts** (prerendered HTML with Q&A cards baked in)
2. **React islands** (Q&A search + graph viz, hydrate on idle or when scrolled into view)

No SSR routes. The Q&A is pre-computed at build time, so the island just renders and searches a static JSON index. The post is instant (CDN edge), the Q&A is instant (already in the bundle).

## The Real Reason: Operational Simplicity

SSR = always-on infrastructure. You need:
- Monitoring (is the server down?)
- Logging (what broke?)
- Auto-scaling (did traffic spike?)
- Database connections (for cached queries)
- Secrets management (API keys)

Static + CDN = push and forget.

```bash
# Build and deploy
npm run build
aws s3 sync dist/ s3://meshblog
aws cloudfront create-invalidation --paths "/*"
```

Done. No server status page. No pager duty. No "the database was slow at 3am."

For a solo project, that simplicity is worth more than any theoretical SSR advantage.

## Conclusion

In 2026, you don't need a server for a blog. CDN edge computing is fast enough. Build-time embeddings are good enough. Client-side API calls are simple enough.

meshblog proves it. Fast, cheap, reliable. No server. No complexity. Just static files and a CDN.

That's the win.
