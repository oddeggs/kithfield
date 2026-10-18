import { ModalRoot } from '../../features/settings/kit/modal-root';
import { GoodbyeScreen } from '../../features/settings/account/goodbye-screen';

export default function Route() {
  return (
    <ModalRoot>
      <GoodbyeScreen />
    </ModalRoot>
  );
}
