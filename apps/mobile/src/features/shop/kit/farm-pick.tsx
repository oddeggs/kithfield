import type { FarmId, FarmList } from '@kithfield/contracts';
import { useEffect, useState } from 'react';

import { useDataClient } from '../../../data/react';
import { ListGroup, ListRow } from '../../../ui/components/list-row';
import { useLocale } from '../../../ui/locale/locale-provider';
import { InfoNote, Title } from './bits';
import { Header, PaperPage } from './layout';
import { ScreenLoading } from './screen-loading';

/**
 * Which farm something shared is for, when the shop was opened without one: one farm is chosen
 * at once; several are listed; none says so.
 */
export function FarmPick({ onPick }: { readonly onPick: (farm: FarmId) => void }) {
  const { api } = useDataClient();
  const { t } = useLocale();
  const [farms, setFarms] = useState<FarmList['farms'] | null>(null);
  useEffect(() => {
    let live = true;
    api.farms().then(
      (list) => live && setFarms(list.farms.filter((f) => f.kind === 'farm')),
      () => live && setFarms([]),
    );
    return () => {
      live = false;
    };
  }, [api]);
  const only = farms?.length === 1 ? farms[0] : undefined;
  useEffect(() => {
    if (only) onPick(only.farm);
  }, [only, onPick]);
  if (farms === null || only) return <ScreenLoading />;
  return (
    <PaperPage header={<Header glass={false} />}>
      {farms.length === 0 ? (
        <InfoNote text={t('shop.theme.noFarm')} />
      ) : (
        <>
          <Title text={t('shop.pickFarm')} size={24} />
          <ListGroup>
            {farms.map((f) => (
              <ListRow key={f.farm} title={f.name ?? ''} onPress={() => onPick(f.farm)} />
            ))}
          </ListGroup>
        </>
      )}
    </PaperPage>
  );
}
