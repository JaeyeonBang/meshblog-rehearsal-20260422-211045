/**
 * showcase-questions.ts — Generate portfolio showcase questions from top skills.
 *
 * Ported verbatim from Volla (no DB calls, no user_id, pure function).
 * No porting rules violations — this file has no SQL or pg patterns.
 */
import type { ScoredSkill } from "./skill-scorer.ts"

export type ShowcaseQuestion = {
  question: string
  entityName: string
  entityType: string
}

const TEMPLATES: Record<string, (name: string) => string> = {
  technology: (name) => `어떤 프로젝트에서 ${name}을 사용했나요?`,
  framework: (name) => `${name}으로 어떤 것을 만들었나요?`,
  language: (name) => `${name} 개발 경험에 대해 알려주세요`,
  tool: (name) => `${name}을 어떻게 활용하고 있나요?`,
  project: (name) => `${name} 프로젝트에 대해 알려주세요`,
  concept: (name) => `${name}에 대한 경험은 어떤가요?`,
}

export function generateShowcaseQuestions(
  skills: ScoredSkill[],
  count = 3
): ShowcaseQuestion[] {
  return skills.slice(0, count).map((skill) => {
    const template = TEMPLATES[skill.type] ?? TEMPLATES.technology
    const displayName = skill.name.charAt(0).toUpperCase() + skill.name.slice(1)
    return {
      question: template(displayName),
      entityName: skill.name,
      entityType: skill.type,
    }
  })
}
