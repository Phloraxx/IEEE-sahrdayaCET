import { describe, expect, it } from "vitest"
import {
  buildFifaSettlementPayload,
  isFifaKnockoutStage,
  type FifaAdminSettlementFormState,
} from "@/lib/fifa-admin-settlement"

function form(overrides: Partial<FifaAdminSettlementFormState> = {}): FifaAdminSettlementFormState {
  return {
    result_winner: "draw",
    result_advance: "home",
    result_home_goals: 1,
    result_away_goals: 1,
    result_scorers: [],
    result_yellow_cards: 0,
    result_red_cards: 0,
    result_after_extra_time: false,
    result_after_penalties: false,
    custom_winners: {},
    ...overrides,
  }
}

describe("FIFA admin settlement stage rules", () => {
  it("treats only the configured knockout rounds as knockout stages", () => {
    expect(isFifaKnockoutStage("group")).toBe(false)
    for (const stage of ["r32", "r16", "qf", "sf", "third_place", "final"]) {
      expect(isFifaKnockoutStage(stage)).toBe(true)
    }
    expect(isFifaKnockoutStage("unknown")).toBe(false)
  })

  it("does not attach an advance winner to a drawn group-stage result", () => {
    const payload = buildFifaSettlementPayload({ matchId: "match-1", stage: "group", form: form() })
    expect(payload.result_winner).toBe("draw")
    expect(payload.result_advance).toBeUndefined()
  })

  it("requires the selected advancing side for a drawn round-of-32 result", () => {
    const payload = buildFifaSettlementPayload({ matchId: "match-2", stage: "r32", form: form({ result_advance: "away" }) })
    expect(payload.result_advance).toBe("away")
  })

  it("derives clean sheets from the score and strips knockout-only flags from groups", () => {
    const payload = buildFifaSettlementPayload({
      matchId: "match-3",
      stage: "group",
      form: form({
        result_winner: "home",
        result_home_goals: 2,
        result_away_goals: 0,
        result_after_extra_time: true,
        result_after_penalties: true,
      }),
    })
    expect(payload.result_home_clean_sheet).toBe(true)
    expect(payload.result_away_clean_sheet).toBe(false)
    expect(payload.result_after_extra_time).toBe(false)
    expect(payload.result_after_penalties).toBe(false)
  })

  it("rejects a selected result that contradicts the entered score", () => {
    expect(() => buildFifaSettlementPayload({
      matchId: "match-4",
      stage: "qf",
      form: form({ result_winner: "away", result_home_goals: 2, result_away_goals: 1 }),
    })).toThrow(/does not match/)
  })
})
