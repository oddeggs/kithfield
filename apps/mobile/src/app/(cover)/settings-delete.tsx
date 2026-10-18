import { ModalRoot } from '../../features/settings/kit/modal-root';
import { DeleteAccountScreen } from '../../features/settings/account/delete-screen';

export default function Route() {
  return (
    <ModalRoot>
      <DeleteAccountScreen />
    </ModalRoot>
  );
}
