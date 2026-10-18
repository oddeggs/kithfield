import { ModalRoot } from '../../features/settings/kit/modal-root';
import { BlockSheet } from '../../features/safety/block-sheet';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { person, farm, name } = useParams('person', 'farm', 'name');
  return (
    <ModalRoot sheet>
      <BlockSheet person={person} {...(farm ? { farm } : {})} {...(name ? { name } : {})} />
    </ModalRoot>
  );
}
