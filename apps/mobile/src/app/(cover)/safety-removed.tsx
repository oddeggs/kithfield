import { ModalRoot } from '../../features/settings/kit/modal-root';
import { RemovedScreen } from '../../features/safety/removed-screen';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { farm, name, by } = useParams('farm', 'name', 'by');
  return (
    <ModalRoot>
      <RemovedScreen farm={farm} farmName={name} by={by === 'safety' ? 'safety' : 'keeper'} />
    </ModalRoot>
  );
}
