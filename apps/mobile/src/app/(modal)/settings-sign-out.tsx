import { ModalRoot } from '../../features/settings/kit/modal-root';
import { SignOutSheet } from '../../features/settings/account/sign-out-sheet';

export default function Route() {
  return (
    <ModalRoot sheet>
      <SignOutSheet />
    </ModalRoot>
  );
}
