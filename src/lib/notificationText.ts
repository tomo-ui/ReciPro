import type { AppNotification } from '@/types/recipe'

/** Treść powiadomienia bez znajomości płci osoby: „polubił(a)”, „obserwuje Cię” */
export function notificationText(n: AppNotification): { action: string; detail?: string } {
  const title = n.recipe?.title ? `„${n.recipe.title}”` : 'przepis'
  if (n.type === 'like') return { action: 'polubił(a) Twój przepis', detail: title }
  if (n.type === 'comment') {
    const body = (n.comment_body ?? '').replace(/\s+/g, ' ').trim()
    return { action: 'skomentował(a):', detail: body.length > 90 ? `${body.slice(0, 90)}…` : body }
  }
  return { action: 'obserwuje Cię' }
}
