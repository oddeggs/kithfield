import { ModalRoot } from '../../features/settings/kit/modal-root';
import { ReportSheet } from '../../features/safety/report-sheet';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { farm, seq, person } = useParams('farm', 'seq', 'person');
  const n = Number(seq);
  return (
    <ModalRoot sheet>
      <ReportSheet
        farm={farm}
        target={
          seq !== '' && Number.isInteger(n) && n > 0
            ? { about: 'event', seq: n }
            : { about: 'person', person }
        }
      />
    </ModalRoot>
  );
}
