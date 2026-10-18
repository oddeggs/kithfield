import { ModalRoot } from '../../features/settings/kit/modal-root';
import { AppealSheet } from '../../features/safety/appeal-sheet';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { action } = useParams('action');
  return (
    <ModalRoot sheet>
      <AppealSheet action={action} />
    </ModalRoot>
  );
}
