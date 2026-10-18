import { ModalRoot } from '../../features/settings/kit/modal-root';
import { NoteSheet } from '../../features/safety/note-sheet';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { id } = useParams('id');
  return (
    <ModalRoot>
      <NoteSheet id={id} />
    </ModalRoot>
  );
}
