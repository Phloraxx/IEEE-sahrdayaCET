const FIFA_KNOCKOUT_STAGES = new Set(["r32", "r16", "qf", "sf", "third_place", "final"])

export type FifaAdminResultWinner = "home" | "away" | "draw"
export type FifaAdminAdvanceSide = "home" | "away"

export interface FifaAdminSettlementFormState {
  result_winner: FifaAdminResultWinner
  result_advance: FifaAdminAdvanceSide
  result_home_goals: number
  result_away_goals: number
  result_scorers: string[]
  result_yellow_cards: number
  result_red_cards: number
  result_after_extra_time: boolean
  result_after_penalties: boolean
  custom_winners: Record<string, string[]>
}

export function isFifaKnockoutStage(stage: string): boolean {
  return FIFA_KNOCKOUT_STAGES.has(String(stage || "").trim().toLowerCase())
}

export function resultWinnerFromScore(homeGoals: number, awayGoals: number): FifaAdminResultWinner {
  if (homeGoals > awayGoals) return "home"
  if (awayGoals > homeGoals) return "away"
  return "draw"
}

export function buildFifaSettlementPayload({
  matchId,
  stage,
  form,
}: {
  matchId: string
  stage: string
  form: FifaAdminSettlementFormState
}) {
  const homeGoals = Number(form.result_home_goals)
  const awayGoals = Number(form.result_away_goals)
  const scoreWinner = resultWinnerFromScore(homeGoals, awayGoals)
  if (form.result_winner !== scoreWinner) {
    throw new Error(`90-minute result (${form.result_winner}) does not match the ${homeGoals}-${awayGoals} score (${scoreWinner})`)
  }

  const knockout = isFifaKnockoutStage(stage)
  const effectiveAdvance = form.result_winner === "draw" ? form.result_advance : form.result_winner
  const payload = {
    matchId,
    result_winner: form.result_winner,
    result_advance: knockout ? effectiveAdvance : undefined,
    result_home_goals: homeGoals,
    result_away_goals: awayGoals,
    result_scorers: form.result_scorers,
    result_yellow_cards: Number(form.result_yellow_cards),
    result_red_cards: Number(form.result_red_cards),
    result_home_clean_sheet: awayGoals === 0,
    result_away_clean_sheet: homeGoals === 0,
    result_after_extra_time: knockout ? form.result_after_extra_time : false,
    result_after_penalties: knockout ? form.result_after_penalties : false,
    custom_winners: Object.keys(form.custom_winners).length > 0 ? form.custom_winners : undefined,
  }

  return payload
}
