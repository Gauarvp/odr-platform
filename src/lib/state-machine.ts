// src/lib/state-machine.ts
// Formal state machine for ODR case lifecycle.
// Every status transition must go through this engine.
// Pre-conditions checked before transition; side-effects run after.

import type {
  Case, CaseStatus, CaseTransition, TransitionResult, UserRole
} from './types';

// ─── Transition graph ──────────────────────────────────────────

interface TransitionDef {
  from: CaseStatus[];
  to: CaseStatus;
  // Who can trigger this transition
  allowed_roles: UserRole[];
  // Pre-conditions that must be true
  preconditions: ((c: Case) => { ok: boolean; reason?: string })[];
  // Fields set on the case when transition fires
  fields?: (c: Case) => Partial<Case>;
  // Label for UI and audit log
  label: string;
  description: string;
}

const TRANSITIONS: Record<CaseTransition, TransitionDef> = {
  submit: {
    from: ['draft'],
    to: 'filed',
    allowed_roles: ['claimant', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'Submit Dispute',
    description: 'File the dispute formally. Respondent will be notified.',
    preconditions: [
      (c) => ({ ok: !!c.title, reason: 'Case must have a title' }),
      (c) => ({ ok: !!c.description && c.description.length >= 50, reason: 'Description must be at least 50 characters' }),
      (c) => ({ ok: !!c.category, reason: 'Category is required' }),
      (c) => ({ ok: !!c.claimant_id, reason: 'Claimant is required' }),
    ],
    fields: () => ({
      filed_at: new Date().toISOString(),
      status: 'filed',
    }),
  },

  serve: {
    from: ['filed'],
    to: 'served',
    allowed_roles: ['case_manager', 'org_admin', 'platform_admin'],
    label: 'Mark as Served',
    description: 'Confirm the respondent has been formally notified of the dispute.',
    preconditions: [
      (c) => ({ ok: !!c.respondent_id, reason: 'Respondent must be identified before serving' }),
    ],
    fields: () => ({
      served_at: new Date().toISOString(),
      status: 'served',
    }),
  },

  begin_negotiation: {
    from: ['served'],
    to: 'negotiation',
    allowed_roles: ['claimant', 'respondent', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'Begin Negotiation',
    description: 'Open direct negotiation channel between parties.',
    preconditions: [
      (c) => ({ ok: !!c.respondent_id, reason: 'Both parties must be identified' }),
      (c) => ({ ok: !!c.served_at, reason: 'Case must be served before negotiation can begin' }),
    ],
    fields: (c) => ({
      negotiation_started_at: new Date().toISOString(),
      status: 'negotiation',
      resolution_deadline: computeDeadline(c.track, 'negotiation'),
    }),
  },

  escalate_mediation: {
    from: ['negotiation', 'served'],
    to: 'mediation',
    allowed_roles: ['claimant', 'respondent', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'Escalate to Mediation',
    description: 'Bring in a neutral mediator to facilitate resolution.',
    preconditions: [
      (c) => ({
        ok: !!c.assigned_mediator_id,
        reason: 'A mediator must be assigned before escalating to mediation',
      }),
    ],
    fields: (c) => ({
      mediation_started_at: new Date().toISOString(),
      status: 'mediation',
      resolution_deadline: computeDeadline(c.track, 'mediation'),
    }),
  },

  escalate_arbitration: {
    from: ['mediation', 'negotiation'],
    to: 'arbitration',
    allowed_roles: ['case_manager', 'org_admin', 'platform_admin', 'mediator'],
    label: 'Escalate to Arbitration',
    description: 'Proceed to binding arbitration. An arbitrator will issue a final, binding decision.',
    preconditions: [
      (c) => ({
        ok: !!c.assigned_arbitrator_id,
        reason: 'An arbitrator must be assigned before escalating to arbitration',
      }),
      (c) => ({
        ok: c.track !== 'fast_track',
        reason: 'Fast-track cases cannot be escalated to arbitration without case manager approval',
      }),
    ],
    fields: (c) => ({
      arbitration_started_at: new Date().toISOString(),
      status: 'arbitration',
      resolution_deadline: computeDeadline(c.track, 'arbitration'),
    }),
  },

  settle: {
    from: ['negotiation', 'mediation', 'served'],
    to: 'settled',
    allowed_roles: ['claimant', 'respondent', 'mediator', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'Record Settlement',
    description: 'Record a voluntary settlement agreement between the parties.',
    preconditions: [
      (c) => ({
        ok: !!c.settlement_terms && c.settlement_terms.length > 10,
        reason: 'Settlement terms must be documented before marking as settled',
      }),
    ],
    fields: () => ({
      status: 'settled',
    }),
  },

  award: {
    from: ['arbitration'],
    to: 'awarded',
    allowed_roles: ['arbitrator', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'Issue Award',
    description: 'Issue a binding arbitration award.',
    preconditions: [
      (c) => ({
        ok: !!c.assigned_arbitrator_id,
        reason: 'An arbitrator must be assigned to issue an award',
      }),
    ],
    fields: () => ({
      status: 'awarded',
    }),
  },

  dismiss: {
    from: ['filed', 'served', 'negotiation', 'mediation', 'arbitration'],
    to: 'dismissed',
    allowed_roles: ['case_manager', 'org_admin', 'platform_admin', 'arbitrator'],
    label: 'Dismiss Case',
    description: 'Dismiss the case (no merit, withdrawn, or procedurally deficient).',
    preconditions: [],  // No hard preconditions; dismissal reason captured separately
    fields: () => ({
      status: 'dismissed',
      closed_at: new Date().toISOString(),
    }),
  },

  appeal: {
    from: ['awarded'],
    to: 'appealed',
    allowed_roles: ['claimant', 'respondent', 'case_manager', 'org_admin', 'platform_admin'],
    label: 'File Appeal',
    description: 'Challenge the arbitration award. Requires grounds for appeal.',
    preconditions: [
      (c) => ({
        ok: !!c.closed_at === false,
        reason: 'Cannot appeal a closed case',
      }),
    ],
    fields: () => ({
      status: 'appealed',
    }),
  },

  close: {
    from: ['settled', 'awarded', 'dismissed', 'appealed'],
    to: 'closed',
    allowed_roles: ['case_manager', 'org_admin', 'platform_admin'],
    label: 'Close Case',
    description: 'Administratively close the case. All obligations fulfilled.',
    preconditions: [],
    fields: () => ({
      status: 'closed',
      closed_at: new Date().toISOString(),
    }),
  },
};

// ─── Deadline computation ──────────────────────────────────────

const SLA_DAYS: Record<string, Record<string, number>> = {
  fast_track:  { negotiation: 7,  mediation: 15, arbitration: 30  },
  standard:    { negotiation: 21, mediation: 45, arbitration: 90  },
  complex:     { negotiation: 30, mediation: 90, arbitration: 180 },
  emergency:   { negotiation: 2,  mediation: 5,  arbitration: 14  },
};

function computeDeadline(track: string, phase: string): string {
  const days = SLA_DAYS[track]?.[phase] ?? 45;
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// ─── State machine engine ──────────────────────────────────────

export class CaseStateMachine {
  /**
   * Get all valid transitions from the current case status for a given role.
   */
  static getAvailableTransitions(
    currentStatus: CaseStatus,
    role: UserRole,
  ): { transition: CaseTransition; def: TransitionDef }[] {
    return Object.entries(TRANSITIONS)
      .filter(([, def]) =>
        def.from.includes(currentStatus) && def.allowed_roles.includes(role)
      )
      .map(([t, def]) => ({ transition: t as CaseTransition, def }));
  }

  /**
   * Validate a transition without executing it.
   */
  static validate(
    c: Case,
    transition: CaseTransition,
    actorRole: UserRole,
  ): { valid: boolean; errors: string[] } {
    const def = TRANSITIONS[transition];
    if (!def) return { valid: false, errors: [`Unknown transition: ${transition}`] };

    const errors: string[] = [];

    // Check current status is valid source
    if (!def.from.includes(c.status)) {
      errors.push(`Cannot ${transition} a case with status '${c.status}'. Expected: ${def.from.join(', ')}`);
    }

    // Check role is allowed
    if (!def.allowed_roles.includes(actorRole)) {
      errors.push(`Role '${actorRole}' is not permitted to perform '${transition}'`);
    }

    // Run preconditions
    for (const check of def.preconditions) {
      const result = check(c);
      if (!result.ok) errors.push(result.reason ?? 'Precondition failed');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Execute a transition. Returns updated case fields to apply.
   * Does NOT hit the database — the caller does that.
   */
  static execute(
    c: Case,
    transition: CaseTransition,
    actorRole: UserRole,
  ): TransitionResult & { fields?: Partial<Case> } {
    const validation = this.validate(c, transition, actorRole);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join('; ') };
    }

    const def = TRANSITIONS[transition];
    const fields = def.fields ? def.fields(c) : { status: def.to };

    return {
      success: true,
      fields: { ...fields, updated_at: new Date().toISOString() },
    };
  }

  /**
   * Get the transition definition for display purposes.
   */
  static getTransitionDef(transition: CaseTransition): TransitionDef | null {
    return TRANSITIONS[transition] ?? null;
  }

  /**
   * Human-readable status labels.
   */
  static statusLabel(status: CaseStatus): string {
    const labels: Record<CaseStatus, string> = {
      draft: 'Draft',
      filed: 'Filed',
      served: 'Served',
      negotiation: 'In Negotiation',
      mediation: 'In Mediation',
      arbitration: 'In Arbitration',
      settled: 'Settled',
      awarded: 'Award Issued',
      dismissed: 'Dismissed',
      appealed: 'Under Appeal',
      closed: 'Closed',
    };
    return labels[status] ?? status;
  }

  /**
   * Returns whether a case is in a terminal state.
   */
  static isTerminal(status: CaseStatus): boolean {
    return ['settled', 'awarded', 'dismissed', 'closed'].includes(status);
  }

  /**
   * Returns the current "phase" for display (grouping related statuses).
   */
  static getPhase(status: CaseStatus): string {
    const phases: Partial<Record<CaseStatus, string>> = {
      draft: 'Pre-filing',
      filed: 'Filing',
      served: 'Service',
      negotiation: 'Negotiation',
      mediation: 'Mediation',
      arbitration: 'Arbitration',
      settled: 'Resolution',
      awarded: 'Resolution',
      dismissed: 'Closed',
      appealed: 'Appeal',
      closed: 'Closed',
    };
    return phases[status] ?? 'Unknown';
  }
}

export { TRANSITIONS };
export type { TransitionDef };
