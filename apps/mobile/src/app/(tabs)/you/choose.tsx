import { ChooseScreen, isChoiceSetting } from '../../../features/settings/settings/choose-screen';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { setting } = useParams('setting');
  return <ChooseScreen setting={isChoiceSetting(setting) ? setting : 'nudges'} />;
}
