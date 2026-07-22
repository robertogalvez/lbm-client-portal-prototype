'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

// Shared "has the client already submitted a decision" state, spanning the
// video player (left column) and the approve/reject buttons (right dock) —
// two DOM-distant sibling components that otherwise have no way to know
// about each other. Once a decision is submitted, the composer closes
// (comments are only meant to be left before feedback is sent) without
// needing a full page reload — ClickUp's own status field may lag behind
// (e.g. approval doesn't always move the task off "for client review"
// immediately), so this can't just be derived from re-fetching the task.
interface DecisionState {
  decided: boolean;
  markDecided: () => void;
}

// Default is a harmless no-op, not a thrown error: ApprovalButtons is also
// used on the review-grid list page, which has no video composer and no
// provider — there's simply nothing to coordinate with there.
const noop: DecisionState = { decided: false, markDecided: () => {} };
const DecisionContext = createContext<DecisionState>(noop);

export function VideoDecisionProvider({ children, initialDecided = false }: { children: ReactNode; initialDecided?: boolean }) {
  const [decided, setDecided] = useState(initialDecided);
  return (
    <DecisionContext.Provider value={{ decided, markDecided: () => setDecided(true) }}>
      {children}
    </DecisionContext.Provider>
  );
}

export function useVideoDecision(): DecisionState {
  return useContext(DecisionContext);
}
