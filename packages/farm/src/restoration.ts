import {
  type FarmState,
  type LocalDate,
  RESTORATION_RULES_VERSION,
  type RestorationState,
} from '@kithfield/contracts';

import { RESTORATION_PROJECTS, restorationProject } from './catalog';

/*
 * The farm's restoration project (`docs/farm-model.md` §4): one long project under way, a step
 * revealed each night after anyone tended, however much care there was. Steps only rise.
 */

/** Whether a farm on these rules keeps a restoration project. Visits never do. */
export const keepsRestoration = (state: Pick<FarmState, 'kind' | 'rulesVersion'>): boolean =>
  state.kind === 'farm' && state.rulesVersion >= RESTORATION_RULES_VERSION;

/** The catalogue's first project, starting on `day`. */
export const startRestoration = (day: LocalDate): RestorationState => ({
  project: RESTORATION_PROJECTS[0].id,
  step: 0,
  steppedOn: day,
  tendedOn: null,
  done: [],
});

/** How many steps finish a project; 0 for one this catalogue doesn't know (it never steps). */
const stepsOf = (project: string): number => restorationProject(project)?.steps ?? 0;

const isFinished = (r: RestorationState): boolean => r.done.some((d) => d.project === r.project);

/**
 * The night between the farm's last day and `day`: a step if the farm was tended since the last
 * one, and the project finished when that step is its last. A finished project hands over to the
 * catalogue's next one on the first later day. Pure: the reducer runs it at a new day's first
 * event, and views run it against "now" to show the step before that event lands.
 */
export const restorationNight = (
  r: RestorationState,
  day: LocalDate,
  projects: readonly { id: string; steps: number; fromRules: number }[] = RESTORATION_PROJECTS,
  rulesVersion = Number.POSITIVE_INFINITY,
): RestorationState => {
  if (day <= r.steppedOn) return r;
  if (isFinished(r)) {
    const at = projects.findIndex((p) => p.id === r.project);
    const next = at >= 0 ? projects[at + 1] : undefined;
    // The last day of a project is its own; the next one starts the day after it.
    const finishedOn = r.done.find((d) => d.project === r.project)?.finishedOn ?? r.steppedOn;
    if (!next || next.fromRules > rulesVersion || day <= finishedOn) return r;
    return { ...r, project: next.id, step: 0, steppedOn: day, tendedOn: null };
  }
  const steps = projects.find((p) => p.id === r.project)?.steps ?? 0;
  if (r.tendedOn === null || r.tendedOn < r.steppedOn || r.step >= steps) return r;
  const step = r.step + 1;
  const stepped = { ...r, step, steppedOn: day };
  if (step < steps) return stepped;
  return { ...stepped, done: [...r.done, { project: r.project, finishedOn: day }].slice(-100) };
};

/** A new farm day reached by an event: the night's step, if one is due. */
export const withRestorationNight = (state: FarmState, day: LocalDate): FarmState =>
  state.restoration
    ? {
        ...state,
        restoration: restorationNight(
          state.restoration,
          day,
          RESTORATION_PROJECTS,
          state.rulesVersion,
        ),
      }
    : state;

/** Any tend marks the day tended. */
export const withRestorationTend = (state: FarmState, day: LocalDate): FarmState => {
  const r = state.restoration;
  if (!r || (r.tendedOn !== null && r.tendedOn >= day)) return state;
  return { ...state, restoration: { ...r, tendedOn: day } };
};

/** A farm moving to rules that keep a project starts the catalogue's first one that day. */
export const withRestorationStart = (state: FarmState, day: LocalDate): FarmState =>
  keepsRestoration(state) && !state.restoration
    ? { ...state, restoration: startRestoration(day) }
    : state;

/** The project as drawn at a moment. */
export interface RestorationView {
  /** The project under way, by its id in `RESTORATION_PROJECTS`. */
  readonly project: string;
  /** The art scene that draws it. */
  readonly scene: string | null;
  readonly step: number;
  readonly steps: number;
  /** `step / steps`, from 0 to 1, for the art's progress. */
  readonly progress: number;
  /** Finished, and nothing new under way yet. */
  readonly finished: boolean;
  /** Someone tended since the last step, so tonight another goes up. */
  readonly stepsTonight: boolean;
  /** Progress after tonight's step, for the "tonight" preview. */
  readonly progressTonight: number;
  /** Finished projects, oldest first. */
  readonly done: RestorationState['done'];
}

/**
 * The restoration as drawn on `today` (the farm's day at "now"): the night's step shows from
 * the morning, before the day's first event writes it. Null on a visit or an older farm.
 */
export const restorationView = (
  state: Pick<FarmState, 'restoration' | 'rulesVersion'>,
  today: LocalDate,
): RestorationView | null => {
  if (!state.restoration) return null;
  const r = restorationNight(state.restoration, today, RESTORATION_PROJECTS, state.rulesVersion);
  const steps = stepsOf(r.project);
  const progressOf = (step: number) => (steps === 0 ? 0 : Math.min(1, step / steps));
  const finished = isFinished(r);
  const stepsTonight =
    !finished && r.tendedOn !== null && r.tendedOn >= r.steppedOn && r.step < steps;
  return {
    project: r.project,
    scene: restorationProject(r.project)?.scene ?? null,
    step: r.step,
    steps,
    progress: progressOf(r.step),
    finished,
    stepsTonight,
    progressTonight: progressOf(stepsTonight ? r.step + 1 : r.step),
    done: r.done,
  };
};
