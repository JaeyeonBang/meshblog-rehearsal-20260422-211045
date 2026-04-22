---
title: "Next.js App Router와 RSC"
date: 2026-04-18
tags: [nextjs, react, server-components]
---

# Next.js App Router와 RSC

Next.js 13부터 도입된 App Router는 React Server Components(RSC)를 1급 시민으로 다룬다.
서버에서 데이터 패칭과 렌더링을 끝내고, 클라이언트로는 최소한의 JS만 보낸다.

장점:
- Bundle size 감소
- DB/API 호출을 서버에서 직접 (Prisma, Drizzle 등 ORM과 자연스러움)
- React 18의 Suspense + streaming SSR 활용

단점:
- 멘탈 모델이 클라이언트/서버 경계로 이중화됨
- "use client" 지시문을 잘못 두면 hydration mismatch 발생
