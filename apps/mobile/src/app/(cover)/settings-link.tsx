import { ModalRoot } from '../../features/settings/kit/modal-root';
import { LinkScreen } from '../../features/settings/account/link-screen';

export default function Route() {
  return (
    <ModalRoot>
      <LinkScreen />
    </ModalRoot>
  );
}
