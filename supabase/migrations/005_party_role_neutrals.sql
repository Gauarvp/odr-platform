-- =============================================================
-- 005: Allow neutrals in room role lists
-- =============================================================
-- message_rooms.allowed_roles is party_role[], but the Mediator
-- Notes room must be scoped to neutrals — the enum only covered
-- claimant/respondent/third_party/observer.

ALTER TYPE party_role ADD VALUE IF NOT EXISTS 'mediator';
ALTER TYPE party_role ADD VALUE IF NOT EXISTS 'arbitrator';
