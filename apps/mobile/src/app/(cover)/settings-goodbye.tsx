import { ModalRoot } from '../../features/settings/kit/modal-root';
import { GoodbyeScreen } from '../../features/settings/account/goodbye-screen';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { name, species } = useParams('name', 'species');
  return (
    <ModalRoot>
      <GoodbyeScreen name={name} species={species} />
    </ModalRoot>
  );
}
