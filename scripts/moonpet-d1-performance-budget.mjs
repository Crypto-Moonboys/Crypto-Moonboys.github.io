export const MOONPET_D1_PERFORMANCE_BUDGETS = Object.freeze({
  core_bootstrap_max_statements: 45,
  // Includes one owner-scoped repair of provably empty runs admitted after pet deletion.
  // Refresh must release those stale blockers before projecting the replacement pet.
  // Two economic fingerprint reads prevent mixed wallet/shop/ranking snapshots.
  missions_state_max_statements: 88,
  warm_state_max_statements: 180,
  recovery_refresh_max_statements: 600,
  production_request_max_ms: 15000,
});
