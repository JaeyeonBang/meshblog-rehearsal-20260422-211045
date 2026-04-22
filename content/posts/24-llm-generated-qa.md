---
title: "LLM-generated Q&A가 블로그를 바꾸는 이유"
date: 2026-04-19
tags: [llm, rag, content, user-experience, design]
---

# LLM-generated Q&A가 블로그를 바꾸는 이유

블로그의 기본 형태는 수천 년 전이랑 같다. 글을 쓰고, 독자가 읽는다. 댓글이 추가되면서 대화의 느낌이 생겼다. 추천 알고리즘이 추가되면서 발견의 느낌이 생겼다.

LLM-generated Q&A는 그다음 단계다. 글을 읽는 것도 아니고, 검색하는 것도 아니다. **질문을 던지는 경험**이다. 그리고 그 질문의 답이 내 개인 지식에서 나온 거다.

## 검색은 왜 부족한가

검색은 keyword matching이다.

사람이 "Node.js는 single-threaded인데 어떻게 동시에 요청을 처리할 수 있지?"라고 검색한다. 좋은 검색 엔진은 "Node.js event loop"에 관한 글을 건네준다. 근데 이건 LLM 없이도 되는 일이다. 키워드를 매칭하면 된다.

문제는 **맥락이 사라진다**는 거다. 사람은 "Node.js event loop"를 이해하려면 먼저 "JavaScript는 single-threaded다"를 알아야 한다. 그리고 "Microtask vs Macrotask"의 차이도 알아야 한다. 그리고 "Call stack"도 알아야 한다.

검색 엔진은 이 모든 게 연결되어 있다는 걸 모른다. 그냥 "event loop"라는 키워드 하나만 본다. 독자가 관련 글들을 찾아 헤매는 동안, 시간이 흐른다.

LLM-generated Q&A는 다르다. "Node.js"라는 글 위에 다섯 개의 Q&A가 있다고 치자.

```
Q: Node.js가 single-threaded라고 했는데, 어떻게 여러 요청을 동시에 처리해요?
A: JavaScript는 single-threaded지만, Node.js는 libuv라는 C++ 라이브러리를 써서 OS 레벨의 쓰레드 풀을 활용해요. 
   Event loop가 요청들을 번갈아가며 처리하고, 시간이 걸리는 작업(DB, 파일)은 쓰레드 풀에 맡겨요.

Q: 그럼 메모리는 어떻게 되는데?
A: 각 쓰레드가 스택을 가지고 있지만, heap은 공유해요. 그래서 context switching할 때 메모리 오버헤드가 작아요.

Q: JavaScript의 event loop와 Node.js의 libuv event loop가 다른 건가?
A: 개념은 같아. JavaScript의 event loop는 브라우저나 Node.js 런타임 같은 environment가 제공해줘요.
   Node.js 경우 libuv가 그 역할을 해요.
```

이 Q&A들은 모두 내가 쓴 다른 글들의 맥락에서 생성된 거다. 임베딩 검색으로 "Node.js", "JavaScript", "Event loop", "Libuv", "Call stack" 등 관련 글을 찾아서 LLM한테 넘기고, LLM이 그걸 바탕으로 Q&A를 만든 거다.

독자는 검색할 필요가 없다. 궁금한 게 생기면 Q&A를 본다. Q&A 안에 답이 있으면 좋고, 없으면 링크를 따라 다른 글로 간다. 그게 자연스럽다.

## Pre-answering vs Search

이게 핵심이다. **Pre-answering**.

기존 블로그: 글 -> (독자가 의문) -> (검색) -> 다른 글

LLM Q&A: 글 -> (독자가 의문) -> Q&A에 있음! -> 클릭

한 단계가 줄어든다. 그리고 더 중요한 건, **내가 미리 생각한 질문이 나열되어 있다**는 거다. 독자가 "혹시 이것도 궁금할까?"라고 물을 만한 질문들.

이건 에고의 문제가 아니다. 독자의 관점에서 봤을 때, "혹시 X도 궁금할까?"라는 질문을 엔지니어가 미리 생각하고 답해두는 게 도움이 된다. 특히 초보자 입장에서.

## Prompt 설계의 트레이드오프

LLM-generated Q&A의 질은 prompt에 달려있다.

### Context 선택

```typescript
// BAD: 너무 많은 context
const context = await embeddings.search(topic, {limit: 50})
const qa = await llm.generate(topic, context)
// LLM이 혼동한다. 50개 글의 일관성이 안 맞을 수 있다.

// GOOD: 선별된 context
const context = await embeddings.search(topic, {limit: 10})
                    .sort((a, b) => b.relevance - a.relevance)
                    .slice(0, 5)
const qa = await llm.generate(topic, context)
// 가장 관련성 높은 5개만 보낸다. LLM이 일관성 있는 답을 만든다.
```

Context가 많을수록 정보는 풍부해지지만, LLM이 혼동하기 쉬워진다. 내 경험상 5-10개가 최적이다.

### Depth 조절

Q&A의 깊이를 prompt로 조절할 수 있다.

