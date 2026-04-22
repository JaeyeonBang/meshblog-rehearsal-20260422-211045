import { useMemo, useState, useId } from 'react'
import Fuse from 'fuse.js'
import styles from './QAChips.module.css'

type Qa = { id: string; tier: 'note' | 'concept' | 'global'; question: string; answer: string }
type Related = { id: string; href: string; title: string }

type Props = {
  qas: Qa[]
  scope: 'global' | 'page'
  related?: Related[]
}

export default function QAChips({ qas, scope, related = [] }: Props) {
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const uid = useId()

  const fuse = useMemo(() => {
    const keys =
      scope === 'global'
        ? ['question']
        : [{ name: 'question', weight: 2 }, { name: 'answer', weight: 1 }]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new Fuse(qas, { keys: keys as any, threshold: 0.4, includeScore: true })
  }, [qas, scope])

  if (qas.length === 0) {
    return (
      <p role="status">
        <em>아직 생성된 Q&A가 없습니다.</em>
      </p>
    )
  }

  const filtered = query.trim() === '' ? qas : fuse.search(query).map(r => r.item)
  const showFallback = query.trim() !== '' && filtered.length === 0 && related.length > 0
  const showNoResults = query.trim() !== '' && filtered.length === 0 && related.length === 0

  function handleQuestionClick(id: string) {
    if (openId === id) {
      // Close: also collapse any expansion
      setOpenId(null)
      setExpandedId(null)
    } else {
      setOpenId(id)
      setExpandedId(null) // reset expansion when opening a new card
    }
  }

  return (
    <section aria-label="FAQ">
      <input
        type="search"
        className={styles.searchInput}
        placeholder={scope === 'global' ? 'vault에 질문해보세요' : '이 글에 질문해보세요'}
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      <ul className={styles.list}>
        {filtered.map(q => {
          const answerId = `qa-answer-${uid}-${q.id}`
          const isOpen = openId === q.id
          const isExpanded = expandedId === q.id

          return (
            <li key={q.id} className={styles.card}>
              <button
                className={styles.questionBtn}
                onClick={() => handleQuestionClick(q.id)}
                aria-expanded={isOpen}
                aria-controls={answerId}
              >
                {q.question}
                <small className={styles.tierBadge} aria-label={`tier: ${q.tier}`}>
                  [{q.tier}]
                </small>
              </button>
              {isOpen && (
                <div id={answerId} className={styles.answerRegion} role="region" aria-live="polite">
                  <p className={`${styles.answerText}${isExpanded ? '' : ` ${styles.answerClamped}`}`}>
                    {q.answer}
                  </p>
                  <button
                    className={styles.expandBtn}
                    onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    aria-label={isExpanded ? '답변 접기' : '답변 더 보기'}
                  >
                    {isExpanded ? '접기' : '더 보기'}
                  </button>
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {showNoResults && (
        <p className={styles.noResults}>검색 결과가 없습니다.</p>
      )}
      {showFallback && (
        <div className={styles.fallback}>
          <p className={styles.fallbackLabel}>
            <em>답변을 찾지 못했습니다. 가까운 글:</em>
          </p>
          <ul className={styles.relatedList}>
            {related.map(r => (
              <li key={r.id}>
                <a href={r.href}>{r.title}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
