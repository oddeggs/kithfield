import { InviteScreen } from '../../../features/settings/farm/invite-screen';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return <InviteScreen farm={farm} />;
}
