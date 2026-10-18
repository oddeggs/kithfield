import { MembersScreen } from '../../../features/settings/farm/members-screen';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return <MembersScreen farm={farm} />;
}
