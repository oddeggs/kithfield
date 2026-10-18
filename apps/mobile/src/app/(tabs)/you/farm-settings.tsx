import { FarmSettingsScreen } from '../../../features/settings/farm/farm-settings-screen';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return <FarmSettingsScreen farm={farm} />;
}
