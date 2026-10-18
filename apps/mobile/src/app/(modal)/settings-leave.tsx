import { ModalRoot } from '../../features/settings/kit/modal-root';
import { LeaveSheet } from '../../features/settings/farm/farm-sheets';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { farm } = useParams('farm');
  return (
    <ModalRoot sheet>
      <LeaveSheet farm={farm} />
    </ModalRoot>
  );
}
