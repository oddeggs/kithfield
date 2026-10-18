import {
  BlockList,
  ConsentList,
  CurrentInvite,
  DeleteAccountResponse,
  DesktopLinkPreview,
  DeviceList,
  ExportStatus,
  FarmList,
  FarmNotificationsView,
  Invite,
  Me,
  type AiFeature,
  type ConsentRequest,
  type CreateInviteRequest,
  type FarmId,
  type FarmNotifications,
  type MeSettingsUpdate,
  type NotificationType,
  type PersonId,
} from '@kithfield/contracts';

import { seg, type Request } from './request';

/** The HTTP calls behind You, Settings and the farm settings, each checked against its contract. */
export function settingsApi(request: Request) {
  return {
    me: () => request(Me, 'GET', '/v1/me'),
    /** Quiet hours with the person's time zone, nudges and the other switches. */
    updateSettings: (update: MeSettingsUpdate) => request(null, 'PATCH', '/v1/me/settings', update),
    /** Pauses every nudge on every farm; the server writes `hibernate` on each. */
    hibernate: (on: boolean) => request(null, 'PUT', '/v1/me/hibernate', { on }),
    farms: () => request(FarmList, 'GET', '/v1/farms'),

    devices: () => request(DeviceList, 'GET', '/v1/devices'),
    signOutDevice: (device: string) => request(null, 'DELETE', `/v1/devices/${seg(device)}`),
    /** What the phone shows of a computer before Face ID approves its QR code. */
    desktopLink: (code: string) =>
      request(DesktopLinkPreview, 'GET', `/v1/desktop-link/${seg(code)}`),
    approveDesktopLink: (code: string) =>
      request(null, 'POST', `/v1/desktop-link/${seg(code)}/approve`),
    declineDesktopLink: (code: string) =>
      request(null, 'POST', `/v1/desktop-link/${seg(code)}/decline`),

    /** Starts (or returns) the keepsakes zip. */
    startExport: () => request(ExportStatus, 'POST', '/v1/me/export'),
    exportStatus: () => request(ExportStatus, 'GET', '/v1/me/export'),
    /** Starts the 30-day wait and ends every session; signing in again before `purgeAt` cancels. */
    deleteAccount: () => request(DeleteAccountResponse, 'POST', '/v1/me/delete'),

    consents: () => request(ConsentList, 'GET', '/v1/me/consents'),
    setConsent: (feature: AiFeature, consent: ConsentRequest) =>
      request(null, 'PUT', `/v1/me/consents/${seg(feature)}`, consent),
    /** Asks the AI provider and Kithfield to delete what was already sent for a feature. */
    forgetConsent: (feature: AiFeature) =>
      request(null, 'POST', `/v1/me/consents/${seg(feature)}/forget`),

    blocks: () => request(BlockList, 'GET', '/v1/blocks'),
    block: (person: PersonId) => request(null, 'PUT', `/v1/blocks/${seg(person)}`),
    unblock: (person: PersonId) => request(null, 'DELETE', `/v1/blocks/${seg(person)}`),

    currentInvite: (farm: FarmId) => request(CurrentInvite, 'GET', `/v1/farms/${seg(farm)}/invite`),
    /** A new link; the old one stops working. Keepers and helpers. */
    newInvite: (farm: FarmId, invite: CreateInviteRequest) =>
      request(Invite, 'POST', `/v1/farms/${seg(farm)}/invites`, invite),

    notifications: (farm: FarmId) =>
      request(FarmNotificationsView, 'GET', `/v1/farms/${seg(farm)}/notifications`),
    setNotifications: (farm: FarmId, settings: FarmNotifications) =>
      request(null, 'PUT', `/v1/farms/${seg(farm)}/notifications`, settings),
    /** Turns a kind of push that was resting back on. */
    wakeResting: (farm: FarmId, type: NotificationType) =>
      request(null, 'DELETE', `/v1/farms/${seg(farm)}/notifications/resting/${seg(type)}`),
  };
}

export type SettingsApi = ReturnType<typeof settingsApi>;
