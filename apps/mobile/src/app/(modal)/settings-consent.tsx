import { ModalRoot } from '../../features/settings/kit/modal-root';
import { isAiFeature } from '../../features/settings/ai/consent';
import { ConsentSheet } from '../../features/settings/ai/consent-sheet';
import { useParams } from '../../features/settings/params';

export default function Route() {
  const { feature, farm } = useParams('feature', 'farm');
  return (
    <ModalRoot>
      <ConsentSheet
        feature={isAiFeature(feature) ? feature : 'captions'}
        {...(farm ? { farm } : {})}
      />
    </ModalRoot>
  );
}
