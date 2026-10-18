import { NotificationsScreen } from '../../../features/settings/farm/notifications-screen';
import { useParams } from '../../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return <NotificationsScreen farm={farm} />;
}
