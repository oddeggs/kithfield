import type { RestorationView } from '@kithfield/farm';
import type { StringKey } from '@kithfield/i18n';

/** Which way the project is shown: as it stands today, or after tonight's step. */
export type ProjectWhen = 'today' | 'tonight';

/** The art's progress for the chosen view, from 0 to 1. */
export const projectProgress = (r: RestorationView, when: ProjectWhen): number =>
  when === 'tonight' ? r.progressTonight : r.progress;

/** Rough words for how far along it is: never a number of steps or of tends. */
export function progressKey(progress: number): StringKey {
  if (progress >= 1) return 'rhythm.project.progress.6';
  if (progress >= 0.85) return 'rhythm.project.progress.5';
  if (progress >= 0.58) return 'rhythm.project.progress.4';
  if (progress >= 0.42) return 'rhythm.project.progress.3';
  if (progress >= 0.25) return 'rhythm.project.progress.2';
  if (progress > 0) return 'rhythm.project.progress.1';
  return 'rhythm.project.progress.0';
}

/** The hand-lettered caption under the toggle. */
export function captionKey(r: RestorationView, when: ProjectWhen): StringKey {
  if (r.finished) return 'rhythm.project.done';
  if (when === 'today') return progressKey(r.progress);
  if (!r.stepsTonight) return 'rhythm.project.tonight.waiting';
  return r.progressTonight >= 1 ? 'rhythm.project.tonight.last' : 'rhythm.project.tonight.step';
}

/** The project's name, title and body keys; one the app has no words for gets plain ones. */
export function projectKeys(project: string): {
  name: StringKey;
  title: StringKey;
  body: StringKey;
} {
  if (project === 'greenhouse') {
    return {
      name: 'rhythm.project.greenhouse.name',
      title: 'rhythm.project.greenhouse.title',
      body: 'rhythm.project.greenhouse.body',
    };
  }
  return {
    name: 'rhythm.project.other.name',
    title: 'rhythm.project.other.title',
    body: 'rhythm.project.row',
  };
}
