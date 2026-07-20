-- General savings pools: a savings_goals row with no target_amount represents
-- money set aside without a specific target (an emergency fund / cash cushion),
-- as opposed to a targeted goal. Making target_amount nullable is all that's
-- needed — the existing check (target_amount >= 0) passes for NULL, and
-- current_amount already tracks the balance.
alter table savings_goals alter column target_amount drop not null;
