-- The public costs page, one row per month from the accounts: the contract's `CostsReport` JSON.
CREATE TABLE costs_reports (
  month TEXT PRIMARY KEY,
  report_json TEXT NOT NULL,
  at INTEGER NOT NULL
);
