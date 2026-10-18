import { FarmLandScreen } from '../../../features/settings/farm/edit-screens';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return <FarmLandScreen farm={farm} />;
}
