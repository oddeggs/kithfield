import { ModalRoot } from '../../features/settings/kit/modal-root';
import { QuietPorch } from '../../features/safety/quiet-porch';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { name, species } = useParams('name', 'species');
  return (
    <ModalRoot>
      <QuietPorch name={name} species={species} />
    </ModalRoot>
  );
}
