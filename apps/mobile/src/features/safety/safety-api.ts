import {
  AppealResponse,
  ReportResponse,
  SafetyNoteList,
  type AppealRequest,
  type ReportRequest,
} from '@kithfield/contracts';

import type { Request } from '../settings/api/request';

/** Reports, the safety team's quiet notes and appeals. */
export function safetyApi(request: Request) {
  return {
    /** The server copies the context around a reported message; the reported person never learns who. */
    report: (report: ReportRequest) => request(ReportResponse, 'POST', '/v1/reports', report),
    /** Newest first; reading them clears the cottage's `safetyNote` flag. */
    notes: () => request(SafetyNoteList, 'GET', '/v1/me/safety-notes'),
    appeal: (appeal: AppealRequest) => request(AppealResponse, 'POST', '/v1/appeals', appeal),
  };
}

export type SafetyApi = ReturnType<typeof safetyApi>;
