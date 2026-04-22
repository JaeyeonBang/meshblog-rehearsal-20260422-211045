---
title: "React Hooks 입문"
date: 2026-04-18
tags: [react, javascript, frontend]
level_pin: 2
---

# React Hooks 입문

React 16.8부터 도입된 Hooks는 함수 컴포넌트에서 상태와 라이프사이클을 다룰 수 있게 해준다.

대표적인 Hook:
- `useState` — 상태 관리
- `useEffect` — 사이드 이펙트 (마운트/언마운트, 외부 API 호출)
- `useMemo` — 비싼 계산 캐싱
- `useCallback` — 함수 메모이제이션

이전에는 클래스 컴포넌트로만 가능했던 것들이 함수형으로 깔끔하게 표현된다.
TypeScript와 함께 쓰면 타입 추론이 잘 된다.
