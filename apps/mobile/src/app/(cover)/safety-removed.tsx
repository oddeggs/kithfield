import { ModalRoot } from '../../features/settings/kit/modal-root';
import { RemovedScreen } from '../../features/safety/removed-screen';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return (
    <ModalRoot>
      <RemovedScreen farm={farm} />
    </ModalRoot>
  );
}
