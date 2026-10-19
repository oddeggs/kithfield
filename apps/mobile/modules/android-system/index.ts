import { requireOptionalNativeModule, type EventSubscription } from 'expo';
import { day } from '@kithfield/theme';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

/** A file another app shared, copied into the app's cache. */
export interface SharedIntentFile {
  readonly uri: string;
  readonly mime: string;
  readonly name: string;
  readonly bytes: number;
}

/** What another app shared into Kithfield through the system share sheet. */
export interface SharedIntent {
  readonly text: string | null;
  readonly subject: string | null;
  readonly files: readonly SharedIntentFile[];
}

/** The back gesture as Android 14 reports it while the app draws its preview. */
export interface BackPreviewEvent {
  readonly phase: 'start' | 'progress' | 'cancel' | 'commit';
  /** 0 to 1 across the gesture. */
  readonly progress: number;
  /** The finger's height on the screen, in points. */
  readonly y: number;
  readonly edge: 'left' | 'right';
}

interface AndroidSystemNative {
  addListener(event: 'onShare', listener: () => void): EventSubscription;
  addListener(
    event: 'onBackPreview',
    listener: (event: BackPreviewEvent) => void,
  ): EventSubscription;
  setBackPreview(enabled: boolean): Promise<void>;
  chooseAsync(options: {
    title?: string;
    options: string[];
    cancel?: string;
    dark: boolean;
    accent: string;
  }): Promise<number>;
  promptAsync(options: {
    title: string;
    message?: string;
    initial?: string;
    ok: string;
    cancel: string;
    dark: boolean;
    accent: string;
  }): Promise<string | null>;
  takeShare(): SharedIntent | null;
  forgetConversations(): void;
}

/** The Material dialogs' buttons: the farm's moss, by day and night alike (`12 States`). */
const DIALOG_ACCENT = day.moss;

/** The Android module (`modules/android-system/android`), or null elsewhere and in tests. */
export const androidSystem = requireOptionalNativeModule<AndroidSystemNative>('AndroidSystem');

export interface ChoiceSheet {
  readonly title?: string;
  /** The choices, the cancel one included where `cancelButtonIndex` points. */
  readonly options: readonly string[];
  readonly cancelButtonIndex?: number;
  readonly destructiveButtonIndex?: number;
  /** Night: the Android dialog follows the app's palette, not only the system's. */
  readonly dark?: boolean;
}

/**
 * A list of choices: iOS's action sheet, and on Android a Material list dialog whose cancel is
 * its dismiss button. `then` gets the chosen index in `options`, or the cancel index (or -1).
 */
export function showChoices(sheet: ChoiceSheet, then: (index: number) => void): void {
  const { options, cancelButtonIndex, destructiveButtonIndex, title } = sheet;
  if (Platform.OS === 'ios' || androidSystem === null) {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [...options],
        ...(title !== undefined ? { title } : {}),
        ...(cancelButtonIndex !== undefined ? { cancelButtonIndex } : {}),
        ...(destructiveButtonIndex !== undefined ? { destructiveButtonIndex } : {}),
      },
      then,
    );
    return;
  }
  const shown = options.flatMap((label, index) =>
    index === cancelButtonIndex ? [] : [{ label, index }],
  );
  const cancel = cancelButtonIndex !== undefined ? options[cancelButtonIndex] : undefined;
  void androidSystem
    .chooseAsync({
      ...(title !== undefined ? { title } : {}),
      options: shown.map((s) => s.label),
      ...(cancel !== undefined ? { cancel } : {}),
      dark: sheet.dark ?? false,
      accent: DIALOG_ACCENT,
    })
    .then((picked) => then(shown[picked]?.index ?? cancelButtonIndex ?? -1));
}

export interface TextPrompt {
  readonly title: string;
  readonly message?: string;
  readonly initial?: string;
  readonly ok: string;
  readonly cancel: string;
  readonly dark?: boolean;
}

/** A one-line question: iOS's `Alert.prompt`, and a Material dialog with a field on Android. */
export function promptText(prompt: TextPrompt, then: (value: string) => void): void {
  if (Platform.OS === 'ios' || androidSystem === null) {
    Alert.prompt(
      prompt.title,
      prompt.message,
      [
        { text: prompt.cancel, style: 'cancel' },
        { text: prompt.ok, onPress: (value?: string) => then(value ?? '') },
      ],
      'plain-text',
      prompt.initial,
    );
    return;
  }
  void androidSystem
    .promptAsync({
      title: prompt.title,
      ...(prompt.message !== undefined ? { message: prompt.message } : {}),
      ...(prompt.initial !== undefined ? { initial: prompt.initial } : {}),
      ok: prompt.ok,
      cancel: prompt.cancel,
      dark: prompt.dark ?? false,
      accent: DIALOG_ACCENT,
    })
    .then((value) => {
      if (value !== null) then(value);
    });
}
