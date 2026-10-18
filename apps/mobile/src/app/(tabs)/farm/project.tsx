import { useLocalSearchParams } from 'expo-router';

import { ProjectScreen } from '../../../features/rhythm/project-screen';

/** The farm's restoration project: `farm`. */
export default function Project() {
  const { farm } = useLocalSearchParams<{ farm: string }>();
  return farm ? <ProjectScreen farm={farm} /> : null;
}
