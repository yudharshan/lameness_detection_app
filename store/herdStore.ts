import { create } from 'zustand';

import type { CattlePassage, LocomotionScore, RiskFilter } from '@/types/cattle';
import { riskFromScore, statusFromScore } from '@/lib/herd';

interface HerdState {
  passages: CattlePassage[];
  selectedPassageId: string | null;
  riskFilter: RiskFilter;

  /** Append a passage captured at the virtual trigger. */
  addPassage: (passage: CattlePassage) => void;
  /** Make a passage the focus of the explainability screen. */
  selectPassage: (passageId: string) => void;
  /** Filter the sequential stream by risk band. */
  filterByRisk: (filter: RiskFilter) => void;
  /** Promote a processing passage to its final analyzed/flagged state. */
  completeAnalysis: (passageId: string) => void;
  clearSelection: () => void;
  resetPassages: () => void;
}

export const useHerdStore = create<HerdState>()((set) => ({
  passages: [],
  selectedPassageId: null,
  riskFilter: 'All',

  addPassage: (passage) =>
    set((state) => ({
      passages: [...state.passages, passage],
      selectedPassageId: passage.id,
    })),

  selectPassage: (passageId) => set({ selectedPassageId: passageId }),

  filterByRisk: (filter) => set({ riskFilter: filter }),

  completeAnalysis: (passageId) =>
    set((state) => ({
      passages: state.passages.map((passage) =>
        passage.id === passageId
          ? {
              ...passage,
              status: statusFromScore(passage.locomotionScore),
            }
          : passage,
      ),
    })),

  clearSelection: () => set({ selectedPassageId: null }),

  resetPassages: () => set({ passages: [], selectedPassageId: null }),
}));

/** Ordered C1 → Cn. */
export function selectSequentialPassages(state: HerdState): CattlePassage[] {
  return [...state.passages].sort((a, b) => a.entryOrder - b.entryOrder);
}

export function selectFilteredPassages(state: HerdState): CattlePassage[] {
  const ordered = selectSequentialPassages(state);
  if (state.riskFilter === 'All') return ordered;
  return ordered.filter((passage) => passage.riskLevel === state.riskFilter);
}

export function selectSelectedPassage(state: HerdState): CattlePassage | null {
  return (
    state.passages.find((passage) => passage.id === state.selectedPassageId) ??
    null
  );
}

/** Ensure a simulated/external score is typed as a locomotion score. */
export function clampScore(value: number): LocomotionScore {
  const rounded = Math.min(5, Math.max(1, Math.round(value)));
  return rounded as LocomotionScore;
}

export { riskFromScore };