```typescript
// Beginner-friendly
const prompt1 = `
당신은 초보 프로그래머에게 설명하는 기술 블로거입니다.
복잡한 용어를 피하고, 예시를 많이 드세요.
각 답변은 50단어 이내.
`

// Expert-friendly
const prompt2 = `
당신은 시니어 엔지니어들을 위해 쓰는 블로거입니다.
깊이 있는 설명을 하고, 엣지 케이스를 다루세요.
각 답변은 200단어 이내.
`
```

meshblog는 multi-tier Q&A를 지원한다. 같은 topic에 대해 초보자 버전과 고급자 버전을 만들 수 있다.

### 다양성

만약 같은 주제로 5개의 Q&A를 만든다면, 각 질문이 다른 각도를 봐야 한다.

```typescript
const perspective = [
  "초보자의 관점에서",
  "성능 최적화 관점에서",
  "보안 관점에서",
  "유지보수성 관점에서",
  "역사적 맥락에서"
]

for (const p of perspective) {
  const qa = await llm.generate(topic, context, p)
  // 같은 topic이지만 다른 질문이 나온다.
}
```

## 계층 구조: Note Tier / Concept Tier / Global Tier

meshblog는 세 단계의 Q&A를 생성한다.

### Note-tier Q&A

특정 글 밑에 붙는 Q&A. "이 글을 읽으면서 생길 법한 질문들."

```
[글: React의 Virtual DOM]

Q: Virtual DOM이 실제 DOM보다 왜 빠른데?
A: ...

Q: Virtual DOM의 reconciliation은 어떻게 동작하는데?
A: ...
```

Context는 이 글 자신과 링크된 5-10개 글. Depth는 중간 수준.

### Concept-tier Q&A

여러 글을 가로지르는 개념에 대한 Q&A. 예를 들어 "State Management"는 React 글에도 나오고, Vue 글에도 나온다. Concept-tier Q&A는 그 둘을 연결한다.

```
[개념: State Management]

Q: React의 useState와 Vue의 ref의 차이가 뭐죠?
A: ...

Q: State Management를 언제 고급 라이브러리로 옮겨야 하나요?
A: ...
```

Context는 이 개념과 관련된 모든 글. Depth는 높음. 독자가 깊게 이해하려는 사람이므로.

### Global-tier Q&A

사이트 전체에 대한 Q&A. "당신의 블로그는 뭐 하는 블로그인가?" "여기서 배울 수 있는 게 뭔가?"

```
[전역: meshblog 소개]

Q: 이 블로그는 뭔가요?
A: 개인 지식 그래프를 공개한 사이트입니다...

Q: 어디서 시작해야 하나요?
A: ...
```

Context는 전체 사이트. Depth는 낮음. 신규 방문자를 위해.

## 정보 밀도 조절

이 계층 구조의 목적은 **정보 밀도를 독자가 조절**하게 하는 거다.

1단계: 글 읽기. (정보 밀도: 낮음, 시간 소요: 짧음)
2단계: Note-tier Q&A. (정보 밀도: 중간, 시간 소요: 중간)
3단계: Concept-tier Q&A. (정보 밀도: 높음, 시간 소요: 길음)
4단계: 원본 글들 읽기. (정보 밀도: 매우 높음, 시간 소요: 길음)

독자가 "음, 이 정도면 됐다"라고 느끼면 거길 떠난다. "더 알고 싶은데?"라고 느끼면 다음 계층으로 간다.

## 구현의 현실

LLM-generated Q&A는 완벽하지 않다.

가끔 LLM이 당신이 쓴 글의 내용을 잘못 이해할 수도 있다. 또는 너무 일반적인 답을 할 수도 있다. 그래서 meshblog는 **Q&A 에디터**를 제공한다. 생성된 Q&A를 읽어보고, 틀린 게 있으면 손으로 수정할 수 있다.

```yaml
# posts/react-hooks.md 내부 frontmatter
---
title: React Hooks 입문
qa:
  - question: useEffect는 언제 실행되는데?
    answer: |
      의존성 배열을 지정해야 합니다. 
      빈 배열 [] → 마운트 시만 실행
      의존성 있음 → 그 값이 바뀔 때마다 실행
    edited: true  # 손으로 수정했음
---
```

또 다른 현실: **비용**. LLM 호출을 매번 할 수는 없다. meshblog는 빌드 타임에 모든 Q&A를 생성하고, 결과를 JSON에 저장한다. 배포할 때는 LLM을 안 부른다.

```typescript
// build time
const topics = await extractTopics()
const qaMap = {}
for (const topic of topics) {
  const qa = await generateQA(topic)  // LLM 호출 (비용 발생)
  qaMap[topic.id] = qa
}
fs.writeFileSync('dist/qa.json', JSON.stringify(qaMap))

// runtime (사이트 방문할 때)
const qa = await fetch('/qa.json').then(r => r.json())
// LLM 호출 없음. JSON 읽기만.
```

## 왜 작동하는가

LLM-generated Q&A가 작동하는 이유는, **맥락을 담고 있기 때문**이다. 일반적인 "React Q&A"와 달리, 여기서의 Q&A는 당신의 글에서 비롯되었다. 당신의 용어, 당신의 관점, 당신의 경험이 담여있다.

그래서 독자는 느낀다. "아, 이건 다른 StackOverflow 답변이 아니라, 이 블로거가 내 상황에 맞춰 답해준 거네."

그게 차이다.
