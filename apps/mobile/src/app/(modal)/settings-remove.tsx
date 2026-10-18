import { ModalRoot } from '../../features/settings/kit/modal-root';
import { RemoveSheet } from '../../features/settings/farm/farm-sheets';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { farm, person } = useParams('farm', 'person');
  return (
    <ModalRoot sheet>
      <RemoveSheet farm={farm} person={person} />
    </ModalRoot>
  );
}
